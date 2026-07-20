# EVA / JARVIS — handoff

Written 2026-07-20. Everything a new session needs to continue this work.

---

## 1. What this is

A carputer head unit running on a Raspberry Pi 4 in a **2000 Ford Mustang,
3.8L Essex V6, 5-speed T5 manual**. Electron + Express + socket.io, rendering
to a 1920×1080 HDMI panel.

**Two people, two cars, one codebase:**

| | Owner | Car | Brand |
|---|---|---|---|
| EVA | Alex (`ApBertran`, repo owner) | silver/black, black interior, teal cluster | teal accents |
| JARVIS | Morgane (his sister) | white, beige interior | Hot Rod red accents |

**JARVIS is a sub-version, not a fork.** Same codebase. `Source/branding.js`
holds one constant deciding which car the unit thinks it is. It resolves to
`eva` when config is absent, so the unit reverts on its own — the physical head
unit belongs to Alex and is only lent out.

Thomas (`tbertran`) is the account doing the work; PRs come from his fork.

---

## 2. THE BLOCKER — read this first

**The Pi's 12V→5V DC-DC converter is failing and it is blocking everything.**

It browned out or fully died **five times on 2026-07-19**, including once
**mid-drive with the engine running normally** (IMU and OBD both stopped within
0.14s of each other — that is a power cut, not a software crash). At time of
writing the Pi is **unpowered and unreachable**.

`vcgencmd get_throttled` returned `0x50005` repeatedly = under-voltage now,
throttled now, and both latched since boot. ARM was capped at **600 MHz of
1800**, GPU at its floor. Temperature 41°C, so not thermal.

**Repeatable trigger: starting Bluetooth audio.** The Pi does not carry the
audio (phone streams straight to the speakers) but the radio's transmit spike
tips an already-marginal supply.

**The fix** (researched, not yet bought): an adjustable XL4015-based 5A buck
converter, **set to 5.1–5.2V**, wired with 18AWG. The Pi flags under-voltage
below 4.63V; a converter set to exactly 5.0V loses the rest across the cable.
XL4015 is recommended over LM2596, which is obsolete and widely counterfeited.
~$15. Optional supercapacitor UPS (~$25) gives 10–45s to shut down cleanly,
which is what makes Morgane's kill-switch safe. See §9.

**Do not attribute lag, flicker or crashes to software until this is fixed.**
Several hours were spent optimising against a CPU running at one third speed.

---

## 3. Repo state

- Working branch: **`morgane`**
- `main` has PR #6 merged (all of Alex's 2026-07-19 work)
- **PR #7** — `morgane` → main, JARVIS build. OPEN
- **PR #8** — `eva-portable` → main, brand-agnostic work ported to EVA. OPEN

**Uncommitted on `morgane` at handoff time** (games + Bluetooth rename):
```
M Source/bluetooth.js  branding.js  gui.html  lights.py  logs.js
M Source/main.js  sliders.js  styleGUI.css  styleWelcome.css  welcomeMessage.html
? Source/games.js  gamesArcade.js  words-answers.txt  words-valid.txt
```
**Commit these before doing anything else.**

`MORGANE-FEATURES.md` is the running log of her requests and which items are
worth pulling into EVA. `LED-WIRING.md` documents the LED circuit.

---

## 4. Hardware

| Item | State |
|---|---|
| Pi 4 (4GB, Bookworm, aarch64) | **UNPOWERED** — converter failing |
| 1920×1080 HDMI panel | works. **No software brightness control** (HDMI, not DSI) |
| Touchscreen | **single-touch — reports as a mouse (`mouse0`)**. No multi-touch games |
| BerryIMU v3 (LSM6DSL + LIS3MDL) | works, 100.0 Hz, I2C on GPIO 2/3 |
| OBDLink SX (USB, FTDI 0403:6015) | works, verified on car. SAE J1850 PWM, ~10 PIDs/sec total |
| Bluetooth (BlueZ 5.66) | works. Paired with Alex's iPhone, AVRCP confirmed |
| WiFi (`nmcli`) | works |
| GPS | **not owned yet** — USB unit intended |
| Camera | none |
| LED strip (Govee H6190, 12V 1.5A analog RGB) | **not wired** — needs 3 MOSFETs + resistors |
| Adjustable shocks | servos not bought; damping is 1–32 clicks, UI only |
| RTC | **none** — offline logs get wrong timestamps |

**Pin assignments:** IMU on GPIO 2/3 (I2C). LEDs planned on GPIO 12/13/19
(avoids GPIO 18, which shares PWM hardware with onboard audio via
`dtparam=audio=on`).

---

## 5. Deploying

The Pi holds a git clone at `~/EVA-Project` but **work is deployed by rsync from
the Mac**, not git pull:

```bash
rsync -az Source/<files> EVA@192.168.86.27:~/EVA-Project/Source/
ssh EVA@192.168.86.27 'P="ele""ctron/dist"; pkill -f "$P"; cd ~/EVA-Project/Source && DISPLAY=:0 nohup npx electron . >/tmp/eva.log 2>&1 &'
```

**Two traps:**

1. **`pkill -f electron` matches your own SSH command and kills it.** Split the
   string (`P="ele""ctron/dist"`) so the pattern does not appear literally.
2. **Electron needs `DISPLAY=:0`** when launched over SSH.

Screenshots: `grim` (Wayland) with `XDG_RUNTIME_DIR` and `WAYLAND_DISPLAY=wayland-1`
set. Input injection: `xdotool` with `DISPLAY=:0`.

**Do not sleep inside SSH commands to wait for the app.** It blocks for
30+ seconds, times out into the background, and produces no feedback. Morgane
called this out directly. If someone is sitting in front of the panel, deploy,
restart, and **ask them what they see** rather than screenshotting.

---

## 6. What is built

**Core:** g-force gauge (100 Hz, despiked), day/night theme from offline NOAA
solar math, on-screen keyboard, settings persisted immediately to
`~/.eva-config.json` via atomic `tmp → fsync → rename`.

**Logging:** append-only JSONL, `fsync` every 5s, crash recovery. Folders,
rename/move/delete, purge by age, USB export, thumbnails, storage readout.
Survived a hard power cut with 745s of data intact.

**Analysis:** friction circle, timeline, GPS track, multi-channel OBD graphs
with drag-to-zoom, gear detection, MAF-derived fuel, tire calibration.

**OBD-II:** 23 PIDs on a fast/slow schedule, DTC read/clear, 78 definitions
plus structural J2012 decoding.

**Music:** Bluetooth AVRCP control of the paired phone — play/pause/skip/volume
and track metadata, all offline. Full-screen tab.

**Status pills:** GPS, OBD, WiFi, BT, and a larger Games button. WiFi and BT
open connect modals.

**Lights:** `lights.py` drives PWM on GPIO 12/13/19. Replaces dead
Arduino-over-serial code. Colour persists and restores at boot.

**Games** (`games.js` portal + `gamesArcade.js`): 9 games, solo/2-player portal,
player profiles with colours, leaderboards, per-player saves, personal-best and
leaderboard-record celebration screens. Games are gated on OBD speed = 0.

Solo: Start Lights (F1 gantry), 2048 (saveable), Wordle, Memory, Snake,
Breakout, Flappy.
Duo (all turn-based): Start Lights duel, Memory, Connect Four, Dots & Boxes.

Wordle uses two local lists: `words-answers.txt` (860 common words, frequency
ranked ∩ system dictionary) and `words-valid.txt` (8,506 five-letter words).

---

## 7. Known bugs, ranked

1. **Log duration reads `0s`** in analysis summaries — never propagated from meta.
2. **Accelerometer reads 1.025 g at rest** — 2.5% scale error skewing every g-number.
3. **Games not verified** — Flappy's optimisation and the BT rename were deployed
   but the Pi died before anyone confirmed they work.
4. Sensor calibration is **per-unit, not per-car** — Alex's axes are wrong in
   Morgane's Mustang. She must run it herself.
5. Head unit is on **manual day/night**, not Auto, from testing.
6. MapLibre performance on the Pi is unproven; the Maps tab shows "no map source".

---

## 8. Gotchas that cost real time

**`rem` is anchored to viewport WIDTH** (`html { font-size: 1.5625vw }`). Any
layout sized purely in rem ignores the vertical budget and overflows a 1080p
screen. This caused phantom scrollbars in the music tab, Wordle, 2048, Connect
Four, Drag Tree and the games grid — **six separate times**. Size from `vh` with
`rem` as a ceiling.

**Never call `getComputedStyle` inside an animation loop.** It forces a style
recalculation every frame. This was the main cause of Flappy's lag; Snake had it
too. Read theme colours once at game start.

**Move per second, not per frame.** The Pi throttles hard, so per-frame motion
crawls. Delta-time everything.

**`localStorage` is blocked on `file://`** ("Access is denied"). State the
renderer needs before first paint must come from the main process via URL query
params — that is how theme, brand and accent are passed.

**BlueZ cancels discovery when the D-Bus client that started it disconnects.**
A one-shot `busctl call StartDiscovery` scans for nothing. Hold a `bluetoothctl`
process open.

**`pigpio` prints its error banner to stdout** when the daemon is absent,
corrupting any JSON protocol on that stream. The IMU logger had the same class
of bug with `IMU.detectIMU()`. Mute stdout during probes.

**Verify claims against the code, not memory.** Multiple wrong assertions this
session: a Mustang wireframe drawn from specifications rather than a reference
(scrapped), a Govee strip assumed to be RGBIC when the repo's own Arduino sketch
proved it analog, and "calibration was never run" when the config plainly showed
otherwise. **Check first.**

---

## 9. Backlog and ideas explored

**Committed asks, not yet built:**
- Standby mode — photo slideshow with contrast-aware clock overlay (Alex asked;
  waiting on his photos)
- Spotify Web API layer for album art and library browsing (AVRCP cannot carry
  either; needs Premium + OAuth + network)
- GPS point-of-interest markers cross-linked into the analysis graphs
- Discord webhook to push graphs to a phone (Alex said back-burner)
- Damper tuning phases 2–3: vertical-accel band split (0.5–2 Hz body vs
  10–20 Hz wheel hop), roll/pitch transient response
- Damping presets (cruising / canyon / track) with servo control
- OBDwiz Ford DTC definitions if Alex obtains them (base install is generic-only;
  needs the $84.95 Ford Enhanced add-on)

**Researched 2026-07-20, presented as a top-5 per category:**

*Hardware, by impact per dollar:* ignition-sense DC-DC converter (~$30) →
DS3231 RTC (~$5, fixes wrong offline timestamps) → USB GPS (~$20) → USB camera
(~$25) → rotary encoder (~$3, the only input usable without looking).
Wildcard: RTL-SDR (~$30) for FM radio; note the 2000 Mustang has **no factory
TPMS** (not mandated until 2007).

*Utilities:* G-force-triggered dashcam (camera + existing IMU — the strongest
"better than a phone" feature) → battery/charging health trend → cold-start
guard → fuel log and cost per mile → maintenance by real OBD miles.

*Games worth adding:* Block Blast-style block puzzle (most-downloaded game of
2026, 366M installs) → Solitaire → Sudoku → Hangman (**reuses the word list
already on the Pi**) → Chess or Checkers for deeper two-player.

*Improvements:* **sound — there is none anywhere in the system**, no tap
feedback, no game audio, no alerts; then standby mode; then the `dur=0s` bug;
then the accelerometer scale error; then damper phases 2–3.

---

## 10. Suggested order

1. Commit the uncommitted work (§3).
2. Wait for the converter. Nothing is trustworthy until then.
3. When it is back: `vcgencmd get_throttled` should read `0x0`. Verify the games,
   Flappy performance, and the JARVIS Bluetooth rename — none were confirmed.
4. Then sound, which is pure software and lifts everything already built.
