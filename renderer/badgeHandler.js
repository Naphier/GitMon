let overLayImage = null;

ipcRenderer.on('setBadge', function (event, on) {
	//console.log('setBadge: '.concat(on));
	var image = null;
	if (on) {
		if (overLayImage !== null) {
			image = overLayImage;
		} else {
			requestBadgeImagePath();
			return;
		}

		//image = nativeImage.createFromPath('./media/icon-overlay.png');
	}
	remote.getCurrentWindow().setOverlayIcon(image, '');
});

function requestBadgeImagePath() {
	ipcRenderer.send('getBadgeImagePath');
}

ipcRenderer.on('badgeImagePathReceived', function (event, badgeImagePath) {
	var nativeImage = remote.nativeImage;
	overLayImage = nativeImage.createFromPath(badgeImagePath);

});