// js/report.js
import { db, doc, setDoc, getDocs, collection } from "./firebase.js";

export function initReport() {
  // 今日の日付を自動セット
  const today = new Date().toISOString().slice(0, 10);
  const dateInput = document.getElementById("reportDate");
  if (dateInput) dateInput.value = today;

  document.getElementById("generateReportBtn")?.addEventListener("click", generateReport);
  document.getElementById("copyReportBtn")?.addEventListener("click", copyReport);
}

async function generateReport() {
  const dateStr = document.getElementById("reportDate").value;
  const done = document.getElementById("reportDone").value.trim();
  const tomorrow = document.getElementById("reportTomorrow").value.trim();
  if (!dateStr) { alert("対象日を選択してください"); return; }

  const d = new Date(dateStr + "T00:00:00");
  const weekDays = ["日","月","火","水","木","金","土"];
  const dateLabel = `${d.getMonth()+1}月${d.getDate()}日（${weekDays[d.getDay()]}）`;

  const fmt = text => {
    if (!text) return "　（なし）";
    return text.split("\n").map(l => {
      const t = l.trim();
      if (!t) return "";
      return t.startsWith("・") ? `　${t}` : `　・${t}`;
    }).filter(l => l).join("\n");
  };

  const report = `【日報】${dateLabel}\n\n■ 本日の作業内容\n${fmt(done)}\n\n■ 明日の予定\n${fmt(tomorrow)}`;

  document.getElementById("reportPreview").textContent = report;
  document.getElementById("copyReportBtn").style.display = "block";

  try {
    await setDoc(doc(db, "daily_reports", dateStr), {
      date: dateStr, done, tomorrow, savedAt: Date.now()
    });
  } catch(e) { console.warn("保存失敗:", e); }
}

async function copyReport() {
  const text = document.getElementById("reportPreview").textContent;
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById("copyReportBtn");
    btn.textContent = "✓ コピー済み";
    setTimeout(() => { btn.textContent = "コピー"; }, 1500);
  } catch { alert("コピーに失敗しました。"); }
}
