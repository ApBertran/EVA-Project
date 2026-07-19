# JARVIS — Morgane's feature list

JARVIS is a sub-version of EVA, not a fork. Same codebase, different name and
palette, so a feature built once works in both cars. Branding lives in
`Source/branding.js` — one constant decides which car this unit thinks it is.

This file exists so Alex can see what Morgane asks for and pull anything he
wants into EVA. Add requests here as they come up.

## How to add a request

Append to **Requested** with a date and enough detail to build from. When
something ships, move it to **Done** with the commit. If Alex adopts it, note
that in **Adopted into EVA** so it is clear which features are shared and which
are JARVIS-only.

---

## Requested

_(nothing yet — Morgane, add yours here)_

Useful things to say when requesting:
- What you want to see or do, and *while driving or while parked?*
- Where it belongs (its own tab, the status bar, inside Logs, etc.)
- Whether it needs internet, GPS, or hardware that is not installed yet

---

## Done

### Rename to JARVIS with a warm palette — 2026-07-19
Her car is white over beige, so the cool teal-on-near-black scheme EVA uses to
sit against a black interior was replaced with amber on warm neutrals.

- Accent: amber `#e0a94f` (day `#7d5010`) in place of teal
- Warning: rose `#f0655a` rather than orange, which would have read as just
  another accent next to amber
- Backgrounds warmed from `#0b0d0e` to `#100e0b`

All eleven colour pairs verified to WCAG AA — night ranges 5.04:1 to 16.83:1,
day 4.67:1 to 14.43:1. Worth keeping that standard: this screen gets read in
direct sun.

---

## Adopted into EVA

_(features Alex pulls across — record them here so both branches stay in sync)_

---

## Inherited from EVA

Already working in JARVIS, since the branch was cut from `main` after PR #6:

| Feature | Notes |
|---|---|
| G-force gauge | 100 Hz IMU, despiked, calibrated axes |
| Logs | folders, purge, USB export, storage readout |
| OBD-II | 23 PIDs, DTC read/clear, gear detection, fuel trim health |
| Analysis | friction circle, timeline, channel graphs with zoom |
| Music | Bluetooth AVRCP control of a paired phone |
| Wi-Fi / Bluetooth | status pills with connect modals |
| Day/night theme | offline sunrise/sunset, no network needed |
| Damping | 1–32 stepper, persisted immediately (servos pending) |

## Known issues inherited

- Log duration reads `0s` in analysis summaries
- Accelerometer reads 1.025 g at rest — a 2.5% scale error worth calibrating out
- Sensor calibration must be run per car; Alex's axes will be wrong for hers
