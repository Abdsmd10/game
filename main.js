const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('path');

require('./server.js'); 

let win;

function createWindow() {
    win = new BrowserWindow({
        width: 600, height: 900,
        resizable: true, autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false 
        }
    });
    win.loadFile('index.html');

    const keyMap = { 'X': 'red', 'C': 'blue', 'V': 'green', 'B': 'white' };
    Object.keys(keyMap).forEach(key => {
        globalShortcut.register(key, () => {
            if (win) win.webContents.send('global-spawn', keyMap[key]);
        });
    });
}

app.whenReady().then(createWindow);
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());