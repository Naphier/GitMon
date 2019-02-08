const { remote, app, BrowserWindow, dialog, globalShortcut, Tray, Menu, nativeImage, Notification } = require('electron');
const electron = require('electron');
const ipcMain = require('electron').ipcMain;
const Store = require('./store.js');
const electronLocalShortCut = require('electron-localshortcut');
const fs = require('fs');
const path = require('path');
const GitHandler = require('./gitHandler.js');
const AutoLaunch = require('auto-launch');

let win;
let appTrayIcon = null;
let appIconImg;
let resultsCache = new Object();
let mainLoopInterval = null;
let cssColorPathUser = null;
let scanRequest = { done: false, id: 0, expected: 0, reported: 0, addedProjs: [], failedDirs: [] };
let suspended = false;

// turn off debugging for non-dev environments
// must run with VS debugger attached to process... sorry?
console.log('argv: '.concat(process.argv));
console.log('execArgv: '.concat(process.execArgv));
const debug = process.argv.includes('--inspect-brk') || process.argv.includes('--vs');

if (!debug) {
	console.log('console.log is disabled in non-dev environment');
	console.log = function () { };
}

const storeDefaults = {
	configName: 'userprefs',
	defaults: {
		windowBounds: { width: 800, height: 600 },
		zoomAdjustment: 0,
		interval: 300000, // 5 minutes
		didShowMinToTrayWarning: false,
		alwaysMinimizeToTray: false,
		lastNotificationTime: 0,
		msBetweenNotifications: 300000,
		notificationsOn: true
	}
};

let store = new Store(storeDefaults);

const gitHandler = new GitHandler();

app.on('ready', onReady);

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', () => {
	if (win === null) {
		onReady();
	}
});

app.setAppUserModelId(process.execPath);

if (!debug) {
	var gitMonAutoLauncher = new AutoLaunch({ name: 'GitMon' });
	gitMonAutoLauncher.enable();

	gitMonAutoLauncher.isEnabled().then(function (isEnabled) {
		if (isEnabled)
			return;

		gitMonAutoLauncher.enable();
	}).catch(function (err) {
		console.error(err);
	});
}

function getExtraResourcesPath(fileName) {
	var filePath = '';
	if (debug) {
		filePath = path.join(__dirname, 'extraResources', fileName);
	} else {
		filePath = path.join(process.resourcesPath, 'extraResources', fileName);
	}

	console.log('getExtraResouresPath - filePath: '.concat(filePath));
	return filePath;
}

function getImagePath(fileName) {
	var filePath = '';
	if (debug) {
		filePath = './extraResources/'.concat(fileName);
	} else {
		filePath = path.join(process.resourcesPath, 'extraResources', fileName);
	}

	console.log('getImagePath - filePath: '.concat(filePath));
	return filePath;
}


function onReady() {
	let { width, height } = store.get('windowBounds');
	appIconImg = nativeImage.createFromPath(getImagePath('icon.png'));// './media/icon.png');

	console.log('appIconImg empty? '.concat(appIconImg.isEmpty()));

	if (!appIconImg.isEmpty()) {
		console.log('appIconImg.getSize(): '.concat(appIconImg.getSize().width));
	}

	win = new BrowserWindow({
		width: width,
		height: height,
		frame: false,
		minWidth: 180,
		minHeight: 260,
		icon: appIconImg, //'./media/icon.png',
		webPreferences: { nodeIntegration: true }
	});

	setupRpcs();
	handleColorCssInsertion();
	initHotKeys();

	//if (debug)
	//	win.toggleDevTools();

	// destroy dropdown menus
	win.setMenu(null);

	//win.loadFile('index.html');
	// this works better with debugger
	win.loadURL(`file:///${__dirname}/index.html`);

	win.on('resize', () => {
		let { width, height } = win.getBounds();
		store.set('windowBounds', { width, height });
	});

	win.on('closed', () => {
		if (mainLoopInterval) {
			clearInterval(mainLoopInterval);
		}
		win = null;
	});

	win.webContents.on('dom-ready', () => {
		//console.log('DOM READY');
		var zoomAdjustment = store.get('zoomAdjustment');
		win.webContents.send('zoom', zoomAdjustment);

		resultsCache = store.get('resultsCache');
		if (!resultsCache || resultsCache.length === 0) {
			resultsCache = {};
			console.log('no stored results');
		} else {
			for (var key in resultsCache) {
				win.webContents.send('setGitStatus', JSON.stringify(resultsCache[key]));
			}
		}

		win.webContents.send('setVersionDisplay', app.getVersion());

		var interval = store.get('interval');
		//console.log('interval: '.concat(interval));
		mainLoop();

		if (mainLoopInterval) {
			clearInterval(mainLoopInterval);
		}

		mainLoopInterval = setInterval(mainLoop, interval);
	});

	win.on('minimize', function (event) {
		event.preventDefault();
		
		if (!store.get('didShowMinToTrayWarning')) {
			store.set('didShowMinToTrayWarning', true);
			dialog.showMessageBox(
				null,
				{
					buttons: ['Yes', 'No'],
					title: 'Where\'s my window?',
					type: 'warning',
					message: 'Always minimize to tray? Can be changed later in settings.'
				},
				function (response, checked) {
					if (response === 0) {
						store.set('alwaysMinimizeToTray', true);
						win.hide();
					}
				}
			);
		}
		else {
			if (store.get('alwaysMinimizeToTray'))
				win.hide();
		}
	});

	win.on('show', function () {
		console.log('win.on show');
		if (store.get('alwaysMinimizeToTray'))
			setTrayIcon(false);		
	});

	win.on('hide', function () {
		if (store.get('alwaysMinimizeToTray'))
			setTrayIcon(true);
	});

	if (store.get('lastNotificationTime') <= 0) {
		store.set('lastNotificationTime', Date.now());
	}

	if (store.get('alwaysMinimizeToTray')) {
		win.hide();
		setTrayIcon(true);
	}

	electron.powerMonitor.on('suspend', () => {
		suspended = true;
		if (mainLoopInterval) {
			clearInterval(mainLoopInterval);
		}
	});

	electron.powerMonitor.on('resume', () => {
		var interval = store.get('interval');
		suspended = false;
		if (mainLoopInterval) {
			clearInterval(mainLoopInterval);
		}

		mainLoopInterval = setInterval(mainLoop, interval);
	});
}

function initHotKeys() {
	globalShortcut.register('CommandOrControl+=', () => {
		win.webContents.send('zoom', 0.1);
	});

	globalShortcut.register('CommandOrControl+-', () => {
		win.webContents.send('zoom', -0.1);
	});

	globalShortcut.register('CommandOrControl+0', () => {
		win.webContents.send('resetZoom');
		store.set('zoomAdjustment', 0);
	});

	globalShortcut.register('CommandOrControl+Shift+I', () => {
		win.toggleDevTools();
	});

	electronLocalShortCut.register(win, 'F5', () => {

		store = new Store(storeDefaults);
		let { width, height } = store.get('windowBounds');
		win.setSize(width, height);

		win.loadURL(`file:///${__dirname}/index.html`);
		handleColorCssInsertion();		

		// reset of zoom, mainLoopInterval, and resultsCache all handled by 'dom-ready'
	});
}


function handleColorCssInsertion() {
	var userDataPath = (app || remote.app).getPath('userData');

	var cssColorPathDefault = getExtraResourcesPath('colors.css');// = './css/colors.css';
	/*
	if (debug) {
		cssColorPathDefault = path.join(__dirname, 'extraResources/colors.css');
	} else {
		console.log('resourcePath: '.concat(process.resourcesPath));
		cssColorPathDefault = path.join(process.resourcesPath, 'extraResources/colors.css');
	}
	*/

	cssColorPathUser = path.join(userDataPath, 'colors.css');
	if (!fs.existsSync(cssColorPathUser)) {
		if (!fs.existsSync(cssColorPathDefault)) {
			console.error(
				'ERROR! cannot find default css at: \''.concat(cssColorPathDefault).concat('\''));
		} else {
			fs.copyFileSync(cssColorPathDefault, cssColorPathUser);
			//console.log('Copying default css to: ' + cssColorPathUser);
		}
	}

	if (!fs.existsSync(cssColorPathUser)) {
		dialog.showErrorBox(
			'CSS Load error!',
			'Could not find user css file at: ' + cssColorPathUser);
	} else {
		win.webContents.on('did-finish-load', function () {
			fs.readFile(cssColorPathUser, (err, data) => {
				if (err) {
					fs.readFile(cssColorPathDefault, (errDef, dataDef) => {
						if (errDef) {
							dialog.showErrorBox(
								'Whoa!',
								'Something went way wrong. Could not load default CSS at: '
								+ cssColorPathDefault);
						} else {
							/*
							console.log(
								'importing DEFAULT color.css: ' + cssColorPathDefault);
								*/
							var formatedData =
								dataDef.toString().replace(/\s{2,10}/g, ' ').trim();

							console.log(formatedData);
							win.webContents.insertCSS(formatedData);
						}
					});
					console.error('error loading user color.css: '.concat(err));
				} else {
					//console.log('importing USER color.css: ' + cssColorPathUser);

					var formatedData = data.toString().replace(/\s{2,10}/g, ' ').trim();
					//console.log(formatedData);
					win.webContents.insertCSS(formatedData);
				}
			});
		});
	}
}


function setTrayIcon(on) {
	if (on) {
		if (appTrayIcon === null) {
			appTrayIcon = new Tray(getImagePath('icon.png'));// './media/icon.png');
			var contextMenu = Menu.buildFromTemplate([
				{
					label: 'Show', click: function () {
						win.show();
					}
				},
				{
					label: 'Quit', click: function () {
						app.isQuitting = true;
						app.quit();
					}
				}
			]);

			appTrayIcon.on('double-click', function () {
				win.show();
			});

			appTrayIcon.setContextMenu(contextMenu);
		}
		updateBadge();
	} else {
		/*
		appTrayIcon.setHighlightMode('always');
		appTrayIcon.destroy();
		appTrayIcon = null;

		if (!appIconImg) {
			appIconImg = nativeImage.createFromPath('./media/icon.png');
		}

		console.log('should set appIconImg: '.concat(appIconImg));
		win.setIcon(appIconImg);
		*/
		updateBadge();
	}
}


function setupRpcs() {
	ipcMain.on('zoomSet', function (event, newZoom) {
		//console.log('newZoom: '.concat(newZoom));
		store.set('zoomAdjustment', newZoom - 1);
	});

	ipcMain.on('pickDirectory', function (event, data) {
		var dir = dialog.showOpenDialog({ properties: ['openDirectory'] });
		if (!dir || dir.length < 1)
			return;

		// we already have this one!
		if (resultsCache[dir[0]]) {
			dialog.showMessageBox(null, {
				buttons: ['OK'],
				title: 'Nope',
				type: 'warning',
				message: dir[0] + ' is already monitored. Can\'t add twice!'
			});
			return;
		}

		gitHandler.scanDirectory(
			dir[0],
			(result) => {
				handleScanResult(result);
				dialog.showMessageBox(null, {
					buttons: ['OK'],
					title: 'Success',
					type: 'info',
					message: 'Added ' + result.proj
				});
			},
			(error) => {
				dialog.showErrorBox('No bueno!', error);
			}
		);
	});

	ipcMain.on('scanDirectory', function (event, data) {
		var dir = dialog.showOpenDialog({ properties: ['openDirectory'] });
		if (!dir || dir.length < 1)
			return;
		var validDirs = [];
		fs.readdirSync(dir[0]).forEach(directory => {
			if (!directory)
				return;

			var subDir = path.join(dir[0], directory);
			fs.readdirSync(subDir).forEach(subDirectory => {
				if (!subDirectory)
					return;

				if (subDirectory === '.git') {
					validDirs.push(subDir);
					return;
				}
			});
		});

		//console.log("Valid Directories: ".concat(validDirs.length));
		scanRequest.done = false;
		scanRequest.id++;
		var currentRequestId = scanRequest.id;
		scanRequest.expected = validDirs.length;
		scanRequest.reported = 0;
		scanRequest.addedProjs = [];
		scanRequest.failedDirs = [];

		if (validDirs.length > 0)
			win.webContents.send('showPreloader', true);


		for (var k = 0; k < validDirs.length; k++) {
			//console.log(validDirs[k]);
			gitHandler.scanDirectory(validDirs[k],
				(result) => {
					handleScanResult(result);

					if (scanRequest.id === currentRequestId) {
						scanRequest.addedProjs.push(result.proj);
						scanRequest.reported++;
						reportScanResultsHandler();
					}
				},
				() => {
					if (scanRequest.id === currentRequestId) {
						scanRequest.failedDirs.push(validDirs[k]);
						scanRequest.reported++;
						reportScanResultsHandler();
					}
				});
		}		

		if (validDirs.length > 0)
			updateBadge();
	});

	ipcMain.on('removeProject', function (event, status) {
		dialog.showMessageBox(
			null,
			{
				buttons: ['Yes', 'No'],
				title: 'Confirm Removal',
				type: 'info',
				message: 'Are you sure you want to remove ' + status.proj + '?'
			},
			function (response, checkBoxChecked) {
				if (response === 0) {
					delete resultsCache[status.dir];
					refreshStatusListUi();
					updateBadge();
				}
			});
	});

	// TODO - handle set new interval call
	ipcMain.on('setNewInterval', function (event, data) {

	});
	
	ipcMain.on('setAlwaysMinimizeToTray', function (event, data) {
		store.set('alwaysMinimizeToTray', data);
	});

	ipcMain.on('removeAllDirectories', function (event, data) {
		resultsCache = {};
		store.set('resultsCache', resultsCache);
		win.webContents.send('clearDirectories', true);
		dialog.showMessageBox(
			null,
			{
				buttons: ['OK'],
				type: 'info',
				title: 'Removed all repos',
				message: 'Removed all repos from monitor.'
			});
	});

	ipcMain.on('getSettingsFile', function (event, data) {
		win.webContents.send('settingsFilePathRetrieved', store.path);
	});

	ipcMain.on('getCssFile', function (e, d) {
		win.webContents.send('settingsFilePathRetrieved', cssColorPathUser);
	});

	ipcMain.on('getBadgeImagePath', function (e, d) {
		win.webContents.send('badgeImagePathReceived', getImagePath('icon-overlay.png'));
	});
}

function reportScanResultsHandler() {
	if (scanRequest.done)
		return;

	if (scanRequest.expected !== scanRequest.reported)
		return;

	scanRequest.done = true;

	var addedProjStr = scanRequest.addedProjs.join('\r\n');
	var failedDirsStr = scanRequest.failedDirs.join('\r\n');

	dialog.showMessageBox(null,
		{
			buttons: ['OK'],
			title: 'Scan complete',
			type: 'info',
			message: 'Added '.concat(scanRequest.addedProjs.length) + ' projects: \r\n'
				+ addedProjStr +
				'\r\n\r\n'.concat(scanRequest.failedDirs.length) + ' Failed directories: \r\n' +
				failedDirsStr
		}
	);

	win.webContents.send('showPreloader', false);
}

function refreshStatusListUi() {
	if (!win || !win.webContents)
		return;

	win.webContents.send('showPreloader', true);

	win.webContents.send('clearDirectories', false);

	sortResultsCache();
	store.set('resultsCache', resultsCache);


	for (var key in resultsCache) {
		if (!key || !resultsCache[key])
			continue;

		if (!win || !win.webContents)
			return;

		win.webContents.send(
			'setGitStatus',
			JSON.stringify(resultsCache[key])
		);
	}

	win.webContents.send('showPreloader', false);
}

function sortResultsCache() {
	if (resultsCache) {
		var byName = Object.keys(resultsCache).map(function (key) {
			return [key, resultsCache[key]];
		});
		byName.sort(function (a, b) {
			var x = a[1].proj.toLowerCase();
			var y = b[1].proj.toLowerCase();
			return (x < y) ? -1 : ((x > y) ? 1 : 0);
		});
		//console.log('byName: ');
		//console.log(byName);
		/*
		for (var key in byName) {
			console.log(byName[key].proj);
		}
		*/
		resultsCache = {};
		for (var i = 0; i < byName.length; i++) {
			if (byName[i][1].outOfDate) {
				resultsCache[byName[i][0]] = byName[i][1];
			}
		}

		for (var j = 0; j < byName.length; j++) {
			if (!byName[j][1].outOfDate) {
				resultsCache[byName[j][0]] = byName[j][1];
			}
		}

		/*
		for (var key in resultsCache) {
			console.log(resultsCache[key].proj + '  '.concat(resultsCache[key].outOfDate));
		}
		*/
	}
}

// TODO schedule runs
function mainLoop() {
	console.log('mainLoop at '.concat(new Date()));
	if (suspended) {
		console.log('suspended');
		return;
	}

	// if we loop through and do fetches then refresh is not needed
	// refreshStatusListUi();

	for (key in resultsCache) {
		try {
			var dir = key;
			//console.log('Scanning: ' + dir);
			gitHandler.scanDirectory(
				dir,
				handleScanResult,
				(error) => {
					dialog.showErrorBox('No bueno!', error);
				}
			);
		} catch (err) { 
			//who cares
		}
	}

	updateBadge();
}

function handleScanResult(result) {
	//var json = JSON.stringify(result);
	//console.log('scanDirectory result: ' + json);

	resultsCache[result.dir] = result;

	refreshStatusListUi();
	updateBadge();
}

let badgeIconOn = false;
function updateBadge() {
	if (resultsCache) {
		var outOfDateCount = 0;

		for (var key in resultsCache) {
			if (resultsCache[key] && resultsCache[key].outOfDate) {
				outOfDateCount++;
			}	
		}

		if (outOfDateCount > 0) {
			if (!win || !win.webContents)
				return;

			if (!badgeIconOn)
				win.webContents.send('setBadge', true);

			if (store.get('notificationsOn') &&
				Date.now() - store.get('lastNotificationTime') >
				store.get('msBetweenNotifications')) {

				store.set('lastNotificationTime', Date.now());

				if (Notification.isSupported()) {
					console.log('should show notification');
					var notif = new Notification({
						title: outOfDateCount.toString() + ' repos are out of date!',
						icon: appIconImg
					});

					notif.on('click', () => {
						win.show();
					});

					notif.show();
				}
			}

			badgeIconOn = true;

			if (appTrayIcon) {
				appTrayIcon.setImage(getImagePath('tray-icon-overlay.png'));// './media/tray-icon-overlay.png');
				appTrayIcon.setToolTip('Repos out of date: '.concat(outOfDateCount));
			}
			//console.log('should set badge');
			return;
		}
	}
	//console.log('should unset badge');
	if (badgeIconOn) {
		win.webContents.send('setBadge', false);

		if (appTrayIcon) {
			appTrayIcon.setImage(getImagePath('icon.png'));// './media/icon.png');
			appTrayIcon.setToolTip('All up to date :)');
		}
	}
	badgeIconOn = false;
}
