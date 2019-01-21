let ipcRendererZoom = require('electron').ipcRenderer;
var webFrame = require('electron').webFrame;

ipcRendererZoom.on('zoom', function (event, data) {
	console.log('zoom: '.concat(data));
	var newZoom = webFrame.getZoomFactor() + data;
	webFrame.setZoomFactor(newZoom);
	ipcRendererZoom.send('zoomSet', newZoom);
});

ipcRendererZoom.on('resetZoom', function (event, data) {
	webFrame.setZoomFactor(1);
});