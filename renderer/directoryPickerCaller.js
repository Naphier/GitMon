function pickDirectory() {
	ipcRenderer.send('pickDirectory');
}

function scanDirectory() {
	ipcRenderer.send('scanDirectory');
}

function removeAllDirectories() {
	ipcRenderer.send('removeAllDirectories');
}