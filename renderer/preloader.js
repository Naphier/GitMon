
let preloaderTimer = null;
let preloaderTimerFirstCall = true;
let lastOnTime = 0;
let preloadOffTimer = null;
const minTimeOn = 500;

function setPreloader(on) {
	var preloaderContainer = document.getElementById('loaderContainer');

	if (preloaderTimer) {
		clearTimeout(preloaderTimer);
	}

	if (on) {
		preloaderContainer.style.display = '';
		lastOnTime = Date.now();
		//console.log('lastOnTime: '.concat(lastOnTime));
		preloaderContainer.style.opacity = "1";
	}

	

	if (!on) {
		var dSinceOn = Date.now() - lastOnTime;
		if (dSinceOn < minTimeOn ) {
			//console.log('dSinceOn: '.concat(dSinceOn));
			//var offTime = (minTimeOn - dSinceOn) + Date.now();

			if (preloadOffTimer)
				clearTimeout(preloadOffTimer);

			preloadOffTimer = setTimeout(function () {
				//console.log('offTime: '.concat(offTime));
				//console.log('timeNow: '.concat(Date.now()));
				setPreloader(false);
				preloadOffTimer = null;
				preloaderContainer.style.opacity = "0";
			}, minTimeOn - dSinceOn);
		} else {

			preloaderTimer = setTimeout(function () {
				preloaderContainer.style.display = 'none';
				if (preloaderTimerFirstCall) {
					preloaderTimerFirstCall = false;
					preloaderContainer.style.backgroundColor = 'rgba(0,0,0,0.5)';
				}
			}, 260);
		}
	}
}

setTimeout(function () { setPreloader(false); }, 1000);

ipcRenderer.on('showPreloader', function (event, on) {
	setPreloader(on);
});