const ChildProcess = require('child_process');

let errorCount = 0;
const MAX_ERRORS = 100;

let GitErrType = {
	None: 0,
	NotAGitDir: 1,
	Unknown: 3, 
	Critical: 4
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

class GitHandler {
	// TODO: handle --show-stash
	runFetch(dir, onSuccess, onError) {
		try {
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
							errorCount++;
							var errType = GitErrType.Unknown;

							if (errorCount >= MAX_ERRORS) {
								errorCount = 0;
								errType = GitErrType.Critical;
							}

							onError(new GitError(
								errType,
								'Unknown error at directory: \''.concat(dir).concat('\'\r\nPlease review logs if this continues.')));
						}

						console.error('runFetch child-process err: \r\n'.concat(err));
						console.error('runFetch \''.concat(dir).concat('\' stdErr:\r\n').concat(stdErr));
						return;
					}

					//console.log('runFetch: \''.concat(dir).concat('\' stdOut:\r\n').concat(stdOut));

					onSuccess(dir);
				}
			);
		}
		catch (ex) {
			console.error(ex);
		}
	}

	runStatus(dir, onSuccess, onError) {
		try {
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

						console.error('runStatus child-process err: \r\n'.concat(err));
						console.error('runStatus \''.concat(dir).concat('\' stdErr:\r\n').concat(stdErr));
						return;
					}

					//console.log('runStatus \''.concat(dir).concat('\' stdOut:\r\n').concat(stdOut));

					var result = this.parseStatus(stdOut);

					// Try to parse out the directory
					result.proj = dir.substr(dir.lastIndexOf('/') + 1);
					if (result.proj === dir)
						result.proj = dir.substr(dir.lastIndexOf('\\') + 1);

					result.dir = dir;

					onSuccess(result);
				});
		}
		catch (ex) {
			console.error(ex);
		}
	}

	parseStatus(output) {
		var lines = output.match(/[^\r\n]+/g);
		var working = '';
		var remote = '';
		var ahead = 0;
		var behind = 0;
		var staged = 0;
		var unstaged = 0;
		var untracked = 0;
		var outOfDate = false;

		if (!lines) {
			console.error('parseStatus failure. lines is empty. output: '.concat(output));
			return;
		}

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
					//console.log('aheadBehind: '.concat(aheadBehindStr));
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

		return { outOfDate, working, remote, ahead, behind, staged, unstaged, untracked, err };
	}

	scanDirectory(directory, onSuccess, onError) {
		this.runFetch(
			directory,
			(successDir) => {
				this.runStatus(
					successDir,
					(result) => {
						if (onSuccess)
							onSuccess(result);
					},
					(err) => {
						onError(err);						
					}
				);
			},
			(err) => {
				onError(err);
			}
		);
	}
}

module.exports = GitHandler;
