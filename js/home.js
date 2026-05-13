// js/home.js
import { db, getDocs, addDoc, collection } from "./firebase.js";
import { todayStr } from "./holidays.js";

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
  let tasks = [];
  try {
    const snap = await getDocs(collection(db, "tasks_v2"));
    tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {}

  renderSummaryCards(tasks);
  await renderTodayTasks();
  renderUrgentTasks(tasks);
  renderWeeklyDone(tasks);
  renderWeeklyChart(tasks);
  initHomeQuickAdd(tasks);
}

function renderSummaryCards(tasks) {
  const el = document.getElementById("summaryCards");
  if (!el) return;
  const today = todayStr();
  const urgent = tasks.filter(t => t.status === "要対応").length;
  const working = tasks.filter(t => ["対応中","確認中"].includes(t.status)).length;
  const overdue = tasks.filter(t => t.deadline && t.deadline < today && t.status !== "完了").length;

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

export async function renderTodayTasks() {
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
      const escaped = text.replace(/'/g, "\\'").replace(/"/g, "&quot;");
      const checked = savedChecks[i] ? "checked" : "";
      const doneStyle = savedChecks[i] ? "text-decoration:line-through;color:#9ca3af" : "";
      return `<div class="today-task-item">
        <input type="checkbox" ${checked} onchange="saveTodayCheck(${i}, this.checked)">
        <span style="flex:1;${doneStyle}">${text}</span>
        <button class="add-to-project-btn" onclick="addTodayTaskToProject('${escaped}')" title="タスクに追加">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          タスクに追加
        </button>
      </div>`;
    }).join("");
  } catch(e) {
    el.innerHTML = '<div class="today-task-empty">読み込みエラー</div>';
  }
}

function renderUrgentTasks(tasks) {
  const el = document.getElementById("urgentTasks");
  if (!el) return;
  const today = todayStr();
  const urgent = tasks.filter(t => t.status === "要対応").slice(0, 5);
  const overdue = tasks.filter(t => t.deadline && t.deadline < today && t.status !== "完了" && t.status !== "要対応").slice(0, 3);
  const combined = [...urgent, ...overdue].slice(0, 6);
  if (!combined.length) {
    el.innerHTML = `<div class="empty-guide" style="padding:16px">
      <div class="empty-guide-title" style="color:#10b981">要対応・期限切れなし 👍</div>
    </div>`;
    return;
  }
  el.innerHTML = combined.map(t => `
    <div class="urgent-task-item">
      <span class="${t.status === "要対応" ? "urgent-badge" : "overdue-badge"}">${t.status === "要対応" ? "要対応" : "期限切れ"}</span>
      <span style="flex:1">${esc(t.name)}</span>
    </div>
  `).join("");
}

// 今週完了したタスク
function renderWeeklyDone(tasks) {
  const el = document.getElementById("weeklyDoneTasks");
  const countEl = document.getElementById("weeklyDoneCount");
  if (!el) return;

  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() || 7) - 1));
  mon.setHours(0,0,0,0);

  // completedAt があるものを優先、なければ createdAt で判定
  const done = tasks.filter(t => {
    if (t.status !== "完了") return false;
    const ts = t.completedAt || t.updatedAt || t.createdAt;
    if (!ts) return false;
    return new Date(ts) >= mon;
  });

  if (countEl) countEl.textContent = done.length > 0 ? `${done.length}件` : "";

  if (!done.length) {
    el.innerHTML = `<div class="today-task-empty" style="color:var(--text-muted);padding:12px 0;font-size:12px">今週はまだ完了したタスクがありません</div>`;
    return;
  }

  el.innerHTML = done.slice(0, 10).map(t => `
    <div class="today-task-item" style="opacity:0.7">
      <span style="color:#10b981;font-size:14px">✓</span>
      <span style="flex:1;text-decoration:line-through;color:var(--text-muted)">${esc(t.name)}</span>
    </div>
  `).join("");
}

function renderWeeklyChart(tasks) {
  const canvas = document.getElementById("weeklyChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const labels = ["月","火","水","木","金","土","日"];
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() || 7) - 1));
  const days = Array.from({length:7}, (_,i) => {
    const d = new Date(mon); d.setDate(mon.getDate()+i);
    return d.toISOString().slice(0,10);
  });
  const counts = days.map(day =>
    tasks.filter(t => t.createdAt && new Date(t.createdAt).toISOString().slice(0,10) === day).length
  );
  const maxVal = Math.max(...counts, 1);
  const padL=30, padR=10, padT=16, padB=26;
  const chartW=w-padL-padR, chartH=h-padT-padB;
  const barW=Math.floor(chartW/7)-8;
  ctx.strokeStyle="#e8eaed"; ctx.lineWidth=0.5;
  for(let i=0;i<=4;i++){
    const y=padT+chartH-(chartH*i/4);
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(w-padR,y); ctx.stroke();
  }
  const today=todayStr();
  days.forEach((day,i)=>{
    const x=padL+i*(chartW/7)+4;
    const barH=counts[i]>0?Math.max((counts[i]/maxVal)*chartH,4):0;
    const y=padT+chartH-barH;
    ctx.fillStyle=day===today?"#3b82f6":"#bfdbfe";
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(x,y,barW,barH,[3,3,0,0]);
    else ctx.rect(x,y,barW,barH);
    ctx.fill();
    ctx.fillStyle="#9ca3af"; ctx.font="11px 'Noto Sans JP',sans-serif"; ctx.textAlign="center";
    ctx.fillText(labels[i],x+barW/2,h-6);
    if(counts[i]>0){ctx.fillStyle="#6b7280";ctx.fillText(counts[i],x+barW/2,y-4);}
  });
}

// ホームからのクイック追加
function initHomeQuickAdd(existingTasks) {
  const input = document.getElementById("homeQuickInput");
  const btn = document.getElementById("homeQuickBtn");
  if (!input || !btn) return;

  const doAdd = async () => {
    const name = input.value.trim();
    if (!name) return;
    input.value = "";
    try {
      await addDoc(collection(db, "tasks_v2"), {
        project: "", name, status: "要対応", deadline: "", subtasks: [], createdAt: Date.now()
      });
      showHomeToast(`「${name}」を追加しました`);
      window.dispatchEvent(new Event("tasksUpdated"));
    } catch(e) { showHomeToast("追加に失敗しました"); }
  };

  // 既存イベントを除去して再登録
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);

  newBtn.addEventListener("click", doAdd);
  // ホームの追加欄はEnterで送信OK（チャットとは別物）
  newInput.addEventListener("keydown", e => { if(e.key === "Enter") doAdd(); });
}

window.saveTodayCheck = function(index, checked) {
  const today = new Date().toISOString().slice(0,10);
  const key = `tasuku_checks_${today}`;
  try {
    const checks = JSON.parse(localStorage.getItem(key) || "{}");
    checks[index] = checked;
    localStorage.setItem(key, JSON.stringify(checks));
    const items = document.querySelectorAll(".today-task-item");
    if (items[index]) {
      const span = items[index].querySelector("span");
      if (span) span.style.cssText = checked ? "flex:1;text-decoration:line-through;color:#9ca3af" : "flex:1";
    }
  } catch(e) {}
};

window.addTodayTaskToProject = async function(taskName) {
  let projects = new Set();
  try {
    const snap = await getDocs(collection(db, "tasks_v2"));
    snap.forEach(d => { const p = d.data().project; if(p) projects.add(p); });
  } catch(e) {}
  showProjectPicker(taskName, [...projects]);
};

function showProjectPicker(taskName, projects) {
  document.getElementById("projectPickerOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "projectPickerOverlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;z-index:2000;backdrop-filter:blur(2px)";
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;width:340px;max-width:calc(100vw - 32px);box-shadow:0 8px 32px rgba(0,0,0,0.12);border:1px solid #e8eaed">
      <div style="padding:14px 18px;border-bottom:1px solid #f0f2f5;display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:13px;font-weight:600">タスクとして追加</div>
        <button onclick="document.getElementById('projectPickerOverlay').remove()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px">✕</button>
      </div>
      <div style="padding:14px 16px">
        <div style="font-size:11px;color:#9ca3af;margin-bottom:8px">そのままタスクに追加</div>
        <button onclick="confirmAddTask('${escJs(taskName)}')"
          style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid #e8eaed;background:#f8f9fb;cursor:pointer;font-size:13px;font-family:'Noto Sans JP',sans-serif;text-align:left;transition:background 0.15s"
          onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='#f8f9fb'">
          ＋ 「${escHtml(taskName)}」を要対応に追加
        </button>
      </div>
    </div>
  `;
  overlay.addEventListener("click", e => { if(e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

window.confirmAddTask = async function(name) {
  document.getElementById("projectPickerOverlay")?.remove();
  // 重複チェック
  try {
    const snap = await getDocs(collection(db, "tasks_v2"));
    const exists = snap.docs.some(d => d.data().name?.trim() === name.trim() && d.data().status !== "完了");
    if (exists) { showHomeToast(`「${name}」はすでに登録済みです`); return; }
  } catch(e) {}
  try {
    await addDoc(collection(db, "tasks_v2"), {
      project: "", name, status: "要対応", deadline: "", subtasks: [], createdAt: Date.now()
    });
    showHomeToast(`「${name}」を追加しました`);
    window.dispatchEvent(new Event("tasksUpdated"));
  } catch(e) { showHomeToast("追加に失敗しました"); }
};

function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function escHtml(s) { return esc(s); }
function escJs(s) { return String(s||"").replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/"/g,'\\"'); }
function showHomeToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}
