const { app, BrowserWindow, dialog, globalShortcut } = require('electron');
const ipcMain = require('electron').ipcMain;
const Store = require('./store.js');
const ChildProcess = require('child_process');
let win;

let resultsCache = new Object();

const store = new Store({
	configName: 'userprefs',
	defaults: {
		windowBounds: { width: 800, height: 600 }, 
		zoomAdjustment: 0,
		interval: 300000 // 5 minutes
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

function onReady() {
	//const appIcon = new Tray('./overlay-icon.png');
	let { width, height } = store.get('windowBounds');

	win = new BrowserWindow({
		width: width,
		height: height,
		frame: false,
		minWidth: 180,
		minHeight: 260,
		icon: './media/icon.png',
		webPreferences: { nodeIntegration: true }
	});


	win.toggleDevTools();
	// destroy dropdown menus
	win.setMenu(null);

	win.loadFile('index.html');

	win.on('resize', () => {
		let { width, height } = win.getBounds();
		store.set('windowBounds', { width, height });
	});

	win.on('closed', () => {
		win = null;
	});

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

		let mainLoopInterval = setInterval(mainLoop, store.get('interval'));
	});
}

ipcMain.on('zoomSet', function (event, newZoom) {
	console.log('newZoom: '.concat(newZoom));
	store.set('zoomAdjustment', newZoom - 1);
});

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

ipcMain.on('pickDirectory', function (event, data){
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

const fsys = require('fs');
const path = require('path');
// TODO - handle scan directory call
ipcMain.on('scanDirectory', function (event, data) {
	var dir = dialog.showOpenDialog({ properties: ['openDirectory'] });
	if (!dir || dir.length < 1)
		return;
	var validDirs = [];
	fsys.readdirSync(dir[0]).forEach(directory => {
		if (!directory)
			return;

		var subDir = path.join(dir[0], directory);
		fsys.readdirSync(subDir).forEach(subDirectory => {
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

// TODO - handle remove project call
ipcMain.on('removeProject', function (event, data) {
	
});

// TODO - handle edit directory call
ipcMain.on('editDirectory', function (event, data) {

});

// TODO - handle set new interval call
ipcMain.on('setNewInterval', function (event, data) {

});

ipcMain.on('removeAllDirectories', function (event, data) {
	resultsCache = {};
	store.set('resultsCache', resultsCache);
	win.webContents.send('clearDirectories');
});

ipcMain.on('getSettingsFile', function (event, data) {
	win.webContents.send('settingsFilePathRetrieved', store.path);
});


function scanGitDirectory(directory, onSuccess) {
	runGitFetch(
		directory,
		(successDir) => {
			runGitStatus(
				successDir,
				(result) => {
					var json = JSON.stringify(result);
					console.log('runGitStatusResult: ' + json);
					win.webContents.send('setGitStatus', json);
					resultsCache[successDir] = result;
					store.set('resultsCache', resultsCache);
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

// TODO schedule runs
function mainLoop() {

	updateBadge();
}

function updateBadge() {
	if (resultsCache && resultsCache.length > 0) {
		for (var key in resultsCache) {
			if (resultsCache[key] && resultsCache[key].outOfDate) {
				win.webContents.send('setBadge', true);
				return;
			}
		}

		win.webContents.send('setBadge', false);
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
						'Unkown error at directory: \''.concat(dir).concat('\'')));
				}

				console.error('runGitFetch child-process err: \r\n'.concat(err));
				console.error('runGitFetch stdErr:\r\n'.concat(stdErr));
				return;
			}
			console.log('runGitFetch stdOut:\r\n'.concat(stdOut));
			
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
				console.error('runGitStatus stdErr:\r\n'.concat(stdErr));
				return;
			}
			console.log('runGitStatus stdOut:\r\n'.concat(stdOut));
			
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

