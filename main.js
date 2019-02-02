const { remote, app, BrowserWindow, dialog, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const ipcMain = require('electron').ipcMain;
const Store = require('./store.js');
const ChildProcess = require('child_process');
const electronLocalShortCut = require('electron-localshortcut');
const fs = require('fs');
const path = require('path');

let win;
let appTrayIcon = null;
let appIconImg;
let resultsCache = new Object();
let mainLoopInterval = null;
let cssColorPathUser = null;

const store = new Store({
	configName: 'userprefs',
	defaults: {
		windowBounds: { width: 800, height: 600 }, 
		zoomAdjustment: 0,
		interval: 300000, // 5 minutes
		didShowMinToTrayWarning: false,
		alwaysMinimizeToTray: false
	}
});

let GitErrType = {
	None: 0,
	NotAGitDir: 1,
	Unknown: 3
};

class GitError {
	constructor(gitErrType, message) {
		this.gitErrType = gitErrType;
		this.message = message;
	}
}

function strFormat(str, obj) {
	return str.replace(/\{\s*([^}\s]+)\s*\}/g, function (m, p1, offset, string) {
		return obj[p1];
	});
}


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

function onReady() {
	let { width, height } = store.get('windowBounds');
	appIconImg = nativeImage.createFromPath('./media/icon.png');
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

	win.toggleDevTools();

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

	win.webContents.once('dom-ready', () => {
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
		var interval = store.get('interval');
		//console.log('interval: '.concat(interval));
		mainLoop();
		//mainLoopInterval = setInterval(mainLoop, interval);
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
					message: 'Always minimize to tray? Can be changed later in settings.', 	
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

	electronLocalShortCut.register(win, 'F5', () => {
		handleColorCssInsertion();
		mainLoop();
	});
}


function handleColorCssInsertion() {
	var userDataPath = (app || remote.app).getPath('userData');

	var cssColorPathDefault = './css/colors.css';

	cssColorPathUser = path.join(userDataPath, 'colors.css');
	if (!fs.existsSync(cssColorPathUser)) {
		if (!fs.existsSync(cssColorPathDefault)) {
			console.log(
				'ERROR! cannot find default css at: \''.concat(cssColorPathDefault).concat('\''));
		} else {
			fs.copyFileSync(cssColorPathDefault, cssColorPathUser);
			console.log('Copying default css to: ' + cssColorPathUser);
		}
	}

	if (!fs.existsSync(cssColorPathUser)) {
		dialog.showErrorBox(
			'CSS Load error!',
			'Could not find user css file: ' + cssColorPathUser);
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
							console.log(
								'importing DEFAULT color.css: ' + cssColorPathDefault);

							var formatedData =
								dataDef.toString().replace(/\s{2,10}/g, ' ').trim();

							console.log(formatedData);
							win.webContents.insertCSS(formatedData);
						}
					});
					console.log('error loading user color.css: '.concat(err));
				} else {
					console.log('importing USER color.css: ' + cssColorPathUser);

					var formatedData = data.toString().replace(/\s{2,10}/g, ' ').trim();
					console.log(formatedData);
					win.webContents.insertCSS(formatedData);
				}
			});
		});
	}
}


function setTrayIcon(on) {
	if (on) {

		appTrayIcon = new Tray('./media/icon.png');
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
		updateBadge();
	} else {
		appTrayIcon.setHighlightMode('always');
		appTrayIcon.destroy();

		if (!appIconImg) {
			appIconImg = nativeImage.createFromPath('./media/icon.png');
		}

		console.log('should set appIconImg: '.concat(appIconImg));
		win.setIcon(appIconImg);
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

		scanGitDirectory(dir[0], (result) => {
			dialog.showMessageBox(null, {
				buttons: ['OK'],
				title: 'Success',
				type: 'info',
				message: 'Added ' + result.proj
			});
		});
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
		for (var k = 0; k < validDirs.length; k++) {
			//console.log(validDirs[k]);
			scanGitDirectory(validDirs[k]);
		}
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
	});

	ipcMain.on('getSettingsFile', function (event, data) {
		win.webContents.send('settingsFilePathRetrieved', store.path);
	});

	ipcMain.on('getCssFile', function (e, d) {
		win.webContents.send('settingsFilePathRetrieved', cssColorPathUser);
	});
}

function refreshStatusListUi() {
	if (!win || !win.webContents)
		return;

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
}

function scanGitDirectory(directory, onSuccess) {
	runGitFetch(
		directory,
		(successDir) => {
			runGitStatus(
				successDir,
				(result) => {
					var json = JSON.stringify(result);
					console.log('runGitStatusResult: ' + json);

					resultsCache[successDir] = result;

					refreshStatusListUi();					
					updateBadge();

					if (onSuccess)
						onSuccess(result);
				},
				(err) => {
					dialog.showErrorBox('No bueno!', err.message);
				}
			);
		},
		(err) => {
			dialog.showErrorBox('No bueno!', err.message);
		}
	);
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
	console.log('mainLoop');
	// if we loop through and do fetches then refresh is not needed
	// refreshStatusListUi();

	for (key in resultsCache) {
		try {
			var dir = key;
			console.log('Scanning: ' + dir);
			scanGitDirectory(dir);
		} catch (err) { 
			//who cares
		}
	}

	updateBadge();
}

function updateBadge() {
	if (resultsCache) {
		var outOfDateCount = 0;

		for (var key in resultsCache) {
			if (resultsCache[key] && resultsCache[key].outOfDate) {
				outOfDateCount++;
			}	
		}

		if (outOfDateCount > 0) {
			win.webContents.send('setBadge', true);

			if (appTrayIcon) {
				appTrayIcon.setImage('./media/tray-icon-overlay.png');
				appTrayIcon.setToolTip('Repos out of date: '.concat(outOfDateCount));
			}
			console.log('should set badge');
			return;
		}
	}
	//console.log('should unset badge');
	win.webContents.send('setBadge', false);
	if (appTrayIcon) {
		appTrayIcon.setImage('./media/icon.png');
		appTrayIcon.setToolTip('All up to date :)');
	}

}

// TODO: handle --show-stash
function runGitFetch(dir, onSuccess, onError) {
	ChildProcess.exec(
		'git fetch',
		{ cwd: dir },
		(err, stdOut, stdErr) => {
			if (err) {
				if (err.message.includes('Not a git repository')) {
					onError(new GitError(
						GitErrType.NotAGitDir,
						'\''.concat(dir).concat('\' is not a git repo directory.')));
				} else {
					onError(new GitError(
						GitErrType.Unknown,
						'Unknown error at directory: \''.concat(dir).concat('\'')));
				}

				console.error('runGitFetch child-process err: \r\n'.concat(err));
				console.error('runGitFetch \''.concat(dir).concat('\' stdErr:\r\n').concat(stdErr));
				return;
			}

			//console.log('runGitFetch: \''.concat(dir).concat('\' stdOut:\r\n').concat(stdOut));
			
			onSuccess(dir);
		}
	);
}

function runGitStatus(dir, onSuccess, onError) {
	ChildProcess.exec(
		'git status --porcelain=v1 --branch --untracked=all',
		{ cwd: dir },
		(err, stdOut, stdErr) => {
			if (err) {
				if (err.message.includes('Not a git repository')) {
					onError(new GitError(
						GitErrType.NotAGitDir,
						'\''.concat(dir).concat('\' is not a git repo directory.')));
				} else {
					onError(new GitError(
						GitErrType.Unknown,
						'Unkown error at directory: \''.concat(dir).concat('\'')));
				}

				console.error('runGitStatus child-process err: \r\n'.concat(err));
				console.error('runGitStatus \''.concat(dir).concat('\' stdErr:\r\n').concat(stdErr));
				return;
			}

			console.log('runGitStatus \''.concat(dir).concat('\' stdOut:\r\n').concat(stdOut));
			
			var result = parseGitStatus(stdOut);

			// Try to parse out the directory
			result.proj = dir.substr(dir.lastIndexOf('/') + 1);
			if (result.proj === dir)
				result.proj = dir.substr(dir.lastIndexOf('\\') + 1);

			result.dir = dir;

			onSuccess(result);
	});
}

function parseGitStatus(output) {
	var lines = output.match(/[^\r\n]+/g);
	var working = '';
	var remote = '';
	var ahead = 0;
	var behind = 0;
	var staged = 0;
	var unstaged = 0;
	var untracked = 0;
	var outOfDate = false;

	lines.forEach((item, index) => {
		//console.log(index + ': '.concat(item));
		
		if (item.startsWith('##')) {
			var spaceSplit = item.split(' ');
			if (spaceSplit.length < 2)
				return;

			var branchSplit = spaceSplit[1].split('...');

			if (branchSplit.length !== 2)
				return;

			working = branchSplit[0];
			remote = branchSplit[1];

			var bracketSplit = item.split('[');
			if (bracketSplit.length === 2) {
				var aheadBehindStr = bracketSplit[1].replace(',', '').replace(']', '');
				console.log('aheadBehind: '.concat(aheadBehindStr));
				var aheadBehindSplit = aheadBehindStr.split(' ');

				aheadBehindSplit.forEach((aItem, aIndex) => {

					if (aItem.includes('ahead') && aheadBehindSplit.length >= aIndex + 1) {
						var aheadIntTry = parseInt(aheadBehindSplit[aIndex + 1]);
						if (!Number.isNaN(aheadIntTry)) {
							ahead = aheadIntTry;
						} else {
							console.error(strFormat(
								'Failed parsing \'ahead\'. aheadBehindStr: \'{0}\'  split length: {1}  aIndex: {2}',
								[aheadBehindStr,
								aheadBehindSplit.length,
								aIndex]
							));
						}
					}

					if (aItem.includes('behind') && aheadBehindSplit.length >= aIndex + 1) {
						var behindIntTry = parseInt(aheadBehindSplit[aIndex + 1]);
						if (!Number.isNaN(behindIntTry)) {
							behind = behindIntTry;
						} else {
							console.error(strFormat(
								'Failed parsing \'behind\'. aheadBehindStr: \'{0}\'  split length: {1}  aIndex: {2}',
								[aheadBehindStr,
								aheadBehindSplit.length,
								aIndex]
							));
						}
					}
				});
			}
		}

		if (item.startsWith('M')) {
			staged++;
			return;
		}

		if (item.startsWith(' M')) {
			unstaged++;
			return;
		}

		if (item.startsWith('??')) {
			untracked++;
			return;
		}
	});
	var err = null;

	if (ahead > 0 || behind > 0 || staged > 0 || unstaged > 0 || untracked > 0 || err) {
		outOfDate = true;
	}

	return { outOfDate, working, remote, ahead, behind, staged, unstaged, untracked, err};
}

