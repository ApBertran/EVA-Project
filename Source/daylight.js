const ZENITH_DEG = 90.833;
const FALLBACK_SUNRISE_MIN = 7 * 60;
const FALLBACK_SUNSET_MIN = 19 * 60;

function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000);
}

function solarEvents(date, lat, lon) {
  const rad = Math.PI / 180;
  const n = dayOfYear(date);
  const gamma = ((2 * Math.PI) / 365) * (n - 1 + 0.5);

  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const latRad = lat * rad;
  const cosHa =
    Math.cos(ZENITH_DEG * rad) / (Math.cos(latRad) * Math.cos(decl)) - Math.tan(latRad) * Math.tan(decl);

  if (cosHa > 1) return { polar: 'night' };
  if (cosHa < -1) return { polar: 'day' };

  const ha = Math.acos(cosHa) / rad;
  const sunriseUtcMin = 720 - 4 * (lon + ha) - eqTime;
  const sunsetUtcMin = 720 - 4 * (lon - ha) - eqTime;
  return { sunriseUtcMin, sunsetUtcMin };
}

function localMinutes(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function utcMinutesToLocal(utcMin, date) {
  const offsetMin = -date.getTimezoneOffset();
  let local = utcMin + offsetMin;
  while (local < 0) local += 1440;
  while (local >= 1440) local -= 1440;
  return local;
}

function resolve(options) {
  const date = (options && options.now) || new Date();
  const lat = options && typeof options.lat === 'number' ? options.lat : null;
  const lon = options && typeof options.lon === 'number' ? options.lon : null;
  const nowMin = localMinutes(date);

  if (lat === null || lon === null) {
    const isDay = nowMin >= FALLBACK_SUNRISE_MIN && nowMin < FALLBACK_SUNSET_MIN;
    return {
      mode: isDay ? 'day' : 'night',
      source: 'fallback',
      sunriseMin: FALLBACK_SUNRISE_MIN,
      sunsetMin: FALLBACK_SUNSET_MIN
    };
  }

  const events = solarEvents(date, lat, lon);
  if (events.polar) {
    return { mode: events.polar, source: 'polar', sunriseMin: null, sunsetMin: null };
  }

  const sunriseMin = utcMinutesToLocal(events.sunriseUtcMin, date);
  const sunsetMin = utcMinutesToLocal(events.sunsetUtcMin, date);
  const isDay = sunriseMin < sunsetMin
    ? nowMin >= sunriseMin && nowMin < sunsetMin
    : nowMin >= sunriseMin || nowMin < sunsetMin;

  return {
    mode: isDay ? 'day' : 'night',
    source: 'solar',
    sunriseMin: Math.round(sunriseMin),
    sunsetMin: Math.round(sunsetMin)
  };
}

function formatMinutes(min) {
  if (min === null || min === undefined) return '--:--';
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

const api = { resolve, solarEvents, formatMinutes, FALLBACK_SUNRISE_MIN, FALLBACK_SUNSET_MIN };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.DaylightClient = api;
