const fs = require('fs');
const { EventEmitter } = require('events');
const { execFileSync, spawn } = require('child_process');

const dtc = require('./dtc');

const DEFAULT_PORT = '/dev/ttyUSB0';
const DEFAULT_BAUD = 115200;
const PROMPT = '>';


const PIDS = {
  '04': { tier: 'fast', name: 'Engine Load', unit: '%', bytes: 1, decode: (b) => (b[0] * 100) / 255, group: 'core' },
  '05': { tier: 'slow', name: 'Coolant Temp', unit: 'C', bytes: 1, decode: (b) => b[0] - 40, group: 'core' },
  '06': { tier: 'slow', name: 'Short Fuel Trim B1', unit: '%', bytes: 1, decode: (b) => ((b[0] - 128) * 100) / 128, group: 'fuel' },
  '07': { tier: 'slow', name: 'Long Fuel Trim B1', unit: '%', bytes: 1, decode: (b) => ((b[0] - 128) * 100) / 128, group: 'fuel' },
  '08': { tier: 'slow', name: 'Short Fuel Trim B2', unit: '%', bytes: 1, decode: (b) => ((b[0] - 128) * 100) / 128, group: 'fuel' },
  '09': { tier: 'slow', name: 'Long Fuel Trim B2', unit: '%', bytes: 1, decode: (b) => ((b[0] - 128) * 100) / 128, group: 'fuel' },
  '0B': { tier: 'fast', name: 'Intake MAP', unit: 'kPa', bytes: 1, decode: (b) => b[0], group: 'engine' },
  '0C': { tier: 'fast', name: 'RPM', unit: 'rpm', bytes: 2, decode: (b) => (b[0] * 256 + b[1]) / 4, group: 'core' },
  '0D': { tier: 'fast', name: 'Vehicle Speed', unit: 'km/h', bytes: 1, decode: (b) => b[0], group: 'core' },
  '0E': { tier: 'slow', name: 'Timing Advance', unit: 'deg', bytes: 1, decode: (b) => b[0] / 2 - 64, group: 'engine' },
  '0F': { tier: 'slow', name: 'Intake Air Temp', unit: 'C', bytes: 1, decode: (b) => b[0] - 40, group: 'engine' },
  '10': { tier: 'fast', name: 'MAF Rate', unit: 'g/s', bytes: 2, decode: (b) => (b[0] * 256 + b[1]) / 100, group: 'engine' },
  '11': { tier: 'fast', name: 'Throttle Position', unit: '%', bytes: 1, decode: (b) => (b[0] * 100) / 255, group: 'core' },
  '14': { tier: 'slow', name: 'O2 B1S1 Voltage', unit: 'V', bytes: 2, decode: (b) => b[0] / 200, group: 'o2' },
  '15': { tier: 'slow', name: 'O2 B1S2 Voltage', unit: 'V', bytes: 2, decode: (b) => b[0] / 200, group: 'o2' },
  '18': { tier: 'slow', name: 'O2 B2S1 Voltage', unit: 'V', bytes: 2, decode: (b) => b[0] / 200, group: 'o2' },
  '19': { tier: 'slow', name: 'O2 B2S2 Voltage', unit: 'V', bytes: 2, decode: (b) => b[0] / 200, group: 'o2' },
  '1F': { tier: 'slow', name: 'Run Time', unit: 's', bytes: 2, decode: (b) => b[0] * 256 + b[1], group: 'misc' },
  '2F': { tier: 'slow', name: 'Fuel Level', unit: '%', bytes: 1, decode: (b) => (b[0] * 100) / 255, group: 'misc' },
  '33': { tier: 'slow', name: 'Barometric Pressure', unit: 'kPa', bytes: 1, decode: (b) => b[0], group: 'misc' },
  '42': { tier: 'slow', name: 'Module Voltage', unit: 'V', bytes: 2, decode: (b) => (b[0] * 256 + b[1]) / 1000, group: 'misc' },
  '46': { tier: 'slow', name: 'Ambient Air Temp', unit: 'C', bytes: 1, decode: (b) => b[0] - 40, group: 'misc' },
  '5C': { tier: 'slow', name: 'Engine Oil Temp', unit: 'C', bytes: 1, decode: (b) => b[0] - 40, group: 'misc', unlikely: true }
};

const DEFAULT_PIDS = ['0C', '0D', '11', '10', '05', '06', '07', '08', '09'];

class ObdLink extends EventEmitter {
  constructor() {
    super();
    this.status = 'disconnected';
    this.detail = null;
    this.port = null;
    this.stream = null;
    this.writeFd = null;
    this.buffer = '';
    this.queue = [];
    this.pending = null;
    this.adapter = null;
    this.voltage = null;
    this.polling = false;
    this.pollTimer = null;
  }

  setStatus(status, detail) {
    this.status = status;
    this.detail = detail || null;
    this.emit('status', this.state());
  }

  state() {
    return {
      status: this.status,
      detail: this.detail,
      port: this.port,
      adapter: this.adapter,
      voltage: this.voltage
    };
  }

  static listPorts() {
    const ports = [];
    for (const prefix of ['ttyUSB', 'ttyACM']) {
      for (let i = 0; i < 8; i++) {
        const p = `/dev/${prefix}${i}`;
        if (fs.existsSync(p)) ports.push(p);
      }
    }
    return ports;
  }

  connect(port, baud) {
    this.disconnect();
    this.port = port || DEFAULT_PORT;
    const rate = Number(baud) || DEFAULT_BAUD;

    if (!fs.existsSync(this.port)) {
      this.setStatus('unavailable', `${this.port} not present`);
      return;
    }

    try {
      execFileSync('stty', ['-F', this.port, String(rate), 'raw', '-echo', '-crtscts']);
    } catch (e) {
      this.setStatus('error', `stty failed: ${e.message}`);
      return;
    }

    try {
      this.writeFd = fs.openSync(this.port, 'r+');
      this.stream = fs.createReadStream('', { fd: this.writeFd, autoClose: false, encoding: 'ascii' });
    } catch (e) {
      this.setStatus('error', `open failed: ${e.message}`);
      return;
    }

    this.stream.on('data', (chunk) => this.ingest(chunk));
    this.stream.on('error', (err) => this.setStatus('error', err.message));

    this.setStatus('connecting');
    this.initialise().catch((e) => this.setStatus('error', e.message));
  }

  async initialise() {
    await this.send('ATZ', 3000);
    await this.send('ATE0');
    await this.send('ATL0');
    await this.send('ATS0');
    await this.send('ATH0');

    const id = await this.send('ATI');
    const stn = await this.send('STI');
    this.adapter = [id, stn].filter((v) => v && !/^\?/.test(v)).join(' / ') || id;

    await this.send('ATSP1');

    const volts = await this.send('ATRV');
    this.voltage = parseFloat(String(volts).replace(/[^\d.]/g, '')) || 0;

    if (this.voltage < 6) {
      this.setStatus('no-vehicle', `adapter ready, no vehicle power (${this.voltage.toFixed(1)}V)`);
    } else {
      this.setStatus('ready', `${this.voltage.toFixed(1)}V`);
    }
  }

  ingest(chunk) {
    this.buffer += chunk;
    if (!this.pending) return;
    if (this.buffer.includes(PROMPT)) {
      const raw = this.buffer.split(PROMPT)[0];
      this.buffer = '';
      const done = this.pending;
      this.pending = null;
      clearTimeout(done.timer);
      done.resolve(
        raw
          .split(/[\r\n]+/)
          .map((l) => l.trim())
          .filter((l) => l && l !== done.command)
          .join(' ')
      );
      this.drain();
    }
  }

  drain() {
    if (this.pending || !this.queue.length) return;
    const next = this.queue.shift();
    this.pending = next;
    this.buffer = '';
    try {
      fs.writeSync(this.writeFd, `${next.command}\r`);
    } catch (e) {
      this.pending = null;
      next.reject(new Error(`write failed: ${e.message}`));
      return;
    }
    next.timer = setTimeout(() => {
      this.pending = null;
      next.resolve('TIMEOUT');
      this.drain();
    }, next.timeout);
  }

  send(command, timeout) {
    return new Promise((resolve, reject) => {
      this.queue.push({ command, timeout: timeout || 2000, resolve, reject });
      this.drain();
    });
  }

  parseDtcResponse(raw, modeByte) {
    const text = String(raw).toUpperCase();
    if (/NO DATA|UNABLE|ERROR|SEARCHING|STOPPED|TIMEOUT/.test(text)) {
      return { codes: [], raw: text };
    }
    const hex = text.replace(/[^0-9A-F]/g, '');
    const idx = hex.indexOf(modeByte);
    if (idx < 0) return { codes: [], raw: text };

    const body = hex.slice(idx + 2);
    const codes = [];
    for (let i = 0; i + 3 < body.length + 1; i += 4) {
      const pair = body.slice(i, i + 4);
      if (pair.length < 4) break;
      const code = dtc.decodeRawPair(parseInt(pair.slice(0, 2), 16), parseInt(pair.slice(2, 4), 16));
      if (code && !codes.includes(code)) codes.push(code);
    }
    return { codes, raw: text };
  }

  async readTroubleCodes() {
    const stored = this.parseDtcResponse(await this.send('03', 5000), '43');
    const pending = this.parseDtcResponse(await this.send('07', 5000), '47');
    return {
      stored: stored.codes.map((c) => dtc.lookup(c)),
      pending: pending.codes.map((c) => dtc.lookup(c)),
      raw: { stored: stored.raw, pending: pending.raw }
    };
  }

  async clearTroubleCodes() {
    const response = await this.send('04', 5000);
    return { ok: /OK|44/i.test(String(response)), raw: String(response) };
  }

  async refreshVoltage() {
    const volts = await this.send('ATRV');
    this.voltage = parseFloat(String(volts).replace(/[^\d.]/g, '')) || 0;
    this.setStatus(this.voltage < 6 ? 'no-vehicle' : 'ready', `${this.voltage.toFixed(1)}V`);
    return this.voltage;
  }


  async readSupportedPids() {
    const supported = new Set();
    for (const base of ['00', '20', '40']) {
      const raw = await this.send(`01${base}`, 4000);
      const hex = String(raw).toUpperCase().replace(/[^0-9A-F]/g, '');
      const marker = `41${base}`;
      const idx = hex.indexOf(marker);
      if (idx < 0) continue;
      const dataHex = hex.slice(idx + 4, idx + 12);
      if (dataHex.length < 8) continue;
      const bits = parseInt(dataHex, 16);
      const offset = parseInt(base, 16);
      for (let i = 0; i < 32; i++) {
        if (bits & (1 << (31 - i))) {
          supported.add((offset + i + 1).toString(16).toUpperCase().padStart(2, '0'));
        }
      }
    }
    return [...supported].filter((p) => PIDS[p]).sort();
  }

  async readPid(pid) {
    const spec = PIDS[pid];
    if (!spec) return null;
    const raw = await this.send(`01${pid}`, 1500);
    const text = String(raw).toUpperCase();
    if (/NO DATA|ERROR|TIMEOUT|UNABLE|\?/.test(text)) return null;
    const hex = text.replace(/[^0-9A-F]/g, '');
    const marker = `41${pid}`;
    const idx = hex.indexOf(marker);
    if (idx < 0) return null;
    const bytes = [];
    for (let i = 0; i < spec.bytes; i++) {
      const pair = hex.slice(idx + 4 + i * 2, idx + 6 + i * 2);
      if (pair.length < 2) return null;
      bytes.push(parseInt(pair, 16));
    }
    const value = spec.decode(bytes);
    return Number.isFinite(value) ? +value.toFixed(2) : null;
  }

  buildSchedule(pids) {
    const fast = pids.filter((p) => PIDS[p] && PIDS[p].tier === 'fast');
    const slow = pids.filter((p) => PIDS[p] && PIDS[p].tier !== 'fast');
    if (!fast.length) return slow.slice();
    const schedule = [];
    const rounds = Math.max(1, slow.length);
    for (let r = 0; r < rounds; r++) {
      schedule.push(...fast);
      if (slow.length) schedule.push(slow[r % slow.length]);
    }
    return schedule;
  }

  startPolling(pids, onSample) {
    this.stopPolling();
    const list = (pids || DEFAULT_PIDS).filter((p) => PIDS[p]);
    if (!list.length) return;
    const schedule = this.buildSchedule(list);
    this.polling = true;
    let index = 0;
    const tick = async () => {
      if (!this.polling) return;
      const pid = schedule[index % schedule.length];
      index++;
      try {
        const value = await this.readPid(pid);
        if (value !== null && onSample) {
          onSample({ t: Date.now(), pid, name: PIDS[pid].name, unit: PIDS[pid].unit, v: value });
        }
      } catch (e) {
        /* keep polling */
      }
      if (this.polling) this.pollTimer = setTimeout(tick, 15);
    };
    tick();
  }

  stopPolling() {
    this.polling = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  disconnect() {
    if (this.stream) {
      this.stream.removeAllListeners();
      this.stream.destroy();
      this.stream = null;
    }
    if (this.writeFd !== null) {
      try {
        fs.closeSync(this.writeFd);
      } catch (e) {
        /* already closed */
      }
      this.writeFd = null;
    }
    this.queue = [];
    this.pending = null;
    this.buffer = '';
  }
}

module.exports = { ObdLink, PIDS, DEFAULT_PIDS };
