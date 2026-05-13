// js/home.js
import { db, getDocs, addDoc, updateDoc, deleteDoc, collection, doc } from "./firebase.js";
import { todayStr } from "./holidays.js";

const STATUSES = ["要対応","対応中","確認中","毎月対応","完了"];
const STATUS_COLORS = {"要対応":"#dc2626","対応中":"#2563eb","確認中":"#7c3aed","毎月対応":"#16a34a","完了":"#6b7280"};
const STATUS_BG = {"要対応":"#fef2f2","対応中":"#eff6ff","確認中":"#f5f3ff","毎月対応":"#f0fdf4","完了":"#f9fafb"};
const STATUS_BORDER = {"要対応":"#fca5a5","対応中":"#93c5fd","確認中":"#c4b5fd","毎月対応":"#86efac","完了":"#d1d5db"};

let allTasks = [];
let currentFilter = "all";

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
  initFilterBtns();
}

function renderSummaryCards() {
  const el = document.getElementById("summaryCards");
  if (!el) return;
  const today = todayStr();
  const urgent = allTasks.filter(t => t.status === "要対応").length;
  const working = allTasks.filter(t => ["対応中","確認中"].includes(t.status)).length;
  const overdue = allTasks.filter(t => t.deadline && t.deadline < today && t.status !== "完了").length;
  el.innerHTML = `
    <div class="summary-card urgent ${urgent > 0 ? "has-items" : ""}">
      <div class="summary-card-num">${urgent}</div>
      <div class="summary-card-label">要対応</div>
    </div>
    <div class="summary-card working">
      <div class="summary-card-num">${working}</div>
      <div class="summary-card-label">対応中 / 確認中</div>
    </div>
    <div class="summary-card done ${overdue > 0 ? "has-items" : ""}">
      <div class="summary-card-num">${overdue}</div>
      <div class="summary-card-label">期限切れ</div>
    </div>
  `;
}

// ===== 今日やること（日報連携）=====
export async function renderTodaySection() {
  const el = document.getElementById("todayTasks");
  const subEl = document.getElementById("todayFromReport");
  if (!el) return;

  try {
    // タスク一覧が未取得なら取得
    if (!allTasks.length) {
      const tsnap = await getDocs(collection(db, "tasks_v2"));
      allTasks = tsnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

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

// チェック状態を保存 → タスクのステータスも変更 → 日報に自動反映
window.saveTodayCheck = async function(index, checked, taskText) {
  const today = new Date().toISOString().slice(0,10);
  const key = `tasuku_checks_${today}`;
  try {
    const checks = JSON.parse(localStorage.getItem(key) || "{}");
    if (checked) {
      checks[index] = taskText;
    } else {
      delete checks[index];
    }
    localStorage.setItem(key, JSON.stringify(checks));

    // UIのスタイル更新
    const items = document.querySelectorAll(".today-task-item");
    if (items[index]) {
      const span = items[index].querySelector("span");
      if (span) span.style.cssText = checked
        ? "flex:1;text-decoration:line-through;color:#9ca3af"
        : "flex:1";
    }

    // タスクのステータスを変更（名前で照合）
    await syncCheckToTask(taskText, checked);

    // 日報ページの「今日やったこと」に自動反映
    syncCheckedToDone();
  } catch(e) { console.warn(e); }
};

async function syncCheckToTask(taskText, checked) {
  // 完全一致 → 前方一致 → 部分一致で探す
  const task = allTasks.find(t => t.name === taskText)
    || allTasks.find(t => t.name?.includes(taskText) || taskText.includes(t.name || ""));
  if (!task) return;

  const newStatus = checked ? "完了" : "要対応";
  // すでに同じステータスなら何もしない
  if (task.status === newStatus) return;

  try {
    await updateDoc(doc(db, "tasks_v2", task.id), {
      status: newStatus,
      updatedAt: Date.now()
    });
    task.status = newStatus;
    // タスク一覧を再描画
    renderSummaryCards();
    renderTaskList();
    renderWeeklyDone();
    showToast(checked ? `「${task.name}」を完了にしました` : `「${task.name}」を要対応に戻しました`);
    window.dispatchEvent(new Event("tasksUpdated"));
  } catch(e) { console.warn("タスク更新失敗:", e); }
}

function syncCheckedToDone() {
  const today = new Date().toISOString().slice(0,10);
  const key = `tasuku_checks_${today}`;
  try {
    const checks = JSON.parse(localStorage.getItem(key) || "{}");
    const checkedItems = Object.values(checks).filter(v => typeof v === "string");
    const doneEl = document.getElementById("reportDone");
    if (doneEl && checkedItems.length > 0) {
      doneEl.value = checkedItems.map(t => `・${t}`).join("\n");
    }
  } catch(e) {}
}

// ===== タスク一覧（フィルター付き）=====
function initFilterBtns() {
  const container = document.getElementById("homeFilterBtns");
  if (!container) return;
  // 既存イベントを除去
  const newContainer = container.cloneNode(true);
  container.parentNode.replaceChild(newContainer, container);
  newContainer.addEventListener("click", e => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    currentFilter = btn.dataset.filter;
    newContainer.querySelectorAll("[data-filter]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderTaskList();
  });
}

function renderTaskList() {
  const el = document.getElementById("homeTaskList");
  if (!el) return;

  const filtered = currentFilter === "all"
    ? allTasks.filter(t => t.status !== "完了")
    : currentFilter === "完了"
    ? allTasks.filter(t => t.status === "完了")
    : allTasks.filter(t => t.status === currentFilter);

  if (!filtered.length) {
    el.innerHTML = `<div class="empty-guide">
      <div class="empty-guide-icon">✅</div>
      <div class="empty-guide-title">${currentFilter === "all" ? "未完了のタスクはありません" : `${currentFilter}のタスクはありません`}</div>
    </div>`;
    return;
  }

  // ステータス順グループ
  if (currentFilter === "all") {
    let html = "";
    STATUSES.filter(s => s !== "完了").forEach(s => {
      const group = filtered.filter(t => t.status === s);
      if (!group.length) return;
      html += `<div class="task-group" style="margin-bottom:14px">
        <div class="task-group-header">
          <span class="task-group-dot" style="background:${STATUS_COLORS[s]}"></span>
          <span class="task-group-name">${s}</span>
          <span class="task-group-count">${group.length}</span>
        </div>
        ${group.map(t => renderTaskRow(t)).join("")}
      </div>`;
    });
    el.innerHTML = html || '<div class="empty-guide"><div class="empty-guide-title">タスクなし</div></div>';
  } else {
    el.innerHTML = filtered.map(t => renderTaskRow(t)).join("");
  }
}

function renderTaskRow(task) {
  const subs = task.subtasks || [];
  const doneSubs = subs.filter(s => s.done).length;
  const pct = subs.length > 0 ? Math.round(doneSubs / subs.length * 100) : -1;
  const c = STATUS_COLORS[task.status] || "#6b7280";
  const bg = STATUS_BG[task.status] || "#f9fafb";
  const border = STATUS_BORDER[task.status] || "#d1d5db";
  const nextStatus = STATUSES[(STATUSES.indexOf(task.status) + 1) % STATUSES.length];

  return `<div class="task-row">
    <span class="task-row-dot" style="background:${c}"></span>
    <div class="task-row-body" onclick="openTaskEdit('${task.id}')">
      <div class="task-row-name">${esc(task.name)}</div>
      ${pct >= 0 ? `<div class="task-row-progress">
        <div class="task-row-bar"><div style="width:${pct}%;height:100%;background:${c};border-radius:2px"></div></div>
        <span class="task-row-pct">${doneSubs}/${subs.length}</span>
      </div>` : ""}
    </div>
    <button class="task-row-badge" style="background:${bg};color:${c};border:1px solid ${border};cursor:pointer"
      onclick="homeCycleStatus('${task.id}')" title="→${nextStatus}">${task.status}</button>
    <span class="task-row-edit" onclick="openTaskEdit('${task.id}')">✎</span>
  </div>`;
}

// ステータスワンタップ変更
window.homeCycleStatus = async function(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  const next = STATUSES[(STATUSES.indexOf(task.status) + 1) % STATUSES.length];
  try {
    await updateDoc(doc(db, "tasks_v2", taskId), { status: next, updatedAt: Date.now() });
    task.status = next;
    renderSummaryCards();
    renderTaskList();
    renderWeeklyDone();
    showToast(`→ ${next}`);
    window.dispatchEvent(new Event("tasksUpdated"));
  } catch(e) { showToast("更新に失敗しました"); }
};

// タスク編集モーダル（ホームから開く）
window.openTaskEdit = function(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  window._editingHomeTaskId = taskId;
  document.getElementById("editTaskName").value = task.name || "";
  document.querySelectorAll(".edit-status-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.status === task.status);
  });
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

window.toggleHomeSubtask = (i, v) => {
  const t = allTasks.find(t => t.id === window._editingHomeTaskId);
  if (t?.subtasks?.[i]) t.subtasks[i].done = v;
};
window.updateHomeSubtask = (i, v) => {
  const t = allTasks.find(t => t.id === window._editingHomeTaskId);
  if (t?.subtasks?.[i]) t.subtasks[i].text = v;
};
window.removeHomeSubtask = (i) => {
  const t = allTasks.find(t => t.id === window._editingHomeTaskId);
  if (!t) return;
  t.subtasks = (t.subtasks||[]).filter((_,idx) => idx !== i);
  renderEditSubtasks(t.subtasks);
};

export async function saveHomeTaskEdit() {
  const taskId = window._editingHomeTaskId;
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  const name = document.getElementById("editTaskName").value.trim();
  const statusBtn = document.querySelector(".edit-status-btn.active");
  const status = statusBtn?.dataset.status || task.status;
  document.querySelectorAll(".edit-subtask-row").forEach((row, i) => {
    if (task.subtasks?.[i]) {
      task.subtasks[i].text = row.querySelector(".edit-subtask-input")?.value || task.subtasks[i].text;
      task.subtasks[i].done = row.querySelector(".subtask-check")?.checked ?? task.subtasks[i].done;
    }
  });
  const subtasks = (task.subtasks||[]).filter(s => s.text?.trim());
  if (!name) { showToast("タスク名を入力してください"); return; }
  try {
    await updateDoc(doc(db, "tasks_v2", taskId), { name, project:"", status, subtasks, updatedAt: Date.now() });
    task.name = name; task.status = status; task.subtasks = subtasks;
    document.getElementById("taskEditOverlay").classList.remove("open");
    renderSummaryCards(); renderTaskList(); renderWeeklyDone();
    showToast("更新しました");
    window.dispatchEvent(new Event("tasksUpdated"));
  } catch(e) { showToast("更新に失敗しました"); }
}

export async function deleteHomeTask() {
  const taskId = window._editingHomeTaskId;
  const task = allTasks.find(t => t.id === taskId);
  if (!confirm(`「${task?.name}」を削除しますか？`)) return;
  try {
    await deleteDoc(doc(db, "tasks_v2", taskId));
    allTasks = allTasks.filter(t => t.id !== taskId);
    document.getElementById("taskEditOverlay").classList.remove("open");
    renderSummaryCards(); renderTaskList(); renderWeeklyDone();
    showToast("削除しました");
    window.dispatchEvent(new Event("tasksUpdated"));
  } catch(e) { showToast("削除に失敗しました"); }
}

// ===== 今週完了 =====
function renderWeeklyDone() {
  const el = document.getElementById("weeklyDoneTasks");
  const countEl = document.getElementById("weeklyDoneCount");
  if (!el) return;
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay()||7)-1));
  mon.setHours(0,0,0,0);
  const done = allTasks.filter(t => {
    if (t.status !== "完了") return false;
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

// ===== 週グラフ =====
function renderWeeklyChart() {
  const canvas = document.getElementById("weeklyChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  const labels = ["月","火","水","木","金","土","日"];
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate()-((now.getDay()||7)-1));
  const days = Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d.toISOString().slice(0,10);});
  const counts = days.map(day=>allTasks.filter(t=>t.createdAt&&new Date(t.createdAt).toISOString().slice(0,10)===day).length);
  const maxVal = Math.max(...counts,1);
  const padL=30,padR=10,padT=16,padB=26;
  const chartW=w-padL-padR,chartH=h-padT-padB;
  const barW=Math.floor(chartW/7)-8;
  ctx.strokeStyle="#e8eaed";ctx.lineWidth=0.5;
  for(let i=0;i<=4;i++){const y=padT+chartH-(chartH*i/4);ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(w-padR,y);ctx.stroke();}
  const today=todayStr();
  days.forEach((day,i)=>{
    const x=padL+i*(chartW/7)+4,barH=counts[i]>0?Math.max((counts[i]/maxVal)*chartH,4):0,y=padT+chartH-barH;
    ctx.fillStyle=day===today?"#3b82f6":"#bfdbfe";
    ctx.beginPath();
    if(ctx.roundRect)ctx.roundRect(x,y,barW,barH,[3,3,0,0]);else ctx.rect(x,y,barW,barH);
    ctx.fill();
    ctx.fillStyle="#9ca3af";ctx.font="11px 'Noto Sans JP',sans-serif";ctx.textAlign="center";
    ctx.fillText(labels[i],x+barW/2,h-6);
    if(counts[i]>0){ctx.fillStyle="#6b7280";ctx.fillText(counts[i],x+barW/2,y-4);}
  });
}

// ===== クイック追加 =====
function initHomeQuickAdd() {
  const input = document.getElementById("homeQuickInput");
  const btn = document.getElementById("homeQuickBtn");
  if (!input || !btn) return;
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  const doAdd = async () => {
    const name = newInput.value.trim();
    if (!name) return;
    newInput.value = "";
    try {
      const ref = await addDoc(collection(db, "tasks_v2"), { project:"", name, status:"要対応", deadline:"", subtasks:[], createdAt:Date.now() });
      allTasks.unshift({ id:ref.id, project:"", name, status:"要対応", deadline:"", subtasks:[], createdAt:Date.now() });
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
    task.subtasks.push({ id: crypto.randomUUID(), text:"", done:false });
    renderEditSubtasks(task.subtasks);
    setTimeout(()=>{const inputs=document.querySelectorAll(".edit-subtask-input");inputs[inputs.length-1]?.focus();},50);
  }
});

function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function showToast(msg){const t=document.getElementById("toast");if(!t)return;t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2500);}
