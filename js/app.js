// js/app.js
import { initReport } from "./report.js";
import { renderHome, saveHomeTaskEdit, deleteHomeTask } from "./home.js";
import { initWeekly } from "./weekly.js";
import { initMypage, renderMypage, loadAdminRequestList, updateBadge } from "./mypage.js";

function switchPage(page) {
  document.querySelectorAll(".nav-item, .bottom-nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(`page-${page}`)?.classList.add("active");
  if (page === "home") renderHome();
  if (page === "mypage") renderMypage();
  if (page === "admin") loadAdminRequestList();
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
  let dragging=false, startX, startW;
  resizer?.addEventListener("mousedown", e => {
    dragging=true; startX=e.clientX; startW=sidebar.offsetWidth;
    resizer.classList.add("dragging");
    document.body.style.cursor="col-resize"; document.body.style.userSelect="none";
  });
  document.addEventListener("mousemove", e => {
    if(!dragging) return;
    sidebar.style.width = Math.min(300,Math.max(160,startW+(e.clientX-startX)))+"px";
  });
  document.addEventListener("mouseup", () => {
    if(!dragging) return; dragging=false;
    resizer.classList.remove("dragging");
    document.body.style.cursor=""; document.body.style.userSelect="";
  });
}

function initEditModal() {
  document.getElementById("taskEditClose")?.addEventListener("click", () => {
    document.getElementById("taskEditOverlay").classList.remove("open");
  });
  document.getElementById("taskEditCancel")?.addEventListener("click", () => {
    document.getElementById("taskEditOverlay").classList.remove("open");
  });
  document.getElementById("taskEditSave")?.addEventListener("click", saveHomeTaskEdit);
  document.getElementById("taskEditDelete")?.addEventListener("click", deleteHomeTask);
  document.getElementById("taskEditOverlay")?.addEventListener("click", e => {
    if(e.target === e.currentTarget) e.currentTarget.classList.remove("open");
  });

}

async function init() {
  initNav();
  initSidebarResize();
  initEditModal();
  initReport();
  initWeekly();
  initMypage();
  renderHome();
  // 起動時にバッジを更新
  checkBadges();

  window.addEventListener("tasksUpdated", () => {
    const active = document.querySelector(".page.active");
    if (active?.id === "page-home") renderHome();
  });
}

init();

async function checkBadges() {
  try {
    const { getDocs, collection } = await import("./firebase.js");
    const { db } = await import("./firebase.js");
    const myName = localStorage.getItem("tasuku_myname") || "";
    let count = 0;

    // 未読依頼
    if (myName) {
      const rsnap = await getDocs(collection(db, "requests"));
      count += rsnap.docs.filter(d => d.data().assignee === myName && !d.data().read).length;
    }

    // 3日以上更新なし
    const tsnap = await getDocs(collection(db, "tasks_v2"));
    const now = new Date();
    tsnap.docs.forEach(d => {
      const t = d.data();
      if (t.done) return;
      const updated = t.updatedAt || t.createdAt;
      if (!updated) return;
      if ((now - new Date(updated)) / (1000*60*60*24) >= 3) count++;
    });

    // 金曜
    if (new Date().getDay() === 5) count++;

    updateBadge(Math.min(count, 99));
  } catch(e) {}
}
