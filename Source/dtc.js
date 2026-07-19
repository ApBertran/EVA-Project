const fs = require('fs');
const os = require('os');
const path = require('path');

const USER_DB_PATH = path.join(os.homedir(), '.eva-dtc.json');

const SYSTEMS = { P: 'Powertrain', C: 'Chassis', B: 'Body', U: 'Network' };

const SUBSYSTEMS = {
  P: {
    0: 'Fuel and air metering / auxiliary emission controls',
    1: 'Fuel and air metering',
    2: 'Fuel and air metering (injector circuit)',
    3: 'Ignition system or misfire',
    4: 'Auxiliary emission controls',
    5: 'Vehicle speed control, idle control, auxiliary inputs',
    6: 'Computer output circuits',
    7: 'Transmission',
    8: 'Transmission',
    9: 'Transmission / control module'
  }
};

const ENGINE_PROFILE = {
  cylinders: 6,
  banks: 2,
  note: '3.8L Essex V6 - misfire codes run P0301-P0306 only'
};

const DEFINITIONS = {
  P0100: 'Mass or Volume Air Flow Circuit Malfunction',
  P0101: 'Mass or Volume Air Flow Circuit Range/Performance Problem',
  P0102: 'Mass or Volume Air Flow Circuit Low Input',
  P0103: 'Mass or Volume Air Flow Circuit High Input',
  P0106: 'Manifold Absolute Pressure/Barometric Pressure Circuit Range/Performance',
  P0107: 'Manifold Absolute Pressure/Barometric Pressure Circuit Low Input',
  P0108: 'Manifold Absolute Pressure/Barometric Pressure Circuit High Input',
  P0110: 'Intake Air Temperature Circuit Malfunction',
  P0112: 'Intake Air Temperature Circuit Low Input',
  P0113: 'Intake Air Temperature Circuit High Input',
  P0115: 'Engine Coolant Temperature Circuit Malfunction',
  P0116: 'Engine Coolant Temperature Circuit Range/Performance Problem',
  P0117: 'Engine Coolant Temperature Circuit Low Input',
  P0118: 'Engine Coolant Temperature Circuit High Input',
  P0120: 'Throttle Position Sensor/Switch A Circuit Malfunction',
  P0121: 'Throttle Position Sensor/Switch A Circuit Range/Performance Problem',
  P0122: 'Throttle Position Sensor/Switch A Circuit Low Input',
  P0123: 'Throttle Position Sensor/Switch A Circuit High Input',
  P0125: 'Insufficient Coolant Temperature for Closed Loop Fuel Control',
  P0128: 'Coolant Thermostat Below Regulating Temperature',
  P0130: 'O2 Sensor Circuit Malfunction (Bank 1 Sensor 1)',
  P0131: 'O2 Sensor Circuit Low Voltage (Bank 1 Sensor 1)',
  P0132: 'O2 Sensor Circuit High Voltage (Bank 1 Sensor 1)',
  P0133: 'O2 Sensor Circuit Slow Response (Bank 1 Sensor 1)',
  P0134: 'O2 Sensor Circuit No Activity Detected (Bank 1 Sensor 1)',
  P0135: 'O2 Sensor Heater Circuit Malfunction (Bank 1 Sensor 1)',
  P0136: 'O2 Sensor Circuit Malfunction (Bank 1 Sensor 2)',
  P0141: 'O2 Sensor Heater Circuit Malfunction (Bank 1 Sensor 2)',
  P0150: 'O2 Sensor Circuit Malfunction (Bank 2 Sensor 1)',
  P0151: 'O2 Sensor Circuit Low Voltage (Bank 2 Sensor 1)',
  P0152: 'O2 Sensor Circuit High Voltage (Bank 2 Sensor 1)',
  P0153: 'O2 Sensor Circuit Slow Response (Bank 2 Sensor 1)',
  P0154: 'O2 Sensor Circuit No Activity Detected (Bank 2 Sensor 1)',
  P0155: 'O2 Sensor Heater Circuit Malfunction (Bank 2 Sensor 1)',
  P0156: 'O2 Sensor Circuit Malfunction (Bank 2 Sensor 2)',
  P0161: 'O2 Sensor Heater Circuit Malfunction (Bank 2 Sensor 2)',
  P0171: 'System Too Lean (Bank 1)',
  P0172: 'System Too Rich (Bank 1)',
  P0174: 'System Too Lean (Bank 2)',
  P0175: 'System Too Rich (Bank 2)',
  P0300: 'Random/Multiple Cylinder Misfire Detected',
  P0301: 'Cylinder 1 Misfire Detected',
  P0302: 'Cylinder 2 Misfire Detected',
  P0303: 'Cylinder 3 Misfire Detected',
  P0304: 'Cylinder 4 Misfire Detected',
  P0305: 'Cylinder 5 Misfire Detected',
  P0306: 'Cylinder 6 Misfire Detected',
  P0320: 'Ignition/Distributor Engine Speed Input Circuit Malfunction',
  P0325: 'Knock Sensor 1 Circuit Malfunction (Bank 1)',
  P0330: 'Knock Sensor 2 Circuit Malfunction (Bank 2)',
  P0335: 'Crankshaft Position Sensor A Circuit Malfunction',
  P0340: 'Camshaft Position Sensor Circuit Malfunction',
  P0401: 'Exhaust Gas Recirculation Flow Insufficient Detected',
  P0402: 'Exhaust Gas Recirculation Flow Excessive Detected',
  P0411: 'Secondary Air Injection System Incorrect Flow Detected',
  P0420: 'Catalyst System Efficiency Below Threshold (Bank 1)',
  P0430: 'Catalyst System Efficiency Below Threshold (Bank 2)',
  P0440: 'Evaporative Emission Control System Malfunction',
  P0442: 'Evaporative Emission Control System Leak Detected (small leak)',
  P0443: 'Evaporative Emission Control System Purge Control Valve Circuit Malfunction',
  P0446: 'Evaporative Emission Control System Vent Control Circuit Malfunction',
  P0455: 'Evaporative Emission Control System Leak Detected (gross leak)',
  P0500: 'Vehicle Speed Sensor Malfunction',
  P0505: 'Idle Control System Malfunction',
  P0506: 'Idle Control System RPM Lower Than Expected',
  P0507: 'Idle Control System RPM Higher Than Expected',
  P0603: 'Internal Control Module Keep Alive Memory (KAM) Error',
  P0605: 'Internal Control Module ROM Error',
  P0703: 'Torque Converter/Brake Switch B Circuit Malfunction',
  P0720: 'Output Speed Sensor Circuit Malfunction',
  P0740: 'Torque Converter Clutch Circuit Malfunction',
  P0743: 'Torque Converter Clutch Circuit Electrical',
  P0316: 'Misfire Detected on Startup (first 1000 revolutions)',
  P1000: 'OBD-II readiness monitors not complete (drive cycle incomplete)',
  P1400: 'DPFE Sensor Circuit Low Voltage',
  P1401: 'DPFE Sensor Circuit High Voltage',
  P1405: 'DPFE Sensor Upstream Hose Off or Plugged',
  P1406: 'DPFE Sensor Downstream Hose Off or Plugged'
};

const PATTERNS = [
  {
    when: (codes) => codes.includes('P0171') && codes.includes('P0174',),
    title: 'Both banks lean at once',
    detail: 'P0171 and P0174 together point at a shared air leak - intake manifold or its gaskets - rather than a single-bank sensor. Also check MAF contamination and PCV/vacuum hoses.'
  },
  {
    when: (codes) => codes.some((c) => /^P030[1-6]$/.test(c)) && codes.includes('P0316'),
    title: 'Misfire including startup',
    detail: 'Startup misfire alongside a cylinder-specific code can indicate coolant intrusion from a lower intake gasket. On this waste-spark engine, a failing coil pack shows as paired misfires on companion cylinders.'
  },
  {
    when: (codes) => codes.includes('P0401') || codes.some((c) => ['P1400', 'P1401', 'P1405', 'P1406'].includes(c)),
    title: 'EGR / DPFE',
    detail: 'The original aluminium-body DPFE sensor on this engine traps moisture, corrodes and drifts low. Check the two silicone hoses first - they harden and blow off in that hot location.'
  }
];

function matchPatterns(codes) {
  return PATTERNS.filter((p) => {
    try {
      return p.when(codes);
    } catch (e) {
      return false;
    }
  }).map(({ title, detail }) => ({ title, detail }));
}

function loadUserDefinitions() {
  try {
    return JSON.parse(fs.readFileSync(USER_DB_PATH, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveUserDefinition(code, text) {
  const db = loadUserDefinitions();
  db[String(code).toUpperCase()] = String(text).slice(0, 300);
  const tmp = `${USER_DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, USER_DB_PATH);
  return db;
}

function decodeStructure(code) {
  const c = String(code).toUpperCase();
  const system = SYSTEMS[c[0]] || 'Unknown';
  const secondDigit = c[1];
  const manufacturerSpecific = secondDigit === '1' || secondDigit === '3';
  const subsystem = c[0] === 'P' ? SUBSYSTEMS.P[parseInt(c[2], 16)] || null : null;
  return {
    system,
    manufacturerSpecific,
    standard: !manufacturerSpecific,
    subsystem
  };
}

function decodeRawPair(byte1, byte2) {
  if (byte1 === 0 && byte2 === 0) return null;
  const systemChar = ['P', 'C', 'B', 'U'][(byte1 >> 6) & 0x03];
  const d1 = (byte1 >> 4) & 0x03;
  const d2 = byte1 & 0x0f;
  const d3 = (byte2 >> 4) & 0x0f;
  const d4 = byte2 & 0x0f;
  return `${systemChar}${d1}${d2.toString(16).toUpperCase()}${d3.toString(16).toUpperCase()}${d4
    .toString(16)
    .toUpperCase()}`;
}

function lookup(code) {
  const c = String(code).toUpperCase();
  const structure = decodeStructure(c);
  const user = loadUserDefinitions();
  const definition = user[c] || DEFINITIONS[c] || null;
  return {
    code: c,
    definition,
    source: user[c] ? 'user' : definition ? 'builtin' : null,
    ...structure
  };
}

module.exports = {
  ENGINE_PROFILE,
  matchPatterns,
  lookup,
  decodeStructure,
  decodeRawPair,
  saveUserDefinition,
  loadUserDefinitions,
  USER_DB_PATH,
  DEFINITION_COUNT: Object.keys(DEFINITIONS).length
};
