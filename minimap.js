console.log('minimap.js');

var body = document.body;
var html = document.documentElement;

//Page height
var pageHeight = Math.max(body.scrollHeight,body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight);


var elementId = 'minimap-extension-element';

//Create element to contain the minimap canvas
var minimapElement = document.createElement('div');
minimapElement.setAttribute('id', elementId);

//Create overlay window element
var viewportElement = document.createElement('div');
viewportElement.setAttribute('id', elementId + '-window');

minimapElement.appendChild(viewportElement);

body.appendChild(minimapElement);

html2canvas(body, {
	width: 100,
	height: 100,
	onrendered: function(canvas) {
		minimapElement.appendChild(canvas);

		var minimapHeight = minimapElement.offsetHeight;

		//Set window element height to represent scroll window height relative to document
		var percentageOfPageVisible = (window.innerHeight / pageHeight);
		viewportElement.style.height = (percentageOfPageVisible * minimapHeight) + 'px';

		//Update inner map each second
		window.setInterval(function() {
			var scrollPercentage = window.scrollY / window.innerHeight;

			var top = scrollPercentage * minimapHeight;

			viewportElement.style.top = top + 'px';
		}, 1000);
	}
});