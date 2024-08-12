const { app, BrowserWindow } = require('electron');
const path = require('path');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { spawn } = require('child_process');

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    fullscreen: true,
    webPreferences: {
      nodeIntegration: true, // Enable Node.js integration
      contextIsolation: false // Disable context isolation
    }
  });

  mainWindow.loadFile('welcomeMessage.html');
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// New Stuff (8/11/2024)
const pythonScriptPath = './BerryIMU/python-BerryIMU-measure-G/berryIMU-measure-G.py';

// Spawn the python process
const pythonProcess = spawn('python', [pythonScriptPath]);

let buffer = '';

pythonProcess.stdout.on('data', (data) => {
  buffer += data.toString();

  let lines = buffer.split('\n');
  buffer = lines.pop();

  lines.forEach(line => {
    try {
      const floatArray = JSON.parse(line.trim());
      if (Array.isArray(floatArray) && floatArray.every(value => typeof value === 'number')) {
        io.emit('gforce-update', floatArray); // Emit the data to the client
      }
    } catch (e) {
      console.error('Error parsing JSON data: ', e);
    }
  });
});

pythonProcess.stderr.on('data', (data) => {
  console.error('Error from Python script: ', data.toString());
});

pythonProcess.on('close', (code) => {
  console.log(`Python script exited with code ${code}`);
});

// Setup Express server to serve client.js
const expressApp = express();
const server = http.createServer(expressApp);
const io = socketIO(server);

expressApp.use(express.static(path.join(__dirname, 'Source')));

server.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
