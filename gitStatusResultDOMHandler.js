var ipcRendererStatus = require('electron').ipcRenderer;
//const { shell } = require('electron');

ipcRendererStatus.on('setGitStatus', function (event, gitStatusResult) {
	var template = document.getElementById('testProj');
	if (template) {
		template.parentNode.removeChild(template);
	}

	document.getElementById("welcome").style.display = "none";
	console.log(gitStatusResult);
	var status = JSON.parse(gitStatusResult);
	var statusDivNode = document.getElementById(status.proj);
	if (statusDivNode) {
		//TODO update element
		console.log('update element');
	} else {
		// create element and insert into dom
		statusDivNode = document.createElement('span');
		statusDivNode.classList.add('status');
		statusDivNode.id = status.proj;

		if (status.outOfDate) {
			var alertNode = document.createElement('span');
			alertNode.classList.add('alertIcon');
			alertNode.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
			statusDivNode.appendChild(alertNode);
		}
		
		var projNameNode = document.createElement('span');
		projNameNode.classList.add('projectName');
		projNameNode.innerHTML = status.proj;
		projNameNode.addEventListener('click', function () {
			console.log('clicked project name');
			shell.showItemInFolder(status.dir);
		});
		statusDivNode.appendChild(projNameNode);

		if (status.ahead > 0) {
			var aheadNode = document.createElement('span');
			aheadNode.classList.add('ahead');
			aheadNode.innerHTML = '+'.concat(status.ahead);
			statusDivNode.appendChild(aheadNode);
		}

		if (status.behind > 0) {
			var behindNode = document.createElement('span');
			behindNode.classList.add('behind');
			behindNode.innerHTML = '-'.concat(status.behind);
			statusDivNode.appendChild(behindNode);
		}

		if (status.staged > 0 || status.unstaged > 0) {
			var stageNode = document.createElement('span');
			stageNode.classList.add('stage');
			var stageStr = 'M';
			if (status.staged > 0)
				stageStr = stageStr.concat(status.staged);

			if (status.unstaged > 0) {
				stageStr = stageStr.concat('(').concat(status.unstaged).concat(')');
			}
			stageNode.innerHTML = stageStr;
			statusDivNode.appendChild(stageNode);
		}

		if (status.untracked > 0) {
			var untrackedNode = document.createElement('span');
			untrackedNode.classList.add('untracked');
			untrackedNode.innerHTML = '?'.concat(status.untracked);
			statusDivNode.appendChild(untrackedNode);
		}

		// delete and modify buttons
		var trashNode = document.createElement('span');
		trashNode.classList.add('trashButton');
		trashNode.innerHTML = '<i class="far fa-trash-alt"></i>';
		trashNode.addEventListener('click', function () {
			// TODO remove project handler
			console.log('trash clicked for: ' + status.proj);
		});
		statusDivNode.appendChild(trashNode);

		var editNode = document.createElement('span');
		editNode.classList.add('editButton');
		editNode.innerHTML = '<i class="far fa-edit"></i>';
		editNode.addEventListener('click', function () {
			// TODO edit project handler
			console.log('edit clicked for: ' + status.proj);
		});
		statusDivNode.appendChild(editNode);

		document.getElementById('home').appendChild(statusDivNode);
	}
});

ipcRendererStatus.on('clearDirectories', function (event, data) {
	var homeDivNode = document.getElementById('home');
	document.getElementById("welcome").style.display = "";
	var childArray = Array.prototype.slice.call(homeDivNode.childNodes);
	var count = childArray.length;
	for (var i = 0; i < count; i++) {
		if (childArray[i].id !== 'welcome') {
			homeDivNode.removeChild(childArray[i]);
		}
	}
});
