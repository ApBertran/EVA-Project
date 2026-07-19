const net = require('net');
const fs = require('fs');
const { EventEmitter } = require('events');
const { execFileSync } = require('child_process');

function toDegrees(raw, hemisphere) {
  if (!raw) return null;
  const value = parseFloat(raw);
  if (!isFinite(value)) return null;
  const degrees = Math.floor(value / 100);
  const minutes = value - degrees * 100;
  const decimal = degrees + minutes / 60;
  return hemisphere === 'S' || hemisphere === 'W' ? -decimal : decimal;
}

function parseNMEA(line) {
  if (!line || line[0] !== '$') return null;
  const body = line.split('*')[0];
  const parts = body.split(',');
  const type = parts[0].slice(3);

  if (type === 'RMC') {
    if (parts[2] !== 'A') return { valid: false };
    const lat = toDegrees(parts[3], parts[4]);
    const lon = toDegrees(parts[5], parts[6]);
    if (lat === null || lon === null) return { valid: false };
    const knots = parseFloat(parts[7]);
    const heading = parseFloat(parts[8]);
    return {
      valid: true,
      lat,
      lon,
      speedKph: isFinite(knots) ? knots * 1.852 : null,
      headingDeg: isFinite(heading) ? heading : null
    };
  }

  if (type === 'GGA') {
    const quality = parseInt(parts[6], 10);
    if (!quality) return { valid: false };
    const lat = toDegrees(parts[2], parts[3]);
    const lon = toDegrees(parts[4], parts[5]);
    if (lat === null || lon === null) return { valid: false };
    const alt = parseFloat(parts[9]);
    return {
      valid: true,
      lat,
      lon,
      sats: parseInt(parts[7], 10) || null,
      altM: isFinite(alt) ? alt : null
    };
  }

  return null;
}

class GpsSource extends EventEmitter {
  constructor() {
    super();
    this.status = 'unavailable';
    this.config = null;
    this.lastFix = null;
    this.buffer = '';
    this.socket = null;
    this.stream = null;
    this.retryTimer = null;
  }

  setStatus(status, detail) {
    this.status = status;
    this.emit('status', { status, detail: detail || null, lastFix: this.lastFix });
  }

  connect(config) {
    this.disconnect();
    this.config = config;
    if (!config || !config.mode || config.mode === 'off') {
      this.setStatus('unavailable');
      return;
    }
    this.setStatus('connecting');
    if (config.mode === 'tcp') this.connectTcp(config);
    else if (config.mode === 'serial') this.connectSerial(config);
    else this.setStatus('unavailable', 'unknown mode');
  }

  connectTcp(config) {
    const socket = net.createConnection(
      { host: config.host, port: Number(config.port) || 11123 },
      () => this.setStatus('live')
    );
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => this.ingest(chunk));
    socket.on('error', (err) => this.fail(err.message));
    socket.on('close', () => this.fail('connection closed'));
    this.socket = socket;
  }

  connectSerial(config) {
    const device = config.device || '/dev/ttyACM0';
    if (!fs.existsSync(device)) {
      this.setStatus('unavailable', `${device} not present`);
      return;
    }
    try {
      execFileSync('stty', ['-F', device, String(config.baud || 9600), 'raw', '-echo']);
    } catch (e) {
      /* some adapters need no configuration */
    }
    const stream = fs.createReadStream(device, { encoding: 'utf8' });
    stream.on('data', (chunk) => {
      if (this.status !== 'live') this.setStatus('live');
      this.ingest(chunk);
    });
    stream.on('error', (err) => this.fail(err.message));
    stream.on('close', () => this.fail('device closed'));
    this.stream = stream;
  }

  fail(detail) {
    if (this.status === 'unavailable') return;
    this.setStatus('error', detail);
    this.scheduleRetry();
  }

  scheduleRetry() {
    if (this.retryTimer || !this.config) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.config) this.connect(this.config);
    }, 5000);
  }

  ingest(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop();
    for (const line of lines) {
      const parsed = parseNMEA(line.trim());
      if (!parsed || !parsed.valid) continue;
      this.lastFix = { ...(this.lastFix || {}), ...parsed, t: Date.now() };
      delete this.lastFix.valid;
      this.emit('fix', this.lastFix);
    }
  }

  disconnect() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
    if (this.stream) {
      this.stream.removeAllListeners();
      this.stream.destroy();
      this.stream = null;
    }
    this.buffer = '';
  }
}

module.exports = { GpsSource, parseNMEA };
