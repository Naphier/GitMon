let sidenaveState = false;

function toggleNav(caller) {
	sidenaveState = !sidenaveState;
	caller.classList.toggle('change');
	var openSize = "130px";
	var closedSize = "50px";
	var sideNav = document.getElementById("sidenavMenu");
	sideNav.classList.toggle('sidenavOpen');
	sideNav.style.width = sidenaveState ? openSize : closedSize;
	document.getElementById("main").style.left = sidenaveState ? openSize : closedSize;
	var fasEl = document.getElementsByClassName('sidenavLabelFas');
	for (var i = 0; i < fasEl.length; i++)
		fasEl[i].style.opacity = sidenaveState ? "0" : "1";

	var snlEl = document.getElementsByClassName('sidenavLabel');
	//console.log(snlEl.length);
	for (var j = 0; j < snlEl.length; j++) {
		//console.log(snlEl.innerHTML);
		snlEl[j].style.opacity = sidenaveState ? "1" : "0";
	}
}

function show(elementId) {
	var element = document.getElementById("main");
	//console.log('show: '.concat(elementId));
	for (var child = element.firstChild; child !== null; child = child.nextSibling) {
		//console.log(child);
		//console.log(child.id);

		if (!child || !child.id)
			continue;

		if (child.id === elementId) {
			//console.log('showing');
			child.classList.remove('hideContent');
		} else {
			//console.log('hiding');
			child.classList.add('hideContent');
		}
	}
}