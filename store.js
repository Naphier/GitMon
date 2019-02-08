const electron = require('electron');
const path = require('path');
const fs = require('fs');

class Store {
	constructor(opts) {
		const userDataPath = (electron.app || electron.remote.app).getPath('userData');
		this.path = path.join(userDataPath, opts.configName + '.json');
		//console.log('settings path: ' + this.path);
		this.defaults = opts.defaults;
		this.data = parseDataFile(this.path, opts.defaults);

		var aKey;

		for (var key in this.defaults) {
			aKey = key;
			if (!this.data.hasOwnProperty(key))
				this.data[key] = this.defaults[key];
		}

		if (aKey) {
			this.set(aKey, this.data[aKey]);
		}
	}

	get(key) {
		if (this.data.hasOwnProperty(key))
			return this.data[key];
		else
			return this.defaults[key];
	}

	set(key, val) {
		this.data[key] = val;
		fs.writeFileSync(this.path, JSON.stringify(this.data, null, 4));
	}
}

function parseDataFile(filePath, defaults) {
	try {
		return JSON.parse(fs.readFileSync(filePath));
	} catch (e) {
		return defaults;
	}
}

module.exports = Store;