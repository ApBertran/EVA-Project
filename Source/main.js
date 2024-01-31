const { app, BrowserWindow } = require('electron')
const path = require('path')

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    fullscreen: true,
  })

  mainWindow.loadFile('gui.html')
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


// New stuff
const express = require('express')
const {spawn} = require('child_process');
const { argv } = require('process')
const SecondaryApp = express()
const port = 3000
//


// New Stuff
SecondaryApp.get('/', (req, res) => {
 
  var dataToSend;
  // spawn new child process to call the python script
  const python = spawn("python", ["lights_control.py","node.js","python"]); // change to led py file when ready
  // collect data from script
  python.stdout.on('data', function (data) {
   console.log('Pipe data from python script ...');
   dataToSend = data.toString();
  });
  // in close event we are sure that stream from child process is closed
  python.on('close', (code) => {
  console.log(`child process close all stdio with code ${code}`);
  // send data to browser
  res.send(dataToSend)
  });
  
 })
 SecondaryApp.listen(port, () => console.log(`Example app listening on port 
 ${port}!`))
//