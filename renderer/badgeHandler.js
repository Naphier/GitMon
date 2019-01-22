ipcRenderer.on('setBadge', function (event, on) {
	var image = null;
	if (on) {
		var nativeImage = remoteR.nativeImage;
		image = nativeImage.createFromPath('./media/icon-overlay.png');
	}
	remoteR.getCurrentWindow().setOverlayIcon(image, '');
});