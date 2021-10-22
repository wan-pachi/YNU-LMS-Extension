// ヘッダーは最初から表示
injectHeader();

// メイン処理
(async () => {
    const cachedData = await getFromStorage();

    // storage にデータが格納されている場合
    if (Object.keys(cachedData).length > 0) {
        const homeworks = cachedData.homeworks;
        injectTable(homeworks);
    } 
    else {
        // 履修している講義のIDを取得
        const uniqueLecIds = await fetchLecIds();
        // 課題情報を取得
        const homeworks = await fetchHomeworks(uniqueLecIds);

        injectTable(homeworks);
        saveToStorage(homeworks);
    }
})();

class Homework {
    constructor(title, lecName, type, deadline) {
        this.title = title;
        this.lecName = lecName;
        this.type = type;
        this.deadline = deadline;
    }
}

function injectHeader() {
    // 「未実施の課題」を表示
    const upperElement = document.querySelector("#cs_loginInfo");

    const parent = document.createElement("div");
    parent.id = "homework_list";
    upperElement.after(parent);

    const header = document.createElement("div");
    header.id = "main";
    header.style.marginLeft = "3px";
    header.innerHTML = `<div id="title"> <h2>未実施の課題</h2> </div>`;

    parent.appendChild(header);

    // 更新ボタンを表示
    const target = document.querySelector("#homework_list > div > div");

    const button = document.createElement("button");
    button.id = "refresh_btn";
    button.innerText = "更新";
    button.type = "button";
    button.addEventListener("click", onButtonClicked);

    target.appendChild(button);
}

async function getFromStorage() {
    return new Promise(resolve => {
        chrome.storage.local.get((data) => {resolve(data)});
    });
}

function saveToStorage(homeworks) {
    const unixTime = Date.now() / 1000;
    const data = {
        "homeworks": homeworks,
        "unixTime": unixTime
    };

    chrome.storage.local.set(data, function() {});
}

async function fetchLecIds() {
    // 全ての要素を取得（講義＋連絡専用）
    const elements = document.getElementsByTagName("td");

    // 講義ID を格納（重複は許す）
    const duplicatedLecIds = [];

    for (const elt of elements) {
        // 講義のみを取り出す（連絡専用を排除）
        if (elt.innerText.includes("限")) {
            const lecture = elt.parentElement;
            const hrefs = lecture.getElementsByTagName("a");

            for (const href of hrefs) {
                const onclick = href.getAttributeNode("onclick");
                if (onclick != null) {
                    // "formSubmit(<講義ID>)" から<講義ID> のみを抽出
                    const lectureId = onclick.value.match(/'([^"]+)'/)[1];

                    duplicatedLecIds.push(lectureId);
                }
            }
        }
    }

    // 講義ID を格納する新たな配列（重複を排除）
    const uniqueLecIds = [...new Set(duplicatedLecIds)];
    return uniqueLecIds;
}

async function fetchHomeworks(uniqueLecIds) {
    const homeworks = [];
    const lecNum = uniqueLecIds.length;

    const parent = document.querySelector("#homework_list");

    // 読み込み状況を表示
    const progressLabel = document.createElement("h4");
    progressLabel.className = "progress_label";
    progressLabel.innerText = generateProgressLabel(1, lecNum);
    parent.appendChild(progressLabel);

    // プログレスバーを表示
    const progress = document.createElement("progress");
    parent.appendChild(progress);

    for (let i = 0; i < lecNum; i++) {
        progressLabel.innerText = generateProgressLabel(i+1, lecNum);

        const lecId = uniqueLecIds[i];
        const url = "https://lms.ynu.ac.jp/lms/homeHoml/linkKougi?kougiId=" + lecId;

        const response = await fetch(url);
        const htmlString = await response.text();

        const parser = new DOMParser();
        const document = parser.parseFromString(htmlString, "text/html");

        // 全要素を取得
        const elements = document.getElementsByTagName("td");

        for (const elt of elements) {
            const targetTypes = ["REP", "ANK", "TES"];

            // 「課題タイプ」付きの講義ID
            const id = elt.getAttribute("id");
            
            // 「>」と「英語名」付きの講義名
            const originalLecName = document.getElementById("home").nextSibling.innerText;

            // レポート・アンケート・テストを取得
            if (id != null && (targetTypes.some(t => id.includes(t)))) {
                const target = elt.parentElement;

                let isOpen = false;
                let notCompleted = false;

                // 1. 公開状態のチェック
                const spans = target.getElementsByTagName("span");
                for (const span of spans) {
                    if (span.innerText == "公開中" || span.innerText == "延長受付中") {
                        isOpen = true;
                    }
                }

                // 2. 提出状態のチェック
                const submitStatus = target.getElementsByClassName("td03")[0].innerText;

                if (submitStatus.includes("期限")) {
                    notCompleted = true;
                }

                // ＜公開中 or 延長受付中＞ かつ ＜未提出＞の場合
                if (isOpen && notCompleted) {
                    const title = target.getElementsByTagName("a")[0].innerText;
                    const lecName = extractLecName(originalLecName);
                    const type = generateTypeFromId(id);
                    const deadline = extractDeadline(submitStatus);

                    const homework = new Homework(title, lecName, type, deadline);

                    homeworks.push(homework);
                }
            }
        }
        // 最終要素の取得時はsleepなし
        if (i != lecNum - 1) await sleep(500);
    }

    // プログレスバーとラベルを削除
    progressLabel.remove();
    progress.remove();

    return homeworks;
}

async function onButtonClicked() {
    const isLoading = (document.getElementsByTagName("progress").length != 0);

    if (isLoading) return;

    const cachedData = await getFromStorage();

    const nowUnixTime = Date.now() / 1000;
    const previousUnixTime = cachedData.unixTime;

    if (nowUnixTime - previousUnixTime < 15) {
        window.alert("過度な更新は避けてください（サーバーへの負荷軽減のため）");
    } 
    else {
        removeTable();

        // 履修している講義のIDを取得
        const uniqueLecIds = await fetchLecIds();
        // 課題情報を取得
        const homeworks = await fetchHomeworks(uniqueLecIds);

        injectTable(homeworks);
        saveToStorage(homeworks);
    }

}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function removeTable() {
    const table = document.querySelector("#homework_list > table");
    table.remove();
}

function generateProgressLabel(index, lecNum) {
    return `課題情報を取得中（${index}/${lecNum}）`;
}

function extractLecName(originalLecName) {
    return originalLecName.substring(2, originalLecName.indexOf("["));
}

function extractDeadline(submitStatus) {
    return submitStatus.slice(submitStatus.indexOf(":") + 1);
}

function generateTypeFromId(id) {
    if (id.includes("REP")) {
        return "レポート";
    } else if (id.includes("ANK")) {
        return "アンケート";
    } else {
        return "テスト";
    }
}

function injectTable(homeworks) {
    const parent = document.querySelector("#homework_list");
    const newTable = document.createElement("table");

    const tr = document.createElement("tr");
    const th = `<th>課題名</th> <th>講義名</th> <th>形式</th> <th>期限</th>`
    tr.className = "new_table";
    tr.innerHTML = th;

    newTable.appendChild(tr);

    if (homeworks.length == 0) {
        const tr = document.createElement("tr");
        tr.className = "new_table";

        const td = document.createElement("td");
        td.innerText = "課題はありません";

        tr.appendChild(td);
        newTable.appendChild(tr);
    }
    else {
        for (const hw of homeworks) {
            const tr = document.createElement("tr");
            const td1 = document.createElement("td");
            const td2 = document.createElement("td");
            const td3 = document.createElement("td");
            const td4 = document.createElement("td");

            td1.innerText = hw.title;
            td2.innerText = hw.lecName;
            td3.innerText = hw.type;
            td4.innerText = hw.deadline;

            tr.appendChild(td1);
            tr.appendChild(td2);
            tr.appendChild(td3);
            tr.appendChild(td4);

            tr.className = "new_table";
            newTable.appendChild(tr);
        }
    }

    parent.appendChild(newTable);
}
