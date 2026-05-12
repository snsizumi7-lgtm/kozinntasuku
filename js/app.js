// js/app.js
import { initReport } from "./report.js";
import { renderHome } from "./home.js";
import { initChat } from "./chat.js";
import { initProjects, renderProjects } from "./projects.js";
import { initWeekly } from "./weekly.js";

function switchPage(page) {
  document.querySelectorAll(".nav-item, .bottom-nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(`page-${page}`)?.classList.add("active");
  if (page === "home") renderHome();
  if (page === "projects") renderProjects();
}

function initNav() {
  document.querySelectorAll(".nav-item, .bottom-nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchPage(btn.dataset.page));
  });
  const bottomNav = document.getElementById("bottomNav");
  if (bottomNav) {
    const mq = window.matchMedia("(max-width: 768px)");
    const toggle = e => { bottomNav.style.display = e.matches ? "flex" : "none"; };
    mq.addEventListener("change", toggle);
    toggle(mq);
  }
}

function initSidebarResize() {
  const resizer = document.getElementById("sidebarResizer");
  const sidebar = document.getElementById("sidebar");
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
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });
}

async function init() {
  initNav();
  initSidebarResize();
  initReport();
  initProjects();
  initWeekly();
  await initChat();
  renderHome();

  window.addEventListener("tasksUpdated", () => {
    const active = document.querySelector(".page.active");
    if (active?.id === "page-home") renderHome();
  });
}

init();
