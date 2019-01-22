// Open all links in external browser
document.addEventListener('click', function (event) {
	if (event.target.tagName === 'A' && event.target.href.startsWith('http')) {
		event.preventDefault();
		shell.openExternal(event.target.href);
	}
});