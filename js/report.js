// js/report.js
import { db, doc, setDoc, getDoc } from "./firebase.js";

export function initReport() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("reportDate").value = today;

  loadPrevReport(today);

  document.getElementById("reportDate").addEventListener("change", (e) => {
    loadPrevReport(e.target.value);
  });

  document.getElementById("generateReportBtn").addEventListener("click", generateReport);
  document.getElementById("copyReportBtn").addEventListener("click", copyReport);
}

async function loadPrevReport(targetDate) {
  const prevDate = getPrevDate(targetDate);
  const dateEl = document.getElementById("prevReportDate");
  const contentEl = document.getElementById("prevReportContent");

  const d = new Date(prevDate + "T00:00:00");
  const label = `${d.getMonth() + 1}月${d.getDate()}日`;
  if (dateEl) dateEl.textContent = label;

  try {
    const snap = await getDoc(doc(db, "daily_reports", prevDate));
    if (snap.exists()) {
      const data = snap.data();
      const lines = [];
      if (data.done) lines.push("■ 本日の作業\n" + data.done);
      if (data.tomorrow) lines.push("■ 明日の予定\n" + data.tomorrow);
      if (data.memo) lines.push("■ 特記事項\n" + data.memo);
      contentEl.innerHTML = lines.length
        ? `<div class="prev-report-content">${lines.join("\n\n").replace(/\n/g,"<br>")}</div>`
        : `<span class="prev-report-empty">${label}の日報はまだありません</span>`;
    } else {
      contentEl.innerHTML = `<span class="prev-report-empty">${label}の日報はまだありません</span>`;
    }
  } catch (e) {
    contentEl.innerHTML = `<span class="prev-report-empty">読み込みエラー</span>`;
  }
}

function getPrevDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function generateReport() {
  const dateStr = document.getElementById("reportDate").value;
  const done = document.getElementById("reportDone").value.trim();
  const tomorrow = document.getElementById("reportTomorrow").value.trim();
  const memo = document.getElementById("reportMemo").value.trim();

  if (!dateStr) { alert("対象日を選択してください"); return; }

  const d = new Date(dateStr + "T00:00:00");
  const weekDays = ["日","月","火","水","木","金","土"];
  const dateLabel = `${d.getMonth() + 1}月${d.getDate()}日（${weekDays[d.getDay()]}）`;

  const formatLines = (text) => {
    if (!text) return "　（なし）";
    return text.split("\n").map(line => {
      const t = line.trim();
      if (!t) return "";
      return t.startsWith("・") ? `　${t}` : `　・${t}`;
    }).filter(l => l !== "").join("\n");
  };

  const report = `【日報】${dateLabel}

■ 本日の作業内容
${formatLines(done)}

■ 明日の予定
${formatLines(tomorrow)}

■ 特記事項・連絡
${memo ? `　${memo}` : "　（なし）"}`;

  document.getElementById("reportPreview").textContent = report;
  document.getElementById("copyReportBtn").style.display = "block";

  // Firestoreに保存
  try {
    await setDoc(doc(db, "daily_reports", dateStr), {
      date: dateStr, done, tomorrow, memo, savedAt: Date.now()
    });
  } catch (e) {
    console.warn("保存失敗:", e);
  }
}

async function copyReport() {
  const text = document.getElementById("reportPreview").textContent;
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById("copyReportBtn");
    btn.textContent = "✓ コピー済み";
    setTimeout(() => { btn.textContent = "コピー"; }, 1500);
  } catch (e) {
    alert("コピーに失敗しました。");
  }
}
