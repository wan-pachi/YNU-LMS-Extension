chrome.tabs.onUpdated.addListener(function(_, __, tab) {
    if (tab.url.includes('lms.ynu.ac.jp/lms/lginLgir')) {
        clearStorageData();
    }
});

function clearStorageData() {
    chrome.storage.local.clear();
}
