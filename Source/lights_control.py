import serial

# Setup the Serial Object
ser = serial.Serial()
# Set the Serial Port to use
ser.setPort("COM3")
# Set the Baudrate (Arduino Sketch is expecting 57600 for smooth transitions in the GUI)
ser.baudrate = 57600
# Open the Serial Connection
ser.open()
loopVar = True

if (ser.isOpen()):
  # Start a main loop
  while (loopVar):
    # Prompt for Red value
    redVal = input('Red value:')
    ser.write(bytes("r" + chr(int(redVal)),  'utf-8'))
    # Prompt for Green value
    greenVal = input('Green value:')
    ser.write(bytes("g" + chr(int(greenVal)),  'utf-8'))
    # Prompt for Blue value
    blueVal = input('Blue value:')
    ser.write(bytes("b" + chr(int(blueVal)),  'utf-8'))
    # Check if user wants to end
    loopCheck = input('Loop (y/N):')
    if (loopCheck == 'N'):
      loopVar = False
  # After loop exits, close serial connection
  ser.close()
