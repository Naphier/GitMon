let mainDivNode = document.getElementById('main');
//console.log('mainDivNode: '.concat(mainDivNode));
window.addEventListener('resize', handleMainDivSize);
handleMainDivSize();
function handleMainDivSize() {
	var left = 50;
	var margin = 20;
	var newWidth = window.innerWidth - left - margin;
	var style = "".concat(newWidth).concat("px");
	//console.log('style: '.concat(style));
	mainDivNode.style.width = style;
}