chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel.setPanelBehavior({ 
        openPanelOnActionClick: true 
    });
});

chrome.runtime.startup.addListener(() => {
    chrome.sidePanel.setPanelBehavior({ 
        openPanelOnActionClick: true 
    });
});