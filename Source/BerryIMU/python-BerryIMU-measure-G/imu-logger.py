#!/usr/bin/python
import json
import struct
import sys
import time

import smbus
import IMU
from LSM6DSL import LSM6DSL_ADDRESS, LSM6DSL_OUTX_L_G

TARGET_HZ = 100.0
MAG_EVERY = 20

ACC_SCALE = 0.244 / 1000.0
GYR_SCALE = 0.07

_stdout = sys.stdout
sys.stdout = sys.stderr
IMU.detectIMU()
if IMU.BerryIMUversion == 99:
    sys.stderr.write('No BerryIMU detected\n')
    sys.exit(1)
IMU.initIMU()
sys.stdout = _stdout

bus = smbus.SMBus(1)
period = 1.0 / TARGET_HZ
next_tick = time.time()
count = 0

while True:
    try:
        raw = bus.read_i2c_block_data(LSM6DSL_ADDRESS, LSM6DSL_OUTX_L_G, 12)
        gx, gy, gz, ax, ay, az = struct.unpack('<hhhhhh', bytes(raw))
    except OSError:
        time.sleep(0.01)
        continue

    sample = {
        't': int(time.time() * 1000),
        'a': [round(ay * ACC_SCALE, 5), round(ax * ACC_SCALE, 5), round(az * ACC_SCALE, 5)],
        'g': [round(gy * GYR_SCALE, 3), round(gx * GYR_SCALE, 3), round(gz * GYR_SCALE, 3)]
    }

    if count % MAG_EVERY == 0:
        try:
            sample['m'] = [IMU.readMAGx(), IMU.readMAGy(), IMU.readMAGz()]
        except OSError:
            pass

    sys.stdout.write(json.dumps(sample) + '\n')
    sys.stdout.flush()
    count += 1

    next_tick += period
    delay = next_tick - time.time()
    if delay > 0:
        time.sleep(delay)
    else:
        next_tick = time.time()
