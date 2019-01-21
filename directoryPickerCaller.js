let ipcDirectoryPicker = require('electron').ipcRenderer;

function pickDirectory() {
	ipcDirectoryPicker.send('pickDirectory');
}

function scanDirectory() {
	ipcDirectoryPicker.send('scanDirectory');
}