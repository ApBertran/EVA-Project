#!/usr/bin/env python3
"""RGB LED strip control over GPIO PWM.

Replaces the original Arduino-over-serial path, which targeted a Windows COM
port and was never wired to the app.

Reads one JSON object per line on stdin: {"r":0-255,"g":0-255,"b":0-255}
and optionally {"brightness":0-100}. Writes status lines as JSON on stdout.

The strip is a 12V common-anode analog RGB (Govee H6190, 18W / 1.5A). The Pi
cannot drive it directly - each color switches through a logic-level N-channel
MOSFET, with the 12V coming from its own supply. See LED-WIRING.md.

pigpio is preferred over gpiozero's default backend because its PWM is
DMA-timed rather than generated in a Python thread. This Pi runs throttled at
600MHz under load, where software PWM visibly flickers.
"""
import json
import sys
import os
import atexit
import contextlib

# Chosen to avoid GPIO 18/19: dtparam=audio=on is set, and onboard analog audio
# shares that PWM hardware. GPIO 2/3 are the IMU's I2C bus.
PINS = {'r': 12, 'g': 13, 'b': 19}
PWM_HZ = 800          # above flicker perception, below MOSFET switching losses

state = {'r': 0, 'g': 0, 'b': 0, 'brightness': 100}
backend = None
_pi = None
_leds = {}


def emit(**kw):
    sys.stdout.write(json.dumps(kw) + '\n')
    sys.stdout.flush()


def setup():
    """Try pigpio first, fall back to gpiozero. Either is fine for LEDs; only
       the flicker behaviour under load differs."""
    global backend, _pi, _leds
    try:
        import pigpio
        # pigpio prints a multi-line banner straight to stdout when the daemon
        # is absent, which corrupts the JSON stream this process speaks. Mute
        # both streams for the duration of the probe.
        with open(os.devnull, 'w') as null:
            with contextlib.redirect_stdout(null), contextlib.redirect_stderr(null):
                pi = pigpio.pi()
        if pi.connected:
            _pi = pi
            for pin in PINS.values():
                pi.set_PWM_frequency(pin, PWM_HZ)
                pi.set_PWM_range(pin, 255)
                pi.set_PWM_dutycycle(pin, 0)
            backend = 'pigpio'
            return
        pi.stop()
    except Exception:
        pass

    try:
        from gpiozero import PWMLED
        for key, pin in PINS.items():
            _leds[key] = PWMLED(pin, frequency=PWM_HZ)
        backend = 'gpiozero'
    except Exception as exc:
        backend = None
        emit(event='error', message=f'no GPIO backend available: {exc}')


def apply():
    if backend is None:
        return
    scale = max(0, min(100, state['brightness'])) / 100.0
    for key, pin in PINS.items():
        value = max(0, min(255, int(state[key]))) * scale
        if backend == 'pigpio':
            _pi.set_PWM_dutycycle(pin, int(round(value)))
        else:
            _leds[key].value = value / 255.0


def shutdown():
    """Leave the strip dark rather than latched on if the process dies."""
    try:
        if backend == 'pigpio' and _pi is not None:
            for pin in PINS.values():
                _pi.set_PWM_dutycycle(pin, 0)
            _pi.stop()
        elif backend == 'gpiozero':
            for led in _leds.values():
                led.off()
                led.close()
    except Exception:
        pass


atexit.register(shutdown)

setup()
emit(event='ready', backend=backend, pins=PINS)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        msg = json.loads(line)
    except ValueError:
        continue
    for key in ('r', 'g', 'b', 'brightness'):
        if key in msg:
            try:
                state[key] = int(msg[key])
            except (TypeError, ValueError):
                pass
    apply()
    emit(event='state', **state)
