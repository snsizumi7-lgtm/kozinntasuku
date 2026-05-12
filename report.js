// js/report.js
import { db, doc, setDoc, getDocs, addDoc, collection } from "./firebase.js";

export function initReport() {
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

  // 日報を保存
  try {
    await setDoc(doc(db, "daily_reports", dateStr), {
      date: dateStr, done, tomorrow, savedAt: Date.now()
    });
  } catch(e) { console.warn("日報保存失敗:", e); }

  // 「明日やること」をタスクに自動登録
  if (tomorrow) {
    await syncTomorrowToTasks(tomorrow);
  }
}

async function syncTomorrowToTasks(tomorrowText) {
  // 既存タスク名を取得（重複チェック用）
  let existingNames = new Set();
  try {
    const snap = await getDocs(collection(db, "tasks_v2"));
    snap.forEach(d => {
      const name = d.data().name?.trim();
      if (name) existingNames.add(name);
    });
  } catch(e) { console.warn("既存タスク取得失敗:", e); }

  // 「明日やること」の各行をパース
  const lines = tomorrowText.split("\n")
    .map(l => l.trim().replace(/^[・•\-]\s*/, ""))
    .filter(l => l.length > 0);

  let added = 0;
  let skipped = 0;

  for (const name of lines) {
    if (existingNames.has(name)) {
      skipped++;
      continue;
    }
    try {
      await addDoc(collection(db, "tasks_v2"), {
        project: "日報",
        name,
        status: "要対応",
        deadline: "",
        subtasks: [],
        createdAt: Date.now()
      });
      existingNames.add(name); // 同一日報内での重複も防ぐ
      added++;
    } catch(e) { console.warn("タスク登録失敗:", e); }
  }

  // 結果をトーストで通知
  if (added > 0 || skipped > 0) {
    const msg = added > 0
      ? `${added}件のタスクを案件ページに登録しました${skipped > 0 ? `（${skipped}件はスキップ）` : ""}`
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
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}
