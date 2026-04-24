// js/app.js
import {
  loadMeta, loadTasks, renderTasks, openAddModal, closeModal,
  saveTask, addSubtaskRow, populateProjectSelect, showToast
} from "./tasks.js";
import { initCalendar, renderCalendar } from "./calendar.js";
import { initReport } from "./report.js";

// ============ NAVIGATION ============

function initNav() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;
      document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      const pageEl = document.getElementById(`page-${page}`);
      if (pageEl) pageEl.classList.add("active");
      if (page === "calendar") renderCalendar();
    });
  });
}

// ============ SIDEBAR RESIZE ============

function initSidebarResize() {
  const resizer = document.getElementById("sidebarResizer");
  const sidebar = document.getElementById("sidebar");
  let dragging = false;
  let startX, startW;

  resizer.addEventListener("mousedown", (e) => {
    dragging = true;
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    resizer.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const newW = Math.min(320, Math.max(160, startW + (e.clientX - startX)));
    sidebar.style.width = newW + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });
}

// ============ MODAL ============

function initModal() {
  document.getElementById("addTaskBtn").addEventListener("click", () => {
    populateProjectSelect();
    openAddModal();
  });

  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalCancel").addEventListener("click", closeModal);

  document.getElementById("modalSave").addEventListener("click", saveTask);

  document.getElementById("addSubtaskBtn").addEventListener("click", () => {
    addSubtaskRow();
  });

  // Close on overlay click
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
}

// ============ SORT ============

function initSort() {
  document.getElementById("sortSelect").addEventListener("change", (e) => {
    renderTasks(e.target.value);
  });
}

// ============ INIT ============

async function init() {
  initNav();
  initSidebarResize();
  initModal();
  initSort();
  initCalendar();
  initReport();

  try {
    await loadMeta();
    await loadTasks();
    renderTasks("status");
  } catch (e) {
    console.error("初期化エラー:", e);
    document.getElementById("tasksContainer").innerHTML = `
      <div class="empty-state">
        データの読み込みに失敗しました。<br>
        Firestoreのセキュリティルールを確認してください。
      </div>
    `;
  }
}

init();
