let overLayImage = null;

ipcRenderer.on('setBadge', function (event, on) {
	setBadge(on);
});

function setBadge(on) {
	//console.log('setBadge: '.concat(on));
	var image = null;
	if (on) {
		if (overLayImage !== null) {
			ipcRenderer.send('log', 'overLayImage is not null!');
			image = overLayImage;
		} else {
			ipcRenderer.send('log', 'overLayImage is NULL!');

			requestBadgeImagePath();
			return;
		}

		//image = nativeImage.createFromPath('./media/icon-overlay.png');
	}
	remote.getCurrentWindow().setOverlayIcon(image, '');
}

function requestBadgeImagePath() {
	ipcRenderer.send('log', 'requestBadgeImagePath()');
	ipcRenderer.send('getBadgeImagePath');
}

ipcRenderer.on('badgeImagePathReceived', function (event, badgeImagePath) {
	var nativeImage = remote.nativeImage;
	overLayImage = nativeImage.createFromPath(badgeImagePath);
	ipcRenderer.send('log', 'badgeImagePathReceived: ' + badgeImagePath);
	setBadge(true);
});