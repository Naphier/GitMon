ipcRenderer.on('zoom', function (event, data) {
	console.log('zoom: '.concat(data));
	var newZoom = webFrame.getZoomFactor() + data;
	webFrame.setZoomFactor(newZoom);
	ipcRenderer.send('zoomSet', newZoom);
});

ipcRenderer.on('resetZoom', function (event, data) {
	webFrame.setZoomFactor(1);
});