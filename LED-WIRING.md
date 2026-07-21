# LED strip wiring — Govee H6190 on the Pi

Analog RGB, common anode. **12V, 1.5A, 18W.** Not addressable — one colour
across the whole strip, three PWM channels.

Confirmed from the original Arduino sketch (`Source/ArduinoLED/ArduinoLED.ino`),
which used `analogWrite` on three separate pins: red 11, green 10, blue 9.

## Parts

| Qty | Part | Note |
|---|---|---|
| 3 | P30N06LE N-channel MOSFET | logic-level. TO-220 |
| 3 | 220Ω resistor | gate series |
| 3 | 10kΩ resistor | gate pull-down — **do not skip** |
| 1 | 12V PSU, 2A+ | separate from the Pi |

**The 10kΩ pull-downs matter.** Pi GPIOs float during boot until something
configures them. Without a pull-down the gates drift and the strip flickers or
comes on full white every time the car starts, until the app loads.

## Pins

| Colour | GPIO | Physical pin |
|---|---|---|
| Red | 12 | 32 |
| Green | 13 | 33 |
| Blue | 19 | 35 |
| Ground | — | 34 (or any GND) |

GPIO 18 is deliberately avoided: `dtparam=audio=on` is set and onboard analog
audio shares that PWM hardware. GPIO 2 and 3 are the IMU's I2C bus — leave alone.

## Circuit

One of these per colour. Three identical copies.

```
   Pi GPIO 12 ──[220Ω]──┬──────────► GATE ┐
   (pin 32)             │                 │
                      [10kΩ]              │   P30N06LE
                        │                 │   (TO-220)
   Pi GND ──────────────┴─────────────► SOURCE ┘
   (pin 34)             │                 │
                        │              DRAIN
                        │                 │
                        │                 ▼
                        │        ┌─────────────────┐
                        │        │  LED STRIP      │
                        │        │  R  G  B  +12V  │
                        │        └──┬──┬──┬────┬───┘
                        │           │  │  │    │
     drain of R MOSFET ─────────────┘  │  │    │
     drain of G MOSFET ────────────────┘  │    │
     drain of B MOSFET ───────────────────┘    │
                        │                      │
   12V PSU  (+) ─────────────────────────────-─┘
   12V PSU  (−) ────────┴─ COMMON GROUND
```

**Common ground is mandatory.** Pi GND and PSU − must be tied together or the
MOSFETs have no reference and won't switch reliably.

**Never feed 12V into the Pi.** The strip's supply touches only the strip and
the MOSFET drains. This Pi already browns out under GPU load on a marginal
converter; 18W of LEDs on its rail would be much worse.

## MOSFET pinout

TO-220 is conventionally **Gate – Drain – Source** left to right, front facing,
with the metal tab tied to Drain. **Verify your specific part before powering
up** — buzz it with a multimeter or check its own markings. Reversed pins is how
you release the smoke.

## Gate drive caveat

The P30N06LE's 0.047Ω R<sub>DS(on)</sub> is specified at **Vgs = 5V**. The
Arduino drove it at 5V; the Pi only outputs **3.3V**, so it runs partially
enhanced with higher resistance.

At this current it does not matter. Each channel carries roughly 0.5A, so even
at several times the rated resistance the dissipation is well under 0.1W. This
would only be a problem at much higher currents.

## Software

`Source/lights.py` holds the PWM. It is spawned by `main.js` shortly after boot,
reads `{"r":0-255,"g":0-255,"b":0-255}` JSON lines on stdin, and is driven from
the Lights tab sliders.

Backend is `pigpio` when its daemon is running, otherwise `gpiozero`. The Lights
tab shows which is active. pigpio's PWM is DMA-timed and will not flicker under
load; gpiozero generates it from a Python thread, which can jitter on a
throttled Pi. To use pigpio:

```
sudo systemctl enable --now pigpiod
```

Colour is persisted to `~/.eva-config.json` on every change and restored at
boot, so the strip returns to what it was set to after an ignition cycle rather
than defaulting to off.
