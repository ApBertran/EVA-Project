#!/usr/bin/python
#
#       This program demonstrates how to convert the raw values from an accelerometer to Gs
#
#       The BerryIMUv1, BerryIMUv2 and BerryIMUv3 are supported
#
#       This script is python 2.7 and 3 compatible
#
#       Feel free to do whatever you like with this code.
#       Distributed as-is; no warranty is given.
#
#       https://ozzmaker.com/accelerometer-to-g/


import time
import IMU
import sys
import json



IMU.detectIMU()     #Detect if BerryIMU is connected.
if(IMU.BerryIMUversion == 99):
    sys.exit()
IMU.initIMU()       #Initialise the accelerometer, gyroscope and compass

while True:


    #Read the accelerometer,gyroscope and magnetometer values
    ACCx = IMU.readACCx()
    ACCy = IMU.readACCy()
    ACCz = IMU.readACCz()
    yG = (ACCx * 0.244)/1000
    xG = (ACCy * 0.244)/1000
    zG = (ACCz * 0.244)/1000
    output = [xG, yG, zG]
    json_output = json.dumps(output)
    print(json_output)


    #Send data immediately
    sys.stdout.flush()

    #Slow program down a bit, makes the output more readable
    time.sleep(0.05)
