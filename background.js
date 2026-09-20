chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'minimap:toggle' }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'minimap:getZoom' && sender.tab && sender.tab.id != null) {
    chrome.tabs.getZoom(sender.tab.id).then(sendResponse);
    return true;
  }
});

chrome.tabs.onZoomChange.addListener((change) => {
  chrome.tabs
    .sendMessage(change.tabId, { type: 'minimap:zoom', zoomFactor: change.newZoomFactor })
    .catch(() => {});
});
