const { app, BrowserWindow } = require('electron')
const path = require('path')

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    fullscreen: true,
  })

  mainWindow.loadFile('welcomeMessage.html')
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Common on MacOS to need to use Cmd + Q to quit
// On all other OS this will auto quit when the window is closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})


// New Stuff (8/11/2024)
const { spawn } = require('child_process');
const { constants } = require('original-fs')
var gForceArray = [0, 0, 0]

function beginGForcePython() {

  const pythonScriptPath = './BerryIMU/python-BerryIMU-measure-G/berryIMU-measure-G.py';

  // Spawn the python process
  const pythonProcess = spawn('python', [pythonScriptPath]);

  let buffer = '';

  // Handle data from the python process
  pythonProcess.stdout.on('data', (data) => {
    buffer += data.toString();

    // Process the complete JSON data
    let lines = buffer.split('\n');
    buffer = lines.pop();

    lines.forEach(line => {
      try {
        const floatArray = JSON.parse(line.trim());
        if (Array.isArray(floatArray) && floatArray.every(value => typeof value === 'number')) {
          //console.log('Received float data: ', floatArray);
          gForceArray = floatArray
          //GForce(floatArray);
        }
      } catch (e) {
        console.error('Error parsing JSON data: ', e);
      }
    });
  });

  // Handle any errors
  pythonProcess.stderr.on('data', (data) => {
    console.error('Error from Python script: ', data.toString());
  });

  // Handle process exit
  pythonProcess.on('close', (code) => {
    console.log('Python script exited with code ${code}');
  });

  setTimeout(beginGForceOutput, 1000)
}

function GForce() {
  const xElement = document.getElementById('x-display');
  const yElement = document.getElementById('y-display');
  const zElement = document.getElementById('z-display');

  xElement.textContent = '${gForceArray[0].toFixed(2)}';
  yElement.textContent = '${gForceArray[1].toFixed(2)}';
  zElement.textContent = '${gForceArray[2].toFixed(2)}';
}

function beginGForceOutput() {
  setInterval(GForce, 200);
}

setTimeout(beginGForcePython, 10000);