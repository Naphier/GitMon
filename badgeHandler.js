var ipcRendererBh = require('electron').ipcRenderer;
var remote = require('electron').remote;

ipcRendererBh.on('setBadge', function (event, on) {
	var image = null;
	if (on) {
		var nativeImage = remote.nativeImage;
		image = nativeImage.createFromPath('./icon-overlay.png');
	}
	remote.getCurrentWindow().setOverlayIcon(image, '');
});