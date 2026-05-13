// js/report.js
import { db, doc, setDoc, getDocs, addDoc, collection } from "./firebase.js";

const DRAFT_KEY = "tasuku_report_draft";

export function initReport() {
  const today = new Date().toISOString().slice(0, 10);
  const dateInput = document.getElementById("reportDate");
  if (dateInput) dateInput.value = today;

  // 下書き復元
  loadDraft();

  // 入力のたびに下書き保存
  ["reportDone", "reportTomorrow"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", saveDraft);
  });
  document.getElementById("reportDate")?.addEventListener("change", saveDraft);

  document.getElementById("generateReportBtn")?.addEventListener("click", generateReport);
  document.getElementById("copyReportBtn")?.addEventListener("click", copyReport);
}

function saveDraft() {
  const ind = document.getElementById("draftIndicator");
  if (ind) ind.style.display = "flex";
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      date: document.getElementById("reportDate")?.value || "",
      done: document.getElementById("reportDone")?.value || "",
      tomorrow: document.getElementById("reportTomorrow")?.value || "",
      savedAt: Date.now()
    }));
  } catch(e) {}
}

function loadDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!draft) return;
    // 1週間以上古い下書きは無視
    if (Date.now() - draft.savedAt > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    const dateEl = document.getElementById("reportDate");
    const doneEl = document.getElementById("reportDone");
    const tomorrowEl = document.getElementById("reportTomorrow");
    if (draft.date && dateEl) dateEl.value = draft.date;
    if (draft.done && doneEl) doneEl.value = draft.done;
    if (draft.tomorrow && tomorrowEl) tomorrowEl.value = draft.tomorrow;
    if (draft.done || draft.tomorrow) {
      showToast("下書きを復元しました");
    }
  } catch(e) {}
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch(e) {}
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
    clearDraft(); // 保存成功したら下書きを消す
  } catch(e) { console.warn("保存失敗:", e); }

  if (tomorrow) await syncTomorrowToTasks(tomorrow);
}

async function syncTomorrowToTasks(tomorrowText) {
  let existingNames = new Set();
  try {
    const snap = await getDocs(collection(db, "tasks_v2"));
    snap.forEach(d => { const n = d.data().name?.trim(); if (n) existingNames.add(n); });
  } catch(e) {}

  const lines = tomorrowText.split("\n")
    .map(l => l.trim().replace(/^[・•\-]\s*/, ""))
    .filter(l => l.length > 0);

  let added = 0, skipped = 0;
  for (const name of lines) {
    if (existingNames.has(name)) { skipped++; continue; }
    try {
      await addDoc(collection(db, "tasks_v2"), {
        project: "", name, done: false, subtasks: [], createdAt: Date.now()
      });
      existingNames.add(name);
      added++;
    } catch(e) {}
  }

  if (added > 0 || skipped > 0) {
    const msg = added > 0
      ? `${added}件のタスクを案件ページに登録しました${skipped > 0 ? `（${skipped}件スキップ）` : ""}`
      : `${skipped}件はすでに登録済みのためスキップしました`;
    showToast(msg);
    window.dispatchEvent(new Event("tasksUpdated"));
  }
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

function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}
