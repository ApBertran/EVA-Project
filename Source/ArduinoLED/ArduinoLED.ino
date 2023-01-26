int colorRGB[3];
int redPin = 11;
int greenPin = 10;
int bluePin = 9;

int delayVal = 50;
int blnFade = 0;
int h_int;
float h;
int r=0, g=0, b=0;

void setup() {
  
  Serial.begin(57600); 
  pinMode(redPin, OUTPUT);
  pinMode(greenPin, OUTPUT);
  pinMode(bluePin, OUTPUT);

}

void loop() {
  
  if(Serial.available() >= 2){
    
    switch( byte( Serial.read() )) {
      case 'r':
        colorRGB[0] = Serial.read();
        blnFade = 0;
        break;
      case 'g':
        colorRGB[1] = Serial.read();
        blnFade = 0;
        break;   
      case 'b':
        colorRGB[2] = Serial.read();
        blnFade = 0;
        break;
      case 'c':
        Serial.flush();
        blnFade = 0;
        break;
      }
   }
   analogWrite(redPin, colorRGB[0]); 
   analogWrite(greenPin, colorRGB[1]);
   analogWrite(bluePin, colorRGB[2]);
   delay(20);
}
