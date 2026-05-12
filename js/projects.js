// js/projects.js - タスク一覧ページ（案件名なし版）
import { db, getDocs, addDoc, updateDoc, deleteDoc, collection, doc } from "./firebase.js";

const STATUSES = ["要対応","対応中","確認中","毎月対応","完了"];
const STATUS_COLORS = {"要対応":"#dc2626","対応中":"#2563eb","確認中":"#7c3aed","毎月対応":"#16a34a","完了":"#6b7280"};
const STATUS_BG = {"要対応":"#fef2f2","対応中":"#eff6ff","確認中":"#f5f3ff","毎月対応":"#f0fdf4","完了":"#f9fafb"};
const STATUS_BORDER = {"要対応":"#fca5a5","対応中":"#93c5fd","確認中":"#c4b5fd","毎月対応":"#86efac","完了":"#d1d5db"};

let allTasks = [];
let editingTaskId = null;
let currentFilter = "all";

export async function initProjects() {
  document.getElementById("taskEditClose")?.addEventListener("click", closeEditModal);
  document.getElementById("taskEditCancel")?.addEventListener("click", closeEditModal);
  document.getElementById("taskEditSave")?.addEventListener("click", saveEdit);
  document.getElementById("taskEditDelete")?.addEventListener("click", deleteTask);
  document.getElementById("taskEditOverlay")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeEditModal();
  });
  document.querySelectorAll(".edit-status-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".edit-status-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
  document.addEventListener("click", e => {
    if (e.target?.id === "addEditSubtaskBtn") addEditSubtask();
  });

  // フィルターボタン
  document.getElementById("taskFilterBtns")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    currentFilter = btn.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderTaskList();
  });

  // タスク追加
  document.getElementById("quickAddSend")?.addEventListener("click", quickAddTask);
  document.getElementById("quickAddInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") quickAddTask();
  });
}

export async function renderProjects() {
  const snap = await getDocs(collection(db, "tasks_v2"));
  allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderStats();
  renderTaskList();
}

function renderStats() {
  const total = allTasks.length;
  const done = allTasks.filter(t => t.status === "完了").length;
  const urgent = allTasks.filter(t => t.status === "要対応").length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;

  const el = document.getElementById("taskPageStats");
  if (!el) return;
  el.innerHTML = `
    <div class="task-stat-card">
      <div class="task-stat-num">${total}</div>
      <div class="task-stat-label">合計</div>
    </div>
    <div class="task-stat-card urgent-stat">
      <div class="task-stat-num" style="color:${urgent > 0 ? "#ef4444" : "#6b7280"}">${urgent}</div>
      <div class="task-stat-label">要対応</div>
    </div>
    <div class="task-stat-card">
      <div class="task-stat-num" style="color:#10b981">${done}</div>
      <div class="task-stat-label">完了</div>
    </div>
    <div class="task-stat-card">
      <div class="task-stat-num" style="color:#3b82f6">${pct}%</div>
      <div class="task-stat-label">完了率</div>
    </div>
  `;
}

function renderTaskList() {
  const el = document.getElementById("taskListBody");
  if (!el) return;

  const filtered = currentFilter === "all"
    ? allTasks
    : allTasks.filter(t => t.status === currentFilter);

  if (!filtered.length) {
    el.innerHTML = `<div class="empty-guide">
      <div class="empty-guide-icon">📋</div>
      <div class="empty-guide-title">${currentFilter === "all" ? "タスクがありません" : `${currentFilter}のタスクはありません`}</div>
      <div class="empty-guide-desc">下の入力欄からタスクを追加できます</div>
    </div>`;
    return;
  }

  // ステータス順にグループ化
  if (currentFilter === "all") {
    let html = "";
    STATUSES.forEach(s => {
      const group = filtered.filter(t => t.status === s);
      if (!group.length) return;
      html += `<div class="task-group">
        <div class="task-group-header">
          <span class="task-group-dot" style="background:${STATUS_COLORS[s]}"></span>
          <span class="task-group-name">${s}</span>
          <span class="task-group-count">${group.length}</span>
        </div>
        ${group.map(t => renderTaskRow(t)).join("")}
      </div>`;
    });
    el.innerHTML = html;
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

  return `<div class="task-row" onclick="openEditModal('${task.id}')">
    <span class="task-row-dot" style="background:${c}"></span>
    <div class="task-row-body">
      <div class="task-row-name">${esc(task.name)}</div>
      ${pct >= 0 ? `<div class="task-row-progress">
        <div class="task-row-bar"><div style="width:${pct}%;height:100%;background:${c};border-radius:2px;transition:width 0.3s"></div></div>
        <span class="task-row-pct">${doneSubs}/${subs.length}</span>
      </div>` : ""}
    </div>
    <span class="task-row-badge" style="background:${bg};color:${c};border-color:${border}">${task.status}</span>
    <span class="task-row-edit">✎</span>
  </div>`;
}

async function quickAddTask() {
  const input = document.getElementById("quickAddInput");
  const name = input?.value.trim();
  if (!name) return;
  input.value = "";
  const data = { project: "", name, status: "要対応", deadline: "", subtasks: [], createdAt: Date.now() };
  try {
    const ref = await addDoc(collection(db, "tasks_v2"), data);
    allTasks.unshift({ id: ref.id, ...data });
    renderStats();
    renderTaskList();
    showToast(`「${name}」を追加しました`);
    window.dispatchEvent(new Event("tasksUpdated"));
  } catch(e) { showToast("追加に失敗しました"); }
}

// ===== EDIT MODAL =====
window.openEditModal = function(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  editingTaskId = taskId;
  document.getElementById("editTaskName").value = task.name || "";
  document.querySelectorAll(".edit-status-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.status === task.status);
  });
  renderEditSubtasks(task.subtasks || []);
  document.getElementById("taskEditOverlay").classList.add("open");
};

function renderEditSubtasks(subtasks) {
  const list = document.getElementById("editSubtaskList");
  list.innerHTML = subtasks.map((s, i) => `
    <div class="edit-subtask-row" data-index="${i}">
      <input type="checkbox" class="subtask-check" ${s.done ? "checked" : ""}
        onchange="toggleEditSubtask(${i}, this.checked)">
      <input type="text" class="edit-subtask-input" value="${esc(s.text)}"
        onchange="updateEditSubtaskText(${i}, this.value)" placeholder="サブタスク名">
      <button class="subtask-remove-btn" onclick="removeEditSubtask(${i})">✕</button>
    </div>
  `).join("");
}

function addEditSubtask() {
  const task = allTasks.find(t => t.id === editingTaskId);
  if (!task) return;
  if (!task.subtasks) task.subtasks = [];
  task.subtasks.push({ id: crypto.randomUUID(), text: "", done: false });
  renderEditSubtasks(task.subtasks);
  setTimeout(() => {
    const inputs = document.querySelectorAll(".edit-subtask-input");
    inputs[inputs.length - 1]?.focus();
  }, 50);
}

window.toggleEditSubtask = function(i, v) {
  const task = allTasks.find(t => t.id === editingTaskId);
  if (task?.subtasks?.[i]) task.subtasks[i].done = v;
};
window.updateEditSubtaskText = function(i, v) {
  const task = allTasks.find(t => t.id === editingTaskId);
  if (task?.subtasks?.[i]) task.subtasks[i].text = v;
};
window.removeEditSubtask = function(i) {
  const task = allTasks.find(t => t.id === editingTaskId);
  if (!task) return;
  task.subtasks = (task.subtasks || []).filter((_, idx) => idx !== i);
  renderEditSubtasks(task.subtasks);
};

function closeEditModal() {
  document.getElementById("taskEditOverlay").classList.remove("open");
  editingTaskId = null;
}

async function saveEdit() {
  const task = allTasks.find(t => t.id === editingTaskId);
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
  const subtasks = (task.subtasks || []).filter(s => s.text?.trim());
  if (!name) { showToast("タスク名を入力してください"); return; }

  try {
    await updateDoc(doc(db, "tasks_v2", editingTaskId), { name, project: "", status, subtasks });
    task.name = name; task.status = status; task.subtasks = subtasks;
    closeEditModal();
    renderStats();
    renderTaskList();
    showToast("更新しました");
    window.dispatchEvent(new Event("tasksUpdated"));
  } catch(e) { showToast("更新に失敗しました"); }
}

async function deleteTask() {
  const task = allTasks.find(t => t.id === editingTaskId);
  if (!confirm(`「${task?.name}」を削除しますか？`)) return;
  try {
    await deleteDoc(doc(db, "tasks_v2", editingTaskId));
    allTasks = allTasks.filter(t => t.id !== editingTaskId);
    closeEditModal();
    renderStats();
    renderTaskList();
    showToast("削除しました");
    window.dispatchEvent(new Event("tasksUpdated"));
  } catch(e) { showToast("削除に失敗しました"); }
}

function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}
