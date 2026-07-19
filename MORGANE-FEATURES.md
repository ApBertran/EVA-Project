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

### Boot sequence restyle + red accent — 2026-07-19

Chosen from a live preview rather than described: Terminal monospace,
Hot Rod red, soft glow, and the greeting reworded to "Hello, Morgane".

- **Fade, not typewriter.** Pure opacity over 2.1s with no movement, and
  sequential rather than overlapping - the wordmark resolves first, then
  the greeting begins, so the name lands on its own.
- **Boot is night-only in both themes.** The dark version simply looks
  better, so it no longer lightens during the day.
- **Handoff.** A solid panel in the interface's own background colour
  fades over the boot screen, and the app navigates only once it is fully
  opaque - the interface paints behind a background that already matches,
  so there is no flash between the two. Night and day each fade to their
  own colour.
- **Red accent throughout the interface**, replacing amber. AA verified:
  5.18:1 night, 6.64:1 day.

Worth stealing for EVA: **the handoff.** The boot-to-interface flash
exists in EVA too, it just has not been noticed. It is brand-agnostic -
`--handoff-bg` per theme and a veil element - so it would drop straight in.

Two judgement calls, both reversible:
- Warnings moved red -> amber. A red alert against a red accent stops
  reading as an alert.
- `accent-dim` lightened from `#a33422` to `#d15a40`, which failed
  contrast at 2.82:1.

Underlying fix, which benefits both cars: the stylesheet hardcoded EVA's
teal and orange in **34 places** no other brand could override - which is
why the g-force needle and readout stayed gold after the accent changed.
All of it now flows through `--accent-rgb` / `--warn-rgb`, and the gauge
got its own `--needle` role so it can follow the accent rather than the
warning colour.

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

**Offered, not yet taken:**
- **Boot handoff fade** — removes the flash between boot screen and interface.
  Brand-agnostic, would work in EVA unchanged.
- **`--accent-rgb` / `--warn-rgb` / `--needle` variables** — already on `main`'s
  path via this branch; unblocks retinting anything without touching literals.

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
