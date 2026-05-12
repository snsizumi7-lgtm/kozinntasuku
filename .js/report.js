// js/report.js
import { db, doc, setDoc, getDoc, getDocs, collection } from "./firebase.js";

export function initReport() {
  const today = new Date().toISOString().slice(0,10);
  document.getElementById("reportDate").value = today;
  loadLatestPrevReport(today);
  document.getElementById("reportDate")?.addEventListener("change", e => loadLatestPrevReport(e.target.value));
  document.getElementById("generateReportBtn")?.addEventListener("click", generateReport);
  document.getElementById("copyReportBtn")?.addEventListener("click", copyReport);
}

async function loadLatestPrevReport(targetDate) {
  const dateEl = document.getElementById("prevReportDate");
  const contentEl = document.getElementById("prevReportContent");
  try {
    const snap = await getDocs(collection(db, "daily_reports"));
    const reports = [];
    snap.forEach(d => { const data = d.data(); if (data.date && data.date < targetDate) reports.push(data); });
    if (!reports.length) {
      if (dateEl) dateEl.textContent = "";
      if (contentEl) contentEl.innerHTML = '<span class="prev-report-empty">過去の日報はまだありません</span>';
      return;
    }
    reports.sort((a,b) => b.date.localeCompare(a.date));
    const latest = reports[0];
    const d = new Date(latest.date+"T00:00:00");
    const wdays = ["日","月","火","水","木","金","土"];
    const label = `${d.getMonth()+1}月${d.getDate()}日（${wdays[d.getDay()]}）`;
    if (dateEl) dateEl.textContent = label;
    const lines = [];
    if (latest.done) lines.push("■ 本日の作業\n"+latest.done);
    if (latest.tomorrow) lines.push("■ 明日の予定\n"+latest.tomorrow);
    if (latest.memo) lines.push("■ 特記事項\n"+latest.memo);
    if (contentEl) contentEl.innerHTML = lines.length
      ? `<div class="prev-report-content">${lines.join("\n\n").replace(/\n/g,"<br>")}</div>`
      : `<span class="prev-report-empty">${label}の日報は空です</span>`;
  } catch(e) {
    if (contentEl) contentEl.innerHTML = '<span class="prev-report-empty">読み込みエラー</span>';
  }
}

async function generateReport() {
  const dateStr = document.getElementById("reportDate").value;
  const done = document.getElementById("reportDone").value.trim();
  const tomorrow = document.getElementById("reportTomorrow").value.trim();
  const memo = document.getElementById("reportMemo").value.trim();
  if (!dateStr) { alert("対象日を選択してください"); return; }

  const d = new Date(dateStr+"T00:00:00");
  const wdays = ["日","月","火","水","木","金","土"];
  const dateLabel = `${d.getMonth()+1}月${d.getDate()}日（${wdays[d.getDay()]}）`;

  const fmt = text => {
    if (!text) return "　（なし）";
    return text.split("\n").map(l => { const t=l.trim(); if(!t) return ""; return t.startsWith("・")?`　${t}`:`　・${t}`; }).filter(l=>l).join("\n");
  };

  const report = `【日報】${dateLabel}\n\n■ 本日の作業内容\n${fmt(done)}\n\n■ 明日の予定\n${fmt(tomorrow)}\n\n■ 特記事項・連絡\n${memo?`　${memo}`:"　（なし）"}`;
  document.getElementById("reportPreview").textContent = report;
  document.getElementById("copyReportBtn").style.display = "block";

  try {
    await setDoc(doc(db,"daily_reports",dateStr), { date:dateStr, done, tomorrow, memo, savedAt:Date.now() });
    loadLatestPrevReport(dateStr);
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
