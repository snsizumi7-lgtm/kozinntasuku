// js/projects.js
import { db, getDocs, addDoc, updateDoc, deleteDoc, collection, doc } from "./firebase.js";

const STATUSES = ["要対応","対応中","確認中","毎月対応","完了"];
const STATUS_TEXT = {"要対応":"#dc2626","対応中":"#2563eb","確認中":"#7c3aed","毎月対応":"#16a34a","完了":"#6b7280"};

let allTasks = [];
let currentProject = null;
let editingTaskId = null;

export async function initProjects() {
  document.getElementById("projectBackBtn")?.addEventListener("click", showProjectsList);
  document.getElementById("projectChatSend")?.addEventListener("click", sendProjectChat);
  document.getElementById("projectChatInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") sendProjectChat();
  });

  // モーダルイベント
  document.getElementById("taskEditClose")?.addEventListener("click", closeEditModal);
  document.getElementById("taskEditCancel")?.addEventListener("click", closeEditModal);
  document.getElementById("taskEditSave")?.addEventListener("click", saveEdit);
  document.getElementById("taskEditDelete")?.addEventListener("click", deleteTask);
  document.getElementById("taskEditOverlay")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeEditModal();
  });

  // ステータスボタン
  document.querySelectorAll(".edit-status-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".edit-status-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

export async function renderProjects() {
  const snap = await getDocs(collection(db, "tasks_v2"));
  allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  showProjectsList();
}

function showProjectsList() {
  currentProject = null;
  document.getElementById("projectsList").style.display = "grid";
  document.getElementById("projectDetail").style.display = "none";

  const map = {};
  allTasks.forEach(t => {
    const p = t.project || "（未設定）";
    if (!map[p]) map[p] = { tasks: [] };
    map[p].tasks.push(t);
  });

  const el = document.getElementById("projectsList");
  const entries = Object.entries(map).sort((a, b) => b[1].tasks.length - a[1].tasks.length);

  if (!entries.length) {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1">チャットからタスクを追加すると案件が表示されます</div>';
    return;
  }

  el.innerHTML = entries.map(([name, data]) => {
    const total = data.tasks.length;
    const done = data.tasks.filter(t => t.status === "完了").length;
    const urgent = data.tasks.filter(t => t.status === "要対応").length;
    const working = data.tasks.filter(t => t.status === "対応中").length;
    const pct = Math.round(done / total * 100);
    return `<div class="project-card" onclick="openProject('${esc(name)}')">
      <div class="project-card-name">${esc(name)}</div>
      <div class="project-card-stats">
        <span class="project-stat">全${total}件</span>
        ${urgent > 0 ? `<span class="project-stat urgent">要対応 ${urgent}</span>` : ""}
        ${working > 0 ? `<span class="project-stat">対応中 ${working}</span>` : ""}
        <span class="project-stat">完了 ${done}</span>
      </div>
      <div class="project-progress"><div class="project-progress-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join("");
}

window.openProject = function(name) {
  currentProject = name;
  document.getElementById("projectsList").style.display = "none";
  document.getElementById("projectDetail").style.display = "block";
  document.getElementById("projectDetailName").textContent = name;

  const tasks = allTasks.filter(t => (t.project || "（未設定）") === name);
  const total = tasks.length;
  const done = tasks.filter(t => t.status === "完了").length;
  const urgent = tasks.filter(t => t.status === "要対応").length;
  const working = tasks.filter(t => t.status === "対応中").length;
  const pct = Math.round(done / total * 100);

  document.getElementById("projectDetailStats").innerHTML = `
    <div class="project-detail-stat-card">
      <div class="project-detail-stat-num">${total}</div>
      <div class="project-detail-stat-label">合計</div>
    </div>
    <div class="project-detail-stat-card">
      <div class="project-detail-stat-num" style="color:#ef4444">${urgent}</div>
      <div class="project-detail-stat-label">要対応</div>
    </div>
    <div class="project-detail-stat-card">
      <div class="project-detail-stat-num" style="color:#3b82f6">${working}</div>
      <div class="project-detail-stat-label">対応中</div>
    </div>
    <div class="project-detail-stat-card">
      <div class="project-detail-stat-num" style="color:#10b981">${done}</div>
      <div class="project-detail-stat-label">完了（${pct}%）</div>
    </div>
  `;

  const tasksByStatus = {};
  STATUSES.forEach(s => tasksByStatus[s] = []);
  tasks.forEach(t => { if (tasksByStatus[t.status]) tasksByStatus[t.status].push(t); });

  let html = "";
  STATUSES.forEach(s => {
    const group = tasksByStatus[s];
    if (!group.length) return;
    html += `<div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px;letter-spacing:0.04em">${s}（${group.length}）</div>
      ${group.map(t => `
        <div class="project-task-item" onclick="openEditModal('${t.id}')" style="cursor:pointer">
          <span style="width:8px;height:8px;border-radius:50%;background:${STATUS_TEXT[t.status]};flex-shrink:0;display:inline-block"></span>
          <span style="flex:1">${esc(t.name)}</span>
          ${(t.subtasks||[]).length > 0 ? `<span style="font-size:11px;color:var(--text-muted)">${t.subtasks.filter(s=>s.done).length}/${t.subtasks.length}</span>` : ""}
          <span style="font-size:11px;color:var(--text-muted);margin-left:6px">✎</span>
        </div>
      `).join("")}
    </div>`;
  });

  document.getElementById("projectDetailTasks").innerHTML = html || '<div class="empty-state">タスクなし</div>';
};

// ===== EDIT MODAL =====

window.openEditModal = function(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  editingTaskId = taskId;

  document.getElementById("editTaskName").value = task.name || "";
  document.getElementById("editTaskProject").value = task.project || "";

  // ステータスボタン
  document.querySelectorAll(".edit-status-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.status === task.status);
  });

  // サブタスク
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
        onchange="updateEditSubtask(${i}, 'text', this.value)" placeholder="サブタスク名">
      <button class="subtask-remove-btn" onclick="removeEditSubtask(${i})">✕</button>
    </div>
  `).join("");
}

window.toggleEditSubtask = function(index, checked) {
  const task = allTasks.find(t => t.id === editingTaskId);
  if (!task?.subtasks?.[index]) return;
  task.subtasks[index].done = checked;
};

window.updateEditSubtask = function(index, field, value) {
  const task = allTasks.find(t => t.id === editingTaskId);
  if (!task?.subtasks?.[index]) return;
  task.subtasks[index][field] = value;
};

window.removeEditSubtask = function(index) {
  const task = allTasks.find(t => t.id === editingTaskId);
  if (!task) return;
  task.subtasks = (task.subtasks || []).filter((_, i) => i !== index);
  renderEditSubtasks(task.subtasks);
};

// サブタスク追加ボタン
document.addEventListener("click", e => {
  if (e.target?.id === "addEditSubtaskBtn") {
    const task = allTasks.find(t => t.id === editingTaskId);
    if (!task) return;
    if (!task.subtasks) task.subtasks = [];
    task.subtasks.push({ id: crypto.randomUUID(), text: "", done: false, dueDate: "" });
    renderEditSubtasks(task.subtasks);
    // 最後の入力欄にフォーカス
    setTimeout(() => {
      const inputs = document.querySelectorAll(".edit-subtask-input");
      inputs[inputs.length - 1]?.focus();
    }, 50);
  }
});

function closeEditModal() {
  document.getElementById("taskEditOverlay").classList.remove("open");
  editingTaskId = null;
}

async function saveEdit() {
  const task = allTasks.find(t => t.id === editingTaskId);
  if (!task) return;

  const name = document.getElementById("editTaskName").value.trim();
  const project = document.getElementById("editTaskProject").value.trim();
  const statusBtn = document.querySelector(".edit-status-btn.active");
  const status = statusBtn?.dataset.status || task.status;

  // サブタスクのテキストを最新の入力値で更新
  document.querySelectorAll(".edit-subtask-row").forEach((row, i) => {
    const input = row.querySelector(".edit-subtask-input");
    const cb = row.querySelector(".subtask-check");
    if (task.subtasks?.[i]) {
      task.subtasks[i].text = input?.value || task.subtasks[i].text;
      task.subtasks[i].done = cb?.checked ?? task.subtasks[i].done;
    }
  });

  // 空のサブタスクを除外
  const subtasks = (task.subtasks || []).filter(s => s.text?.trim());

  if (!name) { showToast("タスク名を入力してください"); return; }

  try {
    await updateDoc(doc(db, "tasks_v2", editingTaskId), { name, project, status, subtasks });
    task.name = name;
    task.project = project;
    task.status = status;
    task.subtasks = subtasks;
    closeEditModal();
    showToast("更新しました");
    if (currentProject) window.openProject(currentProject);
    window.dispatchEvent(new Event("tasksUpdated"));
  } catch(e) {
    showToast("更新に失敗しました");
  }
}

async function deleteTask() {
  if (!editingTaskId) return;
  const task = allTasks.find(t => t.id === editingTaskId);
  if (!confirm(`「${task?.name}」を削除しますか？`)) return;

  try {
    await deleteDoc(doc(db, "tasks_v2", editingTaskId));
    allTasks = allTasks.filter(t => t.id !== editingTaskId);
    closeEditModal();
    showToast("削除しました");
    if (currentProject) {
      // 案件にタスクが残っていれば詳細を再描画、なければ一覧に戻る
      const remaining = allTasks.filter(t => (t.project || "（未設定）") === currentProject);
      if (remaining.length > 0) window.openProject(currentProject);
      else showProjectsList();
    }
    window.dispatchEvent(new Event("tasksUpdated"));
  } catch(e) {
    showToast("削除に失敗しました");
  }
}

async function sendProjectChat() {
  const input = document.getElementById("projectChatInput");
  const text = input.value.trim();
  if (!text || !currentProject) return;
  input.value = "";

  const data = {
    project: currentProject,
    name: text,
    status: "要対応",
    deadline: "",
    subtasks: [],
    createdAt: Date.now()
  };

  try {
    const ref = await addDoc(collection(db, "tasks_v2"), data);
    allTasks.push({ id: ref.id, ...data });
    showToast(`「${text}」を追加しました`);
    window.openProject(currentProject);
    window.dispatchEvent(new Event("tasksUpdated"));
  } catch(e) {
    showToast("追加に失敗しました");
  }
}

function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}
