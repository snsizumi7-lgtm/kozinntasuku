// js/tasks.js
import { db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, getDoc } from "./firebase.js";
import { todayStr, countBusinessDays } from "./holidays.js";

export const STATUSES = ["要対応","対応中","確認中","毎月対応","完了"];

export let tasks = [];
let editingTaskId = null;

export async function loadTasks() {
  const snap = await getDocs(collection(db, "tasks_v2"));
  tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return tasks;
}

export function renderTasks(sortKey = "status") {
  const container = document.getElementById("tasksContainer");
  if (!container) return;
  if (tasks.length === 0) { container.innerHTML = '<div class="empty-state">タスクがありません</div>'; return; }

  let sorted = [...tasks];
  if (sortKey === "project") sorted.sort((a,b) => (a.project||"").localeCompare(b.project||"","ja"));
  else if (sortKey === "deadline") sorted.sort((a,b) => (a.deadline||"9999").localeCompare(b.deadline||"9999"));

  const grouped = {};
  STATUSES.forEach(s => { grouped[s] = []; });
  sorted.forEach(t => { const s = t.status||"要対応"; if(grouped[s]) grouped[s].push(t); else grouped["要対応"].push(t); });

  container.innerHTML = STATUSES.map(status => {
    const group = grouped[status];
    if (sortKey !== "status" && group.length === 0) return "";
    return `<div class="status-group" data-status="${status}">
      <div class="status-group-header" onclick="toggleGroup(this)">
        <span class="status-dot dot-${status}"></span>
        <span class="status-group-name">${status}</span>
        <span class="status-count">${group.length}</span>
        <span class="status-group-toggle">▾</span>
      </div>
      <div class="status-group-body">
        ${group.length === 0 ? '<div class="empty-state">タスクなし</div>' : group.map(t => renderTaskCard(t)).join("")}
      </div>
    </div>`;
  }).join("");

  attachTaskEvents();
}

function dlClass(d) {
  if (!d) return "";
  const b = countBusinessDays(todayStr(), d);
  return b < 0 ? "over" : b <= 3 ? "near" : "";
}

function dlLabel(d) {
  if (!d) return "納期を設定";
  const b = countBusinessDays(todayStr(), d);
  const dt = new Date(d + "T00:00:00");
  const s = `${dt.getMonth()+1}/${dt.getDate()}`;
  if (b < 0) return `${s}（${Math.abs(b)}日超過）`;
  if (b === 0) return `${s}（本日）`;
  return `${s}（残${b}日）`;
}

function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

function renderTaskCard(task) {
  const subs = task.subtasks || [];
  const pct = subs.length > 0 ? Math.round(subs.filter(s=>s.done).length / subs.length * 100) : 0;
  const subsHTML = subs.length > 0 ? `<div class="subtasks">
    ${subs.map(s => {
      const sc = dlClass(s.dueDate), sl = dlLabel(s.dueDate);
      return `<div class="subtask-row">
        <input type="checkbox" class="subtask-check" ${s.done?"checked":""} data-task="${task.id}" data-sub="${s.id}" onchange="toggleSubtask(this)">
        <span class="subtask-text ${s.done?"done":""}">${esc(s.text)}</span>
        <label class="sub-deadline-wrap">
          <span class="sub-deadline-btn ${sc}" data-task="${task.id}" data-sub="${s.id}">📅 ${sl}</span>
          <input type="date" class="sub-deadline-input" data-task="${task.id}" data-sub="${s.id}" value="${s.dueDate||""}">
        </label>
      </div>`;
    }).join("")}
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
  </div>` : "";

  return `<div class="task-card" data-id="${task.id}">
    <div class="task-card-header">
      <span class="task-project">${esc(task.project)}</span>
      <span class="task-name">${esc(task.name)}</span>
      <div class="task-actions">
        <button class="task-action-btn edit" data-id="${task.id}">✎</button>
        <button class="task-action-btn delete" data-id="${task.id}">✕</button>
      </div>
    </div>
    <div class="task-meta">
      <span class="status-badge badge-${task.status}" data-id="${task.id}">${task.status}</span>
    </div>
    ${subsHTML}
  </div>`;
}

function attachTaskEvents() {
  document.querySelectorAll(".status-badge").forEach(el => {
    el.addEventListener("click", async () => {
      const task = tasks.find(t => t.id === el.dataset.id); if (!task) return;
      const next = STATUSES[(STATUSES.indexOf(task.status)+1) % STATUSES.length];
      await updateDoc(doc(db,"tasks_v2",task.id), {status:next});
      task.status = next;
      renderTasks(document.getElementById("sortSelect")?.value||"status");
      showToast(`ステータス → ${next}`);
      window.dispatchEvent(new Event("tasksUpdated"));
    });
  });
  document.querySelectorAll(".task-action-btn.edit").forEach(el => el.addEventListener("click", () => openEditModal(el.dataset.id)));
  document.querySelectorAll(".task-action-btn.delete").forEach(el => {
    el.addEventListener("click", async () => {
      if (!confirm("削除しますか？")) return;
      await deleteDoc(doc(db,"tasks_v2",el.dataset.id));
      tasks = tasks.filter(t => t.id !== el.dataset.id);
      renderTasks(document.getElementById("sortSelect")?.value||"status");
      showToast("削除しました");
      window.dispatchEvent(new Event("tasksUpdated"));
    });
  });
  document.querySelectorAll(".sub-deadline-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const input = btn.closest(".sub-deadline-wrap").querySelector(".sub-deadline-input");
      try { input.showPicker(); } catch { input.click(); }
    });
  });
  document.querySelectorAll(".sub-deadline-input").forEach(input => {
    input.addEventListener("change", async () => {
      const task = tasks.find(t => t.id === input.dataset.task); if (!task) return;
      const sub = task.subtasks?.find(s => s.id === input.dataset.sub); if (!sub) return;
      sub.dueDate = input.value;
      await updateDoc(doc(db,"tasks_v2",task.id), {subtasks:task.subtasks});
      renderTasks(document.getElementById("sortSelect")?.value||"status");
      showToast("納期を更新しました");
      window.dispatchEvent(new Event("tasksUpdated"));
    });
  });
}

window.toggleGroup = h => h.parentElement.classList.toggle("collapsed");
window.toggleSubtask = async cb => {
  const task = tasks.find(t => t.id === cb.dataset.task); if (!task) return;
  const sub = task.subtasks?.find(s => s.id === cb.dataset.sub); if (!sub) return;
  sub.done = cb.checked;
  await updateDoc(doc(db,"tasks_v2",task.id), {subtasks:task.subtasks});
  renderTasks(document.getElementById("sortSelect")?.value||"status");
  window.dispatchEvent(new Event("tasksUpdated"));
};

export function openAddModal() {
  editingTaskId = null;
  document.getElementById("modalTitle").textContent = "タスク追加";
  document.getElementById("taskProject").value = "";
  document.getElementById("taskName").value = "";
  document.getElementById("subtaskList").innerHTML = "";
  setStatusBtn("要対応");
  document.getElementById("modalOverlay").classList.add("open");
}

function openEditModal(id) {
  const task = tasks.find(t => t.id === id); if (!task) return;
  editingTaskId = id;
  document.getElementById("modalTitle").textContent = "タスク編集";
  document.getElementById("taskProject").value = task.project||"";
  document.getElementById("taskName").value = task.name||"";
  setStatusBtn(task.status||"要対応");
  const list = document.getElementById("subtaskList");
  list.innerHTML = "";
  (task.subtasks||[]).forEach(s => addSubtaskRow(s));
  document.getElementById("modalOverlay").classList.add("open");
}

export function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
  editingTaskId = null;
}

function setStatusBtn(status) {
  document.getElementById("taskStatus").value = status;
  document.querySelectorAll(".status-btn").forEach(b => b.classList.toggle("active", b.dataset.status === status));
}

export function initStatusButtons() {
  document.querySelectorAll(".status-btn").forEach(b => b.addEventListener("click", () => setStatusBtn(b.dataset.status)));
}

export function addSubtaskRow(sub = null) {
  const list = document.getElementById("subtaskList");
  const row = document.createElement("div");
  row.className = "subtask-editor-row";
  const subId = sub?.id || crypto.randomUUID();
  row.innerHTML = `
    <input type="text" placeholder="サブタスク名" value="${esc(sub?.text||"")}" data-field="text" data-id="${subId}">
    <input type="date" data-field="dueDate" data-id="${subId}" value="${sub?.dueDate||""}">
    <button class="subtask-remove-btn" onclick="this.parentElement.remove()">✕</button>`;
  list.appendChild(row);
}

export async function saveTask() {
  const project = document.getElementById("taskProject").value.trim();
  const name = document.getElementById("taskName").value.trim();
  const status = document.getElementById("taskStatus").value;
  if (!name) { showToast("タスク名を入力してください"); return; }

  const subtasks = [];
  document.querySelectorAll(".subtask-editor-row").forEach(row => {
    const text = row.querySelector("[data-field='text']").value.trim();
    if (!text) return;
    const id = row.querySelector("[data-field='text']").dataset.id;
    const dueDate = row.querySelector("[data-field='dueDate']").value;
    let done = false;
    if (editingTaskId) { const t = tasks.find(t=>t.id===editingTaskId); const e = t?.subtasks?.find(s=>s.id===id); done = e?.done||false; }
    subtasks.push({ id, text, dueDate, done });
  });

  const data = { project, name, status, deadline: "", subtasks };
  if (editingTaskId) {
    await updateDoc(doc(db,"tasks_v2",editingTaskId), data);
    const idx = tasks.findIndex(t => t.id === editingTaskId);
    if (idx >= 0) tasks[idx] = { ...tasks[idx], ...data };
    showToast("更新しました");
  } else {
    data.createdAt = Date.now();
    const ref = await addDoc(collection(db,"tasks_v2"), data);
    tasks.push({ id: ref.id, ...data });
    showToast("追加しました");
  }
  closeModal();
  renderTasks(document.getElementById("sortSelect")?.value||"status");
  window.dispatchEvent(new Event("tasksUpdated"));
}

export function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}
