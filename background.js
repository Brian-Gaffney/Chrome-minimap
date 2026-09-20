const BADGE_COLOR = '#5a90e0';

function setBadge(tabId, shown) {
  chrome.action.setBadgeText({ tabId, text: shown ? 'ON' : '' }).catch(() => {});
  if (shown) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR }).catch(() => {});
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'minimap:toggle' }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !sender.tab || sender.tab.id == null) return;

  if (message.type === 'minimap:getZoom') {
    chrome.tabs.getZoom(sender.tab.id).then(sendResponse);
    return true;
  }

  if (message.type === 'minimap:state') {
    setBadge(sender.tab.id, !!message.shown);
  }
});

chrome.tabs.onZoomChange.addListener((change) => {
  chrome.tabs
    .sendMessage(change.tabId, { type: 'minimap:zoom', zoomFactor: change.newZoomFactor })
    .catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    setBadge(tabId, false);
  }
});
