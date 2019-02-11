const electron = require('electron');
const path = require('path');
const fs = require('fs');

class FileLogger  {
	constructor(fileNameBase) {
		const userDataPath = (electron.app || electron.remote.app).getPath('userData');

		this.path = path.join(
			userDataPath, 'logs',
			fileNameBase.concat(formatDate(new Date())).concat('.txt'));

		this.stream = fs.createWriteStream(this.path, { flags: 'a' });
	}

	log(msg) {
		this.write('INFO', msg);
	}

	error(msg) {
		this.write('ERROR', msg);
	}

	write(levelStr, msg) {
		msg = msg.toString();
		var final = (new Date()).toLocaleTimeString() + ' - ';
		final += '[' + levelStr + '] : ' + msg;

		this.stream.write(final + "\r\n");
	}
}

function formatDate(date) {
	var monthNames = [
		"January", "February", "March",
		"April", "May", "June", "July",
		"August", "September", "October",
		"November", "December"
	];

	var day = date.getDate();
	var month = date.getMonth();
	var year = date.getFullYear();

	if (day < 10)
		day = '0' + day.toString();

	month++;
	if (month < 10)
		month = '0' + month.toString();

	var hr = date.getHours();
	if (hr < 10)
		hr = '0' + hr.toString();

	var min = date.getMinutes();
	if (min < 10)
		min = '0' + min.toString();

	var sec = date.getSeconds();
	if (sec < 10)
		sec = '0' + sec.toString();

	return year.toString() + month.toString() + day.toString() + 'T' + hr.toString() + min.toString() + sec.toString();
}

module.exports = FileLogger;