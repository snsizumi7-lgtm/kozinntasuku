// js/home.js
import { db, getDocs, collection } from "./firebase.js";
import { todayStr } from "./holidays.js";

export async function renderHome() {
  renderGreeting();
  renderSummaryCards();
  await renderTodayTasks();
  renderDashboard();
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

async function getTasksFromFirebase() {
  try {
    const snap = await getDocs(collection(db, "tasks_v2"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { return []; }
}

function renderSummaryCards() {
  const el = document.getElementById("summaryCards");
  if (!el) return;
  el.innerHTML = `
    <div class="summary-card urgent"><div class="summary-card-num" id="numUrgent">-</div><div class="summary-card-label">要対応</div></div>
    <div class="summary-card working"><div class="summary-card-num" id="numWorking">-</div><div class="summary-card-label">対応中 / 確認中</div></div>
    <div class="summary-card done"><div class="summary-card-num" id="numOverdue">-</div><div class="summary-card-label">期限切れ</div></div>
  `;
  getTasksFromFirebase().then(tasks => {
    const today = todayStr();
    document.getElementById("numUrgent").textContent = tasks.filter(t => t.status === "要対応").length;
    document.getElementById("numWorking").textContent = tasks.filter(t => ["対応中","確認中"].includes(t.status)).length;
    document.getElementById("numOverdue").textContent = tasks.filter(t => t.deadline && t.deadline < today && t.status !== "完了").length;
    renderUrgentTasks(tasks);
    renderStatusChart(tasks);
    renderProjectTable(tasks);
    renderWeeklyChart(tasks);
  });
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
      el.innerHTML = '<div class="today-task-empty">前回の日報に「明日やること」が登録されていません</div>';
      return;
    }
    const d = new Date(latest.date+"T00:00:00");
    const weekDays = ["日","月","火","水","木","金","土"];
    if (subEl) subEl.textContent = `（${d.getMonth()+1}/${d.getDate()}（${weekDays[d.getDay()]}）の日報より）`;
    const lines = latest.tomorrow.split("\n").map(l => l.trim()).filter(l => l);
    el.innerHTML = lines.map(line => {
      const text = line.replace(/^[・•\-]\s*/, "");
      return `<div class="today-task-item"><input type="checkbox"><span>${text}</span></div>`;
    }).join("");
  } catch(e) {
    el.innerHTML = '<div class="today-task-empty">読み込みエラー</div>';
  }
}

function renderUrgentTasks(tasks) {
  const el = document.getElementById("urgentTasks");
  if (!el) return;
  const today = todayStr();
  const urgent = tasks.filter(t => t.status === "要対応").slice(0,5);
  const overdue = tasks.filter(t => t.deadline && t.deadline < today && t.status !== "完了" && t.status !== "要対応").slice(0,3);
  const combined = [...urgent, ...overdue].slice(0,6);
  if (combined.length === 0) {
    el.innerHTML = '<div class="today-task-empty">要対応・期限切れのタスクはありません 👍</div>';
    return;
  }
  el.innerHTML = combined.map(t => `
    <div class="urgent-task-item">
      <span class="${t.status === "要対応" ? "urgent-badge" : "overdue-badge"}">${t.status === "要対応" ? "要対応" : "期限切れ"}</span>
      <span style="font-size:11px;color:var(--text-muted);flex-shrink:0">${t.project||""}</span>
      <span style="flex:1">${t.name||""}</span>
    </div>
  `).join("");
}

export function renderDashboard() {
  getTasksFromFirebase().then(tasks => {
    renderStatusChart(tasks);
    renderWeeklyChart(tasks);
    renderProjectTable(tasks);
  });
}

const STATUSES = ["要対応","対応中","確認中","毎月対応","完了"];
const STATUS_COLORS = {"要対応":"#ef4444","対応中":"#3b82f6","確認中":"#8b5cf6","毎月対応":"#10b981","完了":"#6b7280"};

function renderStatusChart(tasks) {
  const el = document.getElementById("statusChart");
  if (!el) return;
  const total = tasks.length || 1;
  el.innerHTML = STATUSES.map(s => {
    const count = tasks.filter(t => t.status === s).length;
    const pct = Math.round(count / total * 100);
    return `<div class="status-bar-row">
      <span class="status-bar-label">${s}</span>
      <div class="status-bar-track"><div class="status-bar-fill" style="width:${pct}%;background:${STATUS_COLORS[s]}"></div></div>
      <span class="status-bar-count">${count}</span>
    </div>`;
  }).join("");
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
  mon.setDate(now.getDate() - ((now.getDay()||7) - 1));
  const days = Array.from({length:7}, (_,i) => { const d = new Date(mon); d.setDate(mon.getDate()+i); return d.toISOString().slice(0,10); });
  const counts = days.map(day => tasks.filter(t => t.createdAt && new Date(t.createdAt).toISOString().slice(0,10) === day).length);
  const maxVal = Math.max(...counts, 1);
  const padL=30, padR=10, padT=20, padB=30;
  const chartW = w-padL-padR, chartH = h-padT-padB;
  const barW = Math.floor(chartW/7)-6;
  ctx.strokeStyle="#e8eaed"; ctx.lineWidth=0.5;
  for(let i=0;i<=4;i++){const y=padT+chartH-(chartH*i/4);ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(w-padR,y);ctx.stroke();}
  const today = todayStr();
  days.forEach((day,i) => {
    const x=padL+i*(chartW/7)+3, barH=counts[i]>0?Math.max((counts[i]/maxVal)*chartH,4):0, y=padT+chartH-barH;
    ctx.fillStyle=day===today?"#3b82f6":"#bfdbfe";
    ctx.beginPath(); ctx.roundRect?.(x,y,barW,barH,[3,3,0,0])||ctx.rect(x,y,barW,barH); ctx.fill();
    ctx.fillStyle="#9ca3af"; ctx.font="10px 'Noto Sans JP',sans-serif"; ctx.textAlign="center";
    ctx.fillText(labels[i],x+barW/2,h-8);
    if(counts[i]>0){ctx.fillStyle="#6b7280";ctx.fillText(counts[i],x+barW/2,y-4);}
  });
}

function renderProjectTable(tasks) {
  const el = document.getElementById("projectTable");
  if (!el) return;
  const map = {};
  tasks.forEach(t => {
    const p = t.project||"（未設定）";
    if (!map[p]) map[p]={total:0,done:0,urgent:0};
    map[p].total++;
    if(t.status==="完了") map[p].done++;
    if(t.status==="要対応") map[p].urgent++;
  });
  const rows = Object.entries(map).sort((a,b)=>b[1].total-a[1].total);
  if(!rows.length){el.innerHTML='<div class="empty-state">チャットからタスクを追加してください</div>';return;}
  el.innerHTML=`<table class="project-table"><thead><tr><th>案件名</th><th>合計</th><th>完了</th><th>要対応</th><th>完了率</th></tr></thead><tbody>
    ${rows.map(([name,d])=>{const pct=Math.round(d.done/d.total*100);return`<tr><td>${name}</td><td>${d.total}</td><td style="color:#10b981;font-weight:500">${d.done}</td><td style="color:${d.urgent>0?"#ef4444":"var(--text-secondary)"}">${d.urgent}</td><td><div style="display:flex;align-items:center;gap:6px;"><div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:#3b82f6;border-radius:3px;"></div></div><span style="font-size:11px;color:var(--text-secondary);width:28px;text-align:right">${pct}%</span></div></td></tr>`;}).join("")}
  </tbody></table>`;
}
