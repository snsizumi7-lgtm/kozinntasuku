// js/app.js
import { loadTasks, renderTasks, openAddModal, closeModal, saveTask, addSubtaskRow, initStatusButtons, showToast } from "./tasks.js";
import { initCalendar, renderCalendar } from "./calendar.js";
import { initReport } from "./report.js";
import { renderHome } from "./home.js";
import { initChat } from "./chat.js";

// ===== NAVIGATION =====
function switchPage(page) {
  document.querySelectorAll(".nav-item, .bottom-nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(`page-${page}`)?.classList.add("active");

  const topbar = document.getElementById("globalTopbar");
  if (topbar) topbar.style.display = page === "tasks" ? "flex" : "none";

  if (page === "calendar") renderCalendar();
  if (page === "home") renderHome();
}

function initNav() {
  document.querySelectorAll(".nav-item, .bottom-nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchPage(btn.dataset.page));
  });

  // モバイル判定
  const bottomNav = document.getElementById("bottomNav");
  if (bottomNav) {
    const mq = window.matchMedia("(max-width: 768px)");
    const toggle = e => { bottomNav.style.display = e.matches ? "flex" : "none"; };
    mq.addEventListener("change", toggle);
    toggle(mq);
  }
}

// ===== SIDEBAR RESIZE =====
function initSidebarResize() {
  const resizer = document.getElementById("sidebarResizer");
  const sidebar = document.getElementById("sidebar");
  const topbar = document.getElementById("globalTopbar");
  let dragging = false, startX, startW;

  resizer?.addEventListener("mousedown", e => {
    dragging = true; startX = e.clientX; startW = sidebar.offsetWidth;
    resizer.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });
  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const newW = Math.min(300, Math.max(160, startW + (e.clientX - startX)));
    sidebar.style.width = newW + "px";
    if (topbar) topbar.style.left = newW + "px";
    document.querySelector(".main-content").style.marginLeft = "0";
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });
}

// ===== MODAL =====
function initModal() {
  document.getElementById("addTaskBtn")?.addEventListener("click", openAddModal);
  document.getElementById("modalClose")?.addEventListener("click", closeModal);
  document.getElementById("modalCancel")?.addEventListener("click", closeModal);
  document.getElementById("modalSave")?.addEventListener("click", saveTask);
  document.getElementById("addSubtaskBtn")?.addEventListener("click", () => addSubtaskRow());
  document.getElementById("modalOverlay")?.addEventListener("click", e => { if (e.target === e.currentTarget) closeModal(); });
}

// ===== SORT =====
function initSort() {
  document.getElementById("sortSelect")?.addEventListener("change", e => renderTasks(e.target.value));
}

// ===== INIT =====
async function init() {
  initNav();
  initSidebarResize();
  initModal();
  initStatusButtons();
  initSort();
  initCalendar();
  initReport();
  initChat();

  // topbarは最初はhomeなので非表示
  const topbar = document.getElementById("globalTopbar");
  if (topbar) topbar.style.display = "none";

  try {
    await loadTasks();
    renderHome();
  } catch(e) {
    console.error("初期化エラー:", e);
    document.getElementById("todayTasks").innerHTML = '<div class="today-task-empty">データの読み込みに失敗しました。Firestoreのルールを確認してください。</div>';
  }

  // タスク更新時にホームも更新
  window.addEventListener("tasksUpdated", () => {
    const active = document.querySelector(".page.active");
    if (active?.id === "page-home") renderHome();
    if (active?.id === "page-tasks") renderTasks(document.getElementById("sortSelect")?.value || "status");
  });
}

init();
