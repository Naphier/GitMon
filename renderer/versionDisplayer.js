document.getElementById("nodejsversion").innerHTML = process.versions.node;
document.getElementById("chromeversion").innerHTML = process.versions.chrome;
document.getElementById("electronversion").innerHTML = process.versions.electron;

ipcRenderer.on('setVersionDisplay', function (event, version) {
	//console.log('setVersionDisplay: ' + version);
	document.getElementById("version").innerHTML = version;
});