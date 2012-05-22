	// Listen for a click on the map icon
	chrome.browserAction.onClicked.addListener(function(tab) {
			chrome.tabs.insertCSS(null, {file: "chrome_minimap.css"});
			chrome.tabs.executeScript(null, {file: "jquery.js"});
			chrome.tabs.executeScript(null, {file: "html2canvas.js"});
			chrome.tabs.executeScript(null, {file: "jquery.plugin.html2canvas.js"});

			chrome.tabs.executeScript(null, {file: "embed_map.js"});
	});