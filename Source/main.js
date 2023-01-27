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
