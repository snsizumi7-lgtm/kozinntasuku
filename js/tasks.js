// js/tasks.js
import { db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, getDoc } from "./firebase.js";
import { todayStr, countBusinessDays } from "./holidays.js";

export const STATUSES = [
  "要対応","対応中","確認中","毎月対応","完了"
];

export let tasks = [];
export let projects = [];
let editingTaskId = null;

export async function loadMeta() {
  try {
    const snap = await getDoc(doc(db, "meta", "config"));
    if (snap.exists()) {
      const data = snap.data();
      projects = data.projects || [];
    }
  } catch (e) {
    console.warn("meta/config not found:", e);
  }
}

export async function loadTasks() {
  const snap = await getDocs(collection(db, "tasks_v2"));
  tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return tasks;
}

export function renderTasks(sortKey = "status") {
  const container = document.getElementById("tasksContainer");
  if (!container) return;

  if (tasks.length === 0) {
    container.innerHTML = '<div class="empty-state">タスクがありません</div>';
    return;
  }

  let sorted = [...tasks];
  if (sortKey === "project") {
    sorted.sort((a, b) => (a.project || "").localeCompare(b.project || "", "ja"));
  } else if (sortKey === "deadline") {
    sorted.sort((a, b) => {
      const da = a.deadline || "9999-99-99";
      const db2 = b.deadline || "9999-99-99";
      return da.localeCompare(db2);
    });
  }

  const grouped = {};
  STATUSES.forEach(s => { grouped[s] = []; });
  sorted.forEach(t => {
    const s = t.status || "要対応";
    if (grouped[s]) grouped[s].push(t);
    else grouped["要対応"].push(t);
  });

  container.innerHTML = STATUSES.map(status => {
    const group = grouped[status];
    if (sortKey !== "status" && group.length === 0) return "";
    return renderStatusGroup(status, group);
  }).join("");

  attachTaskEvents();
}

function renderStatusGroup(status, taskList) {
  return `
    <div class="status-group" data-status="${status}">
      <div class="status-group-header" onclick="toggleGroup(this)">
        <span class="status-dot dot-${status}"></span>
        <span class="status-group-name">${status}</span>
        <span class="status-count">${taskList.length}</span>
        <span class="status-group-toggle">▾</span>
      </div>
      <div class="status-group-body">
        ${taskList.length === 0
          ? '<div class="empty-state">タスクなし</div>'
          : taskList.map(t => renderTaskCard(t)).join("")}
      </div>
    </div>
  `;
}

function deadlineClass(dateStr) {
  if (!dateStr) return "";
  const today = todayStr();
  const bdays = countBusinessDays(today, dateStr);
  if (bdays < 0) return "over";
  if (bdays <= 3) return "near";
  return "";
}

function deadlineLabel(dateStr) {
  if (!dateStr) return "納期を設定";
  const today = todayStr();
  const bdays = countBusinessDays(today, dateStr);
  // YYYY-MM-DD → M/D に整形
  const d = new Date(dateStr + "T00:00:00");
  const short = `${d.getMonth()+1}/${d.getDate()}`;
  if (bdays < 0) return `${short}（${Math.abs(bdays)}日超過）`;
  if (bdays === 0) return `${short}（本日）`;
  return `${short}（残${bdays}日）`;
}

function renderTaskCard(task) {
  const subs = task.subtasks || [];
  const doneSubs = subs.filter(s => s.done).length;
  const pct = subs.length > 0 ? Math.round(doneSubs / subs.length * 100) : 0;

  const subtasksHTML = subs.length > 0 ? `
    <div class="subtasks">
      ${subs.map(s => {
        const sDlClass = deadlineClass(s.dueDate);
        const sDlLabel = deadlineLabel(s.dueDate);
        return `
          <div class="subtask-row">
            <input type="checkbox" class="subtask-check" ${s.done ? "checked" : ""}
              data-task="${task.id}" data-sub="${s.id}" onchange="toggleSubtask(this)">
            <span class="subtask-text ${s.done ? "done" : ""}">${esc(s.text)}</span>
            <label class="sub-deadline-wrap">
              <span class="sub-deadline-btn ${sDlClass}" data-task="${task.id}" data-sub="${s.id}">
                📅 ${sDlLabel}
              </span>
              <input type="date" class="sub-deadline-input" data-task="${task.id}" data-sub="${s.id}" value="${s.dueDate || ""}">
            </label>
          </div>
        `;
      }).join("")}
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
    </div>
  ` : "";

  return `
    <div class="task-card" data-id="${task.id}">
      <div class="task-card-header">
        <span class="task-project">${esc(task.project || "")}</span>
        <span class="task-name">${esc(task.name || "")}</span>
        <div class="task-actions">
          <button class="task-action-btn edit" data-id="${task.id}" title="編集">✎</button>
          <button class="task-action-btn delete" data-id="${task.id}" title="削除">✕</button>
        </div>
      </div>
      <div class="task-meta">
        <span class="status-badge badge-${task.status}" data-id="${task.id}">${task.status}</span>
      </div>
      ${subtasksHTML}
    </div>
  `;
}

function esc(str) {
  return String(str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function attachTaskEvents() {
  // ステータスバッジクリック
  document.querySelectorAll(".status-badge").forEach(el => {
    el.addEventListener("click", async () => {
      const id = el.dataset.id;
      const task = tasks.find(t => t.id === id);
      if (!task) return;
      const idx = STATUSES.indexOf(task.status);
      const next = STATUSES[(idx + 1) % STATUSES.length];
      await updateDoc(doc(db, "tasks_v2", id), { status: next });
      task.status = next;
      renderTasks(document.getElementById("sortSelect")?.value || "status");
      showToast(`ステータス → ${next}`);
    });
  });

  // 編集
  document.querySelectorAll(".task-action-btn.edit").forEach(el => {
    el.addEventListener("click", () => openEditModal(el.dataset.id));
  });

  // 削除
  document.querySelectorAll(".task-action-btn.delete").forEach(el => {
    el.addEventListener("click", async () => {
      if (!confirm("このタスクを削除しますか？")) return;
      await deleteDoc(doc(db, "tasks_v2", el.dataset.id));
      tasks = tasks.filter(t => t.id !== el.dataset.id);
      renderTasks(document.getElementById("sortSelect")?.value || "status");
      showToast("削除しました");
      window.dispatchEvent(new Event("tasksUpdated"));
    });
  });

  // サブタスク納期ボタン → カレンダーを開く
  document.querySelectorAll(".sub-deadline-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wrap = btn.closest(".sub-deadline-wrap");
      const input = wrap.querySelector(".sub-deadline-input");
      try { input.showPicker(); } catch { input.click(); }
    });
  });

  // サブタスク納期 変更保存
  document.querySelectorAll(".sub-deadline-input").forEach(input => {
    input.addEventListener("change", async () => {
      const taskId = input.dataset.task;
      const subId = input.dataset.sub;
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;
      const sub = task.subtasks?.find(s => s.id === subId);
      if (!sub) return;
      sub.dueDate = input.value;
      await updateDoc(doc(db, "tasks_v2", taskId), { subtasks: task.subtasks });
      renderTasks(document.getElementById("sortSelect")?.value || "status");
      showToast("納期を更新しました");
      window.dispatchEvent(new Event("tasksUpdated"));
    });
  });
}

window.toggleGroup = function(header) {
  header.parentElement.classList.toggle("collapsed");
};

window.toggleSubtask = async function(checkbox) {
  const taskId = checkbox.dataset.task;
  const subId = checkbox.dataset.sub;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const sub = task.subtasks?.find(s => s.id === subId);
  if (!sub) return;
  sub.done = checkbox.checked;
  await updateDoc(doc(db, "tasks_v2", taskId), { subtasks: task.subtasks });
  renderTasks(document.getElementById("sortSelect")?.value || "status");
  window.dispatchEvent(new Event("tasksUpdated"));
};

// ============ MODAL ============

export function openAddModal() {
  editingTaskId = null;
  document.getElementById("modalTitle").textContent = "タスク追加";
  document.getElementById("taskProject").value = "";
  document.getElementById("taskName").value = "";
  document.getElementById("taskDeadline").value = "";
  document.getElementById("subtaskList").innerHTML = "";
  setStatusBtn("要対応");
  document.getElementById("modalOverlay").classList.add("open");
}

function openEditModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  editingTaskId = id;
  document.getElementById("modalTitle").textContent = "タスク編集";
  document.getElementById("taskProject").value = task.project || "";
  document.getElementById("taskName").value = task.name || "";
  document.getElementById("taskDeadline").value = task.deadline || "";
  setStatusBtn(task.status || "要対応");
  const list = document.getElementById("subtaskList");
  list.innerHTML = "";
  (task.subtasks || []).forEach(s => addSubtaskRow(s));
  document.getElementById("modalOverlay").classList.add("open");
}

export function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
  editingTaskId = null;
}

export function populateProjectSelect() {}

function setStatusBtn(status) {
  document.getElementById("taskStatus").value = status;
  document.querySelectorAll(".status-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.status === status);
  });
}

export function initStatusButtons() {
  document.querySelectorAll(".status-btn").forEach(btn => {
    btn.addEventListener("click", () => setStatusBtn(btn.dataset.status));
  });
}

export function addSubtaskRow(sub = null) {
  const list = document.getElementById("subtaskList");
  const row = document.createElement("div");
  row.className = "subtask-editor-row";
  const subId = sub?.id || crypto.randomUUID();
  row.innerHTML = `
    <input type="text" placeholder="サブタスク名" value="${esc(sub?.text || "")}" data-field="text" data-id="${subId}">
    <input type="date" data-field="dueDate" data-id="${subId}" value="${sub?.dueDate || ""}">
    <button class="subtask-remove-btn" onclick="this.parentElement.remove()">✕</button>
  `;
  list.appendChild(row);
}

export async function saveTask() {
  const project = document.getElementById("taskProject").value.trim();
  const name = document.getElementById("taskName").value.trim();
  const status = document.getElementById("taskStatus").value;
  const deadline = document.getElementById("taskDeadline").value;

  if (!name) { showToast("タスク名を入力してください"); return; }

  const subtasks = [];
  document.querySelectorAll(".subtask-editor-row").forEach(row => {
    const text = row.querySelector("[data-field='text']").value.trim();
    if (!text) return;
    const id = row.querySelector("[data-field='text']").dataset.id;
    const dueDate = row.querySelector("[data-field='dueDate']").value;
    let done = false;
    if (editingTaskId) {
      const task = tasks.find(t => t.id === editingTaskId);
      const existing = task?.subtasks?.find(s => s.id === id);
      done = existing?.done || false;
    }
    subtasks.push({ id, text, dueDate, done });
  });

  const data = { project, name, status, deadline, subtasks };

  if (editingTaskId) {
    await updateDoc(doc(db, "tasks_v2", editingTaskId), data);
    const idx = tasks.findIndex(t => t.id === editingTaskId);
    if (idx >= 0) tasks[idx] = { ...tasks[idx], ...data };
    showToast("更新しました");
  } else {
    data.createdAt = Date.now();
    const ref = await addDoc(collection(db, "tasks_v2"), data);
    tasks.push({ id: ref.id, ...data });
    showToast("追加しました");
  }

  closeModal();
  renderTasks(document.getElementById("sortSelect")?.value || "status");
  window.dispatchEvent(new Event("tasksUpdated"));
}

export function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}
