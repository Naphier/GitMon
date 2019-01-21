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
		icon: './icon.png',
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

	scanDirectory(dir[0]);
});

// TODO - handle scan directory call
ipcMain.on('scanDirectory', function (event, data){
	console.log('scanDirectory');
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


function scanDirectory(directory) {
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
	if (results && results.length > 0) {
		for (result in results) {
			if (result.outOfDate) {
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

