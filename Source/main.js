const { app, BrowserWindow } = require('electron');
const path = require('path');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { spawn } = require('child_process');

// Create the Express app and HTTP server
const expressApp = express();
const server = http.createServer(expressApp);
const io = socketIO(server);

// Serve static files from the 'Source' directory
expressApp.use(express.static(path.join(__dirname, 'Source')));

// Handle Socket.IO connections
io.on('connection', (socket) => {
  console.log('Client connected');

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Python script path and process setup
const pythonScriptPath = path.join(__dirname, 'Source', 'berryIMU-measure-G.py');
const pythonProcess = spawn('python', [pythonScriptPath]);

let buffer = '';

// Handle data from the Python process
pythonProcess.stdout.on('data', (data) => {
  buffer += data.toString();
  let lines = buffer.split('\n');
  buffer = lines.pop();

  lines.forEach(line => {
    try {
      const floatArray = JSON.parse(line.trim());
      if (Array.isArray(floatArray) && floatArray.every(value => typeof value === 'number')) {
        console.log('Emitting data:', floatArray);
        io.emit('gforce-update', floatArray); // Emit data to clients
      }
    } catch (e) {
      console.error('Error parsing JSON data:', e);
    }
  });
});

pythonProcess.stderr.on('data', (data) => {
  console.error('Error from Python script:', data.toString());
});

pythonProcess.on('close', (code) => {
  console.log(`Python script exited with code ${code}`);
});

// Create the Electron window
const createWindow = () => {
  const mainWindow = new BrowserWindow({
    fullscreen: true,
  });

  mainWindow.loadFile('Source/welcomeMessage.html');
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

// Start the HTTP server
server.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
