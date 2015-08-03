console.log('minimap.js');

var body = document.body;
var html = document.documentElement;

//Page height
var pageHeight = Math.max(body.scrollHeight,body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight);

var elementId = 'minimap-extension-element';

//Create element to contain the minimap canvas
var minimapElement = document.createElement('div');
minimapElement.setAttribute('id', elementId);

//Create overlay viewport element
var viewportElement = document.createElement('div');
viewportElement.setAttribute('id', elementId + '-viewport');

minimapElement.appendChild(viewportElement);

body.appendChild(minimapElement);

var firstRun = true;

var takeScreenshot = _.debounce(function(){
	var canvas = minimapElement.querySelector('canvas');

	if(canvas) {
		canvas.remove();
	}

	//Take the screenshot
	html2canvas(body, {
		width: 100,
		height: 100,
		onrendered: function(canvas) {
			minimapElement.appendChild(canvas);

			if(firstRun) {
				firstRun = false;
				minimapElement.className = 'show';
			}

			var minimapHeight = minimapElement.offsetHeight;

			//Set viewport element height to represent scroll window height relative to document
			var percentageOfPageVisible = (window.innerHeight / pageHeight);
			viewportElement.style.height = (percentageOfPageVisible * minimapHeight) + 'px';

			updateViewportPosition();
		}
	});
}, 250);

takeScreenshot();

function updateScreenshot() {
	console.log('updateScreenshot()');
}

function updateViewportPosition() {
	console.log('updateViewportPosition()');

	var scrollPercentage = window.scrollY / window.innerHeight;

	var top = scrollPercentage * minimapElement.offsetHeight;

	viewportElement.style.top = top + 'px';
}

function toggleVisibility() {
	minimapElement.className = minimapElement.className === 'show' ? '' : 'show';
}

//Listen for scroll events
window.onscroll = updateViewportPosition;

//Listen for messages from background.js
chrome.runtime.onMessage.addListener(function(message, sender, callback) {
	switch(message) {
		case 'iconClicked':
			toggleVisibility();
			break;

		default:
			console.warn('Unknown message recieved', message);
	}
});

//Listen for DOM changes
var DOMSubtreeModified = _.debounce(function(ev) {


	if(ev.target.id === elementId) {
		console.log('#####');
		return;
	}
	
	console.log('DOMSubtreeModified');
	// updateScreenshot();

	takeScreenshot();

	updateViewportPosition();
}, 250);
document.addEventListener('DOMSubtreeModified', DOMSubtreeModified);