// js/home.js
import { db, getDocs, addDoc, updateDoc, deleteDoc, collection, doc } from "./firebase.js";
import { todayStr } from "./holidays.js";

let allTasks = [];

export async function renderHome() {
  renderGreeting();
  await loadAndRender();
}

function renderGreeting() {
  const el = document.getElementById("homeGreeting");
  if (!el) return;
  const d = new Date();
  const weekDays = ["日","月","火","水","木","金","土"];
  const h = d.getHours();
  const greet = h < 12 ? "おはようございます" : h < 18 ? "こんにちは" : "お疲れ様です";
  el.innerHTML = `${greet}！<span>${d.getMonth()+1}月${d.getDate()}日（${weekDays[d.getDay()]}）</span>`;
}

async function loadAndRender() {
  try {
    const snap = await getDocs(collection(db, "tasks_v2"));
    allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {}
  renderSummaryCards();
  await renderTodaySection();
  renderTaskList();
  renderWeeklyDone();
  renderWeeklyChart();
  initHomeQuickAdd();
}

function renderSummaryCards() {
  const el = document.getElementById("summaryCards");
  if (!el) return;
  const total = allTasks.filter(t => t.status !== "完了").length;
  const done = allTasks.filter(t => t.status === "完了").length;
  const pct = allTasks.length > 0 ? Math.round(done / allTasks.length * 100) : 0;
  el.innerHTML = `
    <div class="summary-card working">
      <div class="summary-card-num">${total}</div>
      <div class="summary-card-label">未完了タスク</div>
    </div>
    <div class="summary-card done">
      <div class="summary-card-num">${done}</div>
      <div class="summary-card-label">完了済み</div>
    </div>
    <div class="summary-card urgent">
      <div class="summary-card-num">${pct}%</div>
      <div class="summary-card-label">完了率</div>
    </div>
  `;
}

// ===== 今日やること（日報連携）=====
export async function renderTodaySection() {
  const el = document.getElementById("todayTasks");
  const subEl = document.getElementById("todayFromReport");
  if (!el) return;
  try {
    const snap = await getDocs(collection(db, "daily_reports"));
    const reports = [];
    snap.forEach(d => { const data = d.data(); if (data.date) reports.push(data); });
    reports.sort((a,b) => b.date.localeCompare(a.date));
    const latest = reports[0];
    if (!latest || !latest.tomorrow) {
      el.innerHTML = `<div class="empty-guide">
        <div class="empty-guide-icon">📝</div>
        <div class="empty-guide-title">今日やることがまだありません</div>
        <div class="empty-guide-desc">日報ページで「明日やること」を書いて生成するとここに表示されます</div>
      </div>`;
      return;
    }
    const d = new Date(latest.date + "T00:00:00");
    const weekDays = ["日","月","火","水","木","金","土"];
    if (subEl) subEl.textContent = `（${d.getMonth()+1}/${d.getDate()}（${weekDays[d.getDay()]}）の日報より）`;

    const today2 = new Date().toISOString().slice(0,10);
    const checkKey = `tasuku_checks_${today2}`;
    let savedChecks = {};
    try { savedChecks = JSON.parse(localStorage.getItem(checkKey) || "{}"); } catch(e) {}

    const lines = latest.tomorrow.split("\n").map(l => l.trim()).filter(l => l);
    el.innerHTML = lines.map((line, i) => {
      const text = line.replace(/^[・•\-]\s*/, "");
      const checked = savedChecks[i] ? "checked" : "";
      const doneStyle = savedChecks[i] ? "text-decoration:line-through;color:#9ca3af" : "";
      return `<div class="today-task-item">
        <input type="checkbox" ${checked} onchange="saveTodayCheck(${i}, this.checked, '${text.replace(/'/g,"\\'")}')">
        <span style="flex:1;${doneStyle}">${esc(text)}</span>
      </div>`;
    }).join("");
  } catch(e) {
    el.innerHTML = '<div class="today-task-empty">読み込みエラー</div>';
  }
}

// チェック → タスク完了 + 日報反映
window.saveTodayCheck = async function(index, checked, taskText) {
  const today = new Date().toISOString().slice(0,10);
  const key = `tasuku_checks_${today}`;
  try {
    const checks = JSON.parse(localStorage.getItem(key) || "{}");
    if (checked) checks[index] = taskText; else delete checks[index];
    localStorage.setItem(key, JSON.stringify(checks));

    const items = document.querySelectorAll(".today-task-item");
    if (items[index]) {
      const span = items[index].querySelector("span");
      if (span) span.style.cssText = checked ? "flex:1;text-decoration:line-through;color:#9ca3af" : "flex:1";
    }

    // タスクのステータスを変更
    const task = allTasks.find(t => t.name === taskText)
      || allTasks.find(t => t.name?.includes(taskText) || taskText.includes(t.name||""));
    if (task) {
      const newStatus = checked ? "完了" : "未完了";
      await updateDoc(doc(db, "tasks_v2", task.id), { done: checked, updatedAt: Date.now() });
      task.done = checked;
      renderSummaryCards();
      renderTaskList();
      renderWeeklyDone();
      window.dispatchEvent(new Event("tasksUpdated"));
    }

    syncCheckedToDone();
    saveEngagement();
    renderWeeklyChart();
  } catch(e) { console.warn(e); }
};

function syncCheckedToDone() {
  const today = new Date().toISOString().slice(0,10);
  const key = `tasuku_checks_${today}`;
  try {
    const checks = JSON.parse(localStorage.getItem(key) || "{}");
    const items = Object.values(checks).filter(v => typeof v === "string");
    const doneEl = document.getElementById("reportDone");
    if (doneEl && items.length > 0) {
      doneEl.value = items.map(t => `・${t}`).join("\n");
    }
  } catch(e) {}
}

// ===== タスク一覧（チェックボックス式）=====
function renderTaskList() {
  const el = document.getElementById("homeTaskList");
  if (!el) return;

  const active = allTasks.filter(t => !t.done);
  const done = allTasks.filter(t => t.done);

  if (!allTasks.length) {
    el.innerHTML = `<div class="empty-guide">
      <div class="empty-guide-icon">✅</div>
      <div class="empty-guide-title">タスクがありません</div>
      <div class="empty-guide-desc">下の入力欄からタスクを追加してください</div>
    </div>`;
    return;
  }

  let html = "";

  // 未完了
  if (active.length) {
    html += active.map(t => renderTaskRow(t, false)).join("");
  }

  // 完了済み（折りたたみ）
  if (done.length) {
    html += `<div class="done-tasks-section">
      <div class="done-tasks-header" onclick="toggleDoneSection(this)">
        <span style="color:#9ca3af;font-size:12px">完了済み（${done.length}件）</span>
        <span class="done-toggle" style="color:#9ca3af;font-size:11px">▾</span>
      </div>
      <div class="done-tasks-body">
        ${done.map(t => renderTaskRow(t, true)).join("")}
      </div>
    </div>`;
  }

  el.innerHTML = html;
}

function renderTaskRow(task, isDone) {
  const doneStyle = isDone ? "text-decoration:line-through;color:#9ca3af" : "";
  const opacity = isDone ? "opacity:0.6" : "";
  return `<div class="task-row" style="${opacity}">
    <input type="checkbox" class="subtask-check" ${isDone ? "checked" : ""}
      onchange="toggleTaskDone('${task.id}', this.checked)">
    <span class="task-row-name" style="flex:1;${doneStyle}" onclick="openTaskEdit('${task.id}')">${esc(task.name)}</span>
    ${(task.subtasks||[]).length > 0 ? `<span class="task-row-pct" style="font-size:11px;color:#9ca3af">${(task.subtasks||[]).filter(s=>s.done).length}/${(task.subtasks||[]).length}</span>` : ""}
    <span class="task-row-edit" onclick="openTaskEdit('${task.id}')">✎</span>
  </div>`;
}

window.toggleDoneSection = function(header) {
  const body = header.nextElementSibling;
  const toggle = header.querySelector(".done-toggle");
  const collapsed = body.style.display === "none";
  body.style.display = collapsed ? "block" : "none";
  toggle.textContent = collapsed ? "▾" : "▸";
};

// タスクのチェック → 完了/未完了 + 日報反映
window.toggleTaskDone = async function(taskId, checked) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  try {
    await updateDoc(doc(db, "tasks_v2", taskId), { done: checked, updatedAt: Date.now() });
    task.done = checked;
    renderSummaryCards();
    renderTaskList();
    renderWeeklyDone();

    // 日報の「今日やったこと」に反映
    syncTasksToDone();
    saveEngagement();
    renderWeeklyChart();
    window.dispatchEvent(new Event("tasksUpdated"));
  } catch(e) { showToast("更新に失敗しました"); }
};

// 完了済みタスクを日報「今日やったこと」に自動反映
function syncTasksToDone() {
  const doneEl = document.getElementById("reportDone");
  if (!doneEl) return;

  // 今日やることのチェック分
  const today = new Date().toISOString().slice(0,10);
  const checkKey = `tasuku_checks_${today}`;
  let todayChecked = [];
  try { todayChecked = Object.values(JSON.parse(localStorage.getItem(checkKey)||"{}")).filter(v=>typeof v==="string"); } catch(e) {}

  // タスク一覧のチェック分（今日更新されたもの）
  const todayDoneTasks = allTasks
    .filter(t => t.done && t.updatedAt && new Date(t.updatedAt).toISOString().slice(0,10) === today)
    .map(t => t.name);

  const all = [...new Set([...todayChecked, ...todayDoneTasks])];
  if (all.length > 0) {
    doneEl.value = all.map(t => `・${t}`).join("\n");
  }
}

// タスク編集モーダル
window.openTaskEdit = function(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  window._editingHomeTaskId = taskId;
  document.getElementById("editTaskName").value = task.name || "";
  renderEditSubtasks(task.subtasks || []);
  document.getElementById("taskEditOverlay").classList.add("open");
};

function renderEditSubtasks(subtasks) {
  const list = document.getElementById("editSubtaskList");
  if (!list) return;
  list.innerHTML = subtasks.map((s, i) => `
    <div class="edit-subtask-row" data-index="${i}">
      <input type="checkbox" class="subtask-check" ${s.done ? "checked" : ""}
        onchange="toggleHomeSubtask(${i}, this.checked)">
      <input type="text" class="edit-subtask-input" value="${esc(s.text)}"
        onchange="updateHomeSubtask(${i}, this.value)" placeholder="サブタスク名">
      <button class="subtask-remove-btn" onclick="removeHomeSubtask(${i})">✕</button>
    </div>
  `).join("");
}

window.toggleHomeSubtask = (i,v) => { const t=allTasks.find(t=>t.id===window._editingHomeTaskId); if(t?.subtasks?.[i]) t.subtasks[i].done=v; };
window.updateHomeSubtask = (i,v) => { const t=allTasks.find(t=>t.id===window._editingHomeTaskId); if(t?.subtasks?.[i]) t.subtasks[i].text=v; };
window.removeHomeSubtask = (i) => { const t=allTasks.find(t=>t.id===window._editingHomeTaskId); if(!t) return; t.subtasks=(t.subtasks||[]).filter((_,idx)=>idx!==i); renderEditSubtasks(t.subtasks); };

export async function saveHomeTaskEdit() {
  const taskId = window._editingHomeTaskId;
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  const name = document.getElementById("editTaskName").value.trim();
  if (!name) { showToast("タスク名を入力してください"); return; }
  document.querySelectorAll(".edit-subtask-row").forEach((row,i) => {
    if (task.subtasks?.[i]) {
      task.subtasks[i].text = row.querySelector(".edit-subtask-input")?.value || task.subtasks[i].text;
      task.subtasks[i].done = row.querySelector(".subtask-check")?.checked ?? task.subtasks[i].done;
    }
  });
  const subtasks = (task.subtasks||[]).filter(s => s.text?.trim());
  try {
    await updateDoc(doc(db,"tasks_v2",taskId), { name, subtasks, updatedAt:Date.now() });
    task.name=name; task.subtasks=subtasks;
    document.getElementById("taskEditOverlay").classList.remove("open");
    renderTaskList(); showToast("更新しました");
    window.dispatchEvent(new Event("tasksUpdated"));
  } catch(e) { showToast("更新に失敗しました"); }
}

export async function deleteHomeTask() {
  const taskId = window._editingHomeTaskId;
  const task = allTasks.find(t => t.id === taskId);
  if (!confirm(`「${task?.name}」を削除しますか？`)) return;
  try {
    await deleteDoc(doc(db,"tasks_v2",taskId));
    allTasks = allTasks.filter(t => t.id !== taskId);
    document.getElementById("taskEditOverlay").classList.remove("open");
    renderSummaryCards(); renderTaskList(); renderWeeklyDone();
    showToast("削除しました");
    window.dispatchEvent(new Event("tasksUpdated"));
  } catch(e) { showToast("削除に失敗しました"); }
}

// 今週完了
function renderWeeklyDone() {
  const el = document.getElementById("weeklyDoneTasks");
  const countEl = document.getElementById("weeklyDoneCount");
  if (!el) return;
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate()-((now.getDay()||7)-1));
  mon.setHours(0,0,0,0);
  const done = allTasks.filter(t => {
    if (!t.done) return false;
    const ts = t.updatedAt || t.createdAt;
    return ts && new Date(ts) >= mon;
  });
  if (countEl) countEl.textContent = done.length > 0 ? `${done.length}件` : "";
  if (!done.length) {
    el.innerHTML = `<div class="today-task-empty" style="color:var(--text-muted);padding:10px 0;font-size:12px">今週はまだ完了したタスクがありません</div>`;
    return;
  }
  el.innerHTML = done.slice(0,8).map(t => `
    <div class="today-task-item" style="opacity:0.65">
      <span style="color:#10b981;font-size:14px">✓</span>
      <span style="flex:1;text-decoration:line-through;color:var(--text-muted);font-size:13px">${esc(t.name)}</span>
    </div>
  `).join("");
}

// ===== 日別完了率の記録・表示 =====
const ENGAGE_KEY = "tasuku_engage_v1";

// 今日の完了率を保存
export function saveEngagement() {
  const today = new Date().toISOString().slice(0,10);
  const checkKey = `tasuku_checks_${today}`;
  try {
    const checks = JSON.parse(localStorage.getItem(checkKey) || "{}");
    const checkedCount = Object.values(checks).filter(v => typeof v === "string").length;

    // 今日やることの総数を取得（todayTasksのチェックボックス数）
    const totalItems = document.querySelectorAll("#todayTasks .today-task-item").length;
    // タスクの完了数も含める
    const doneTasks = allTasks.filter(t => t.done && t.updatedAt &&
      new Date(t.updatedAt).toISOString().slice(0,10) === today).length;

    const total = Math.max(totalItems, checkedCount, 1);
    const done = Math.max(checkedCount, doneTasks);
    const pct = Math.min(100, Math.round(done / total * 100));

    // 今週の月曜を取得
    const now = new Date(today + "T00:00:00");
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() || 7) - 1));
    const weekKey = mon.toISOString().slice(0,10);

    const data = JSON.parse(localStorage.getItem(ENGAGE_KEY) || "{}");

    // 1週間分(7日)溜まったら古いweekをクリア
    const keys = Object.keys(data);
    if (keys.length > 0) {
      const latestWeek = keys.sort().pop();
      if (latestWeek !== weekKey) {
        // 新しい週になったら古いデータを削除
        keys.forEach(k => { if (k !== weekKey) delete data[k]; });
      }
    }

    if (!data[weekKey]) data[weekKey] = {};
    data[weekKey][today] = { done, total, pct };
    localStorage.setItem(ENGAGE_KEY, JSON.stringify(data));
  } catch(e) { console.warn(e); }
}

function renderWeeklyChart() {
  const canvas = document.getElementById("weeklyChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // 今週月〜金のデータ取得
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() || 7) - 1));
  const weekKey = mon.toISOString().slice(0,10);

  const labels = ["月","火","水","木","金"];
  const days = Array.from({length:5}, (_,i) => {
    const d = new Date(mon); d.setDate(mon.getDate()+i);
    return d.toISOString().slice(0,10);
  });

  // engagementデータ
  const data = JSON.parse(localStorage.getItem(ENGAGE_KEY) || "{}");
  const weekData = data[weekKey] || {};
  const today = todayStr();

  const pcts = days.map(day => weekData[day]?.pct ?? null);
  const dones = days.map(day => weekData[day]?.done ?? 0);
  const totals = days.map(day => weekData[day]?.total ?? 0);

  const padL=36, padR=16, padT=20, padB=32;
  const chartW = w-padL-padR, chartH = h-padT-padB;
  const barW = Math.floor(chartW/5) - 12;

  // グリッド線（0%, 25%, 50%, 75%, 100%）
  ctx.strokeStyle = "#e8eaed"; ctx.lineWidth = 0.5;
  [0,25,50,75,100].forEach(pct => {
    const y = padT + chartH - (chartH * pct / 100);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w-padR, y); ctx.stroke();
    ctx.fillStyle = "#d1d5db";
    ctx.font = "9px 'Noto Sans JP',sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(pct + "%", padL-4, y+3);
  });

  days.forEach((day, i) => {
    const x = padL + i * (chartW/5) + 6;
    const pct = pcts[i];
    const isToday = day === today;
    const isFuture = day > today;

    // バー
    if (pct !== null && !isFuture) {
      const barH = Math.max((pct / 100) * chartH, pct > 0 ? 4 : 0);
      const y = padT + chartH - barH;

      // 色：100%=緑、75%以上=青、50%以上=オレンジ、未満=赤
      let color = pct >= 100 ? "#10b981" : pct >= 75 ? "#3b82f6" : pct >= 50 ? "#f59e0b" : "#ef4444";
      if (isToday) color = "#3b82f6";

      ctx.fillStyle = color + "33"; // 薄い背景
      ctx.fillRect(x, padT, barW, chartH);

      ctx.fillStyle = color;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, barW, barH, [3,3,0,0]);
      else ctx.rect(x, y, barW, barH);
      ctx.fill();

      // パーセント表示
      ctx.fillStyle = color;
      ctx.font = `${isToday ? "bold " : ""}11px 'Noto Sans JP',sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(pct + "%", x + barW/2, y - 4);

      // done/total
      if (totals[i] > 0) {
        ctx.fillStyle = "#9ca3af";
        ctx.font = "10px 'Noto Sans JP',sans-serif";
        ctx.fillText(`${dones[i]}/${totals[i]}`, x + barW/2, padT + chartH + 16);
      }
    } else if (isFuture) {
      // 未来は薄いプレースホルダー
      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(x, padT, barW, chartH);
    } else {
      // データなし（今日含む・未記録）
      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(x, padT, barW, chartH);
      if (isToday) {
        ctx.fillStyle = "#93c5fd";
        ctx.font = "10px 'Noto Sans JP',sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("今日", x + barW/2, padT + chartH/2);
      }
    }

    // 曜日ラベル
    ctx.fillStyle = isToday ? "#3b82f6" : "#9ca3af";
    ctx.font = `${isToday ? "bold " : ""}11px 'Noto Sans JP',sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(labels[i], x + barW/2, h - 10);
  });
}

// クイック追加
function initHomeQuickAdd() {
  const input = document.getElementById("homeQuickInput");
  const btn = document.getElementById("homeQuickBtn");
  if (!input || !btn) return;
  const newBtn = btn.cloneNode(true); btn.parentNode.replaceChild(newBtn,btn);
  const newInput = input.cloneNode(true); input.parentNode.replaceChild(newInput,input);
  const doAdd = async () => {
    const name = newInput.value.trim();
    if (!name) return;
    newInput.value = "";
    try {
      const ref = await addDoc(collection(db,"tasks_v2"), { project:"", name, done:false, subtasks:[], createdAt:Date.now() });
      allTasks.unshift({ id:ref.id, project:"", name, done:false, subtasks:[], createdAt:Date.now() });
      renderSummaryCards(); renderTaskList();
      showToast(`「${name}」を追加しました`);
      window.dispatchEvent(new Event("tasksUpdated"));
    } catch(e) { showToast("追加に失敗しました"); }
  };
  newBtn.addEventListener("click", doAdd);
  newInput.addEventListener("keydown", e => { if(e.key==="Enter") doAdd(); });
}

document.addEventListener("click", e => {
  if (e.target?.id === "addEditSubtaskBtn") {
    const task = allTasks.find(t => t.id === window._editingHomeTaskId);
    if (!task) return;
    if (!task.subtasks) task.subtasks = [];
    task.subtasks.push({ id:crypto.randomUUID(), text:"", done:false });
    renderEditSubtasks(task.subtasks);
    setTimeout(()=>{const inputs=document.querySelectorAll(".edit-subtask-input");inputs[inputs.length-1]?.focus();},50);
  }
});

function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function showToast(msg){const t=document.getElementById("toast");if(!t)return;t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2500);}
