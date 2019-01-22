function pickDirectory() {
	ipcRenderer.send('pickDirectory');
}

function scanDirectory() {
	ipcRenderer.send('scanDirectory');
}

function removeAllDirectories() {
	ipcRenderer.send('removeAllDirectories');
}

function openSettingsFile() {
	ipcRenderer.send('getSettingsFile');
}

ipcRenderer.on('settingsFilePathRetrieved', function (event, data) {
	if (data)
		shell.showItemInFolder(data);
});

// TODO - open colors css file - how to open file in proj directory?
function openColorsCss() {
	shell.showItemInFolder('./css/colors.css');
}