ipcRenderer.on('setBadge', function (event, on) {
	//console.log('setBadge: '.concat(on));
	var image = null;
	if (on) {
		var nativeImage = remote.nativeImage;
		image = nativeImage.createFromPath('./media/icon-overlay.png');
	}
	remote.getCurrentWindow().setOverlayIcon(image, '');
});