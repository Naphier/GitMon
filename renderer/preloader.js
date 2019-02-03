
let preloaderTimer = null;
let preloaderTimerFirstCall = true;

function setPreloader(on) {
	var preloaderContainer = document.getElementById('loaderContainer');

	if (preloaderTimer) {
		clearTimeout(preloaderTimer);
	}

	if (on) {
		preloaderContainer.style.display = '';
	}

	preloaderContainer.style.opacity = (on ? "1" : "0");

	if (!on) {
		preloaderTimer = setTimeout(function () {
			preloaderContainer.style.display = 'none';
			if (preloaderTimerFirstCall) {
				preloaderTimerFirstCall = false;
				preloaderContainer.style.backgroundColor = 'rgba(0,0,0,0.5)';
			}
		}, 260);
	}
}

setTimeout(function () { setPreloader(false); }, 1000);

ipcRenderer.on('showPreloader', function (event, on) {
	setPreloader(on);
});