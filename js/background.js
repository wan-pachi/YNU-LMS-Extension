chrome.tabs.onUpdated.addListener(function(_, __, tab) {
    if (tab.url.includes('lms.ynu.ac.jp/lms/lginLgir')) {
        chrome.storage.local.clear();
    }
});

