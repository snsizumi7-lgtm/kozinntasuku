// js/home.js
import { db, doc, getDocs, collection, getDoc } from "./firebase.js";
import { tasks, STATUSES } from "./tasks.js";
import { todayStr, countBusinessDays } from "./holidays.js";

export async function renderHome() {
  renderGreeting();
  renderSummaryCards();
  await renderTodayTasks();
  renderUrgentTasks();
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

function renderSummaryCards() {
  const el = document.getElementById("summaryCards");
  if (!el) return;
  const urgent = tasks.filter(t => t.status === "要対応").length;
  const working = tasks.filter(t => ["対応中","確認中"].includes(t.status)).length;
  const today = todayStr();
  const overdue = tasks.filter(t => t.deadline && t.deadline < today && t.status !== "完了").length;

  // 今週の完了数（この週の月曜から今日）
  const monday = new Date();
  monday.setDate(monday.getDate() - monday.getDay() + 1);
  const mondayStr = monday.toISOString().slice(0,10);

  el.innerHTML = `
    <div class="summary-card urgent">
      <div class="summary-card-num">${urgent}</div>
      <div class="summary-card-label">要対応</div>
    </div>
    <div class="summary-card working">
      <div class="summary-card-num">${working}</div>
      <div class="summary-card-label">対応中 / 確認中</div>
    </div>
    <div class="summary-card done">
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
    // 直近の日報の「明日やること」を取得
    const snap = await getDocs(collection(db, "daily_reports"));
    const reports = [];
    snap.forEach(d => { const data = d.data(); if (data.date) reports.push(data); });
    reports.sort((a,b) => b.date.localeCompare(a.date));
    const latest = reports[0];

    if (!latest || !latest.tomorrow) {
      el.innerHTML = '<div class="today-task-empty">前回の日報に「明日やること」が登録されていません</div>';
      return;
    }

    const d = new Date(latest.date + "T00:00:00");
    const weekDays = ["日","月","火","水","木","金","土"];
    if (subEl) subEl.textContent = `（${d.getMonth()+1}/${d.getDate()}（${weekDays[d.getDay()]}）の日報より）`;

    const lines = latest.tomorrow.split("\n").map(l => l.trim()).filter(l => l);
    el.innerHTML = lines.map(line => {
      const text = line.replace(/^[・•\-]\s*/, "");
      return `<div class="today-task-item">
        <input type="checkbox">
        <span>${text}</span>
      </div>`;
    }).join("");
  } catch(e) {
    el.innerHTML = '<div class="today-task-empty">読み込みエラー</div>';
  }
}

function renderUrgentTasks() {
  const el = document.getElementById("urgentTasks");
  if (!el) return;
  const today = todayStr();
  const urgent = tasks.filter(t => t.status === "要対応").slice(0, 5);
  const overdue = tasks.filter(t => t.deadline && t.deadline < today && t.status !== "完了").slice(0, 3);
  const combined = [...urgent, ...overdue.filter(t => t.status !== "要対応")].slice(0, 6);

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
  renderStatusChart();
  renderWeeklyChart();
  renderProjectTable();
}

function renderStatusChart() {
  const el = document.getElementById("statusChart");
  if (!el) return;
  const colors = { "要対応":"#ef4444","対応中":"#3b82f6","確認中":"#8b5cf6","毎月対応":"#10b981","完了":"#6b7280" };
  const total = tasks.length || 1;
  el.innerHTML = STATUSES.map(s => {
    const count = tasks.filter(t => t.status === s).length;
    const pct = Math.round(count / total * 100);
    return `<div class="status-bar-row">
      <span class="status-bar-label">${s}</span>
      <div class="status-bar-track"><div class="status-bar-fill" style="width:${pct}%;background:${colors[s]}"></div></div>
      <span class="status-bar-count">${count}</span>
    </div>`;
  }).join("");
}

function renderWeeklyChart() {
  const canvas = document.getElementById("weeklyChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // 今週月〜日の各日の完了タスク数（subtasks.doneでなくtask全体の完了）
  const days = [];
  const labels = ["月","火","水","木","金","土","日"];
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay()||7) - 1));

  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    days.push(d.toISOString().slice(0,10));
  }

  // createdAtベースで今週追加されたタスクを集計（簡易）
  const counts = days.map(day => {
    return tasks.filter(t => {
      if (!t.createdAt) return false;
      const cd = new Date(t.createdAt).toISOString().slice(0,10);
      return cd === day;
    }).length;
  });

  const maxVal = Math.max(...counts, 1);
  const padL = 30, padR = 10, padT = 20, padB = 30;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const barW = Math.floor(chartW / 7) - 6;

  // grid lines
  ctx.strokeStyle = "#e8eaed";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = padT + chartH - (chartH * i / 4);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
  }

  // bars
  days.forEach((day, i) => {
    const x = padL + i * (chartW / 7) + 3;
    const barH = counts[i] > 0 ? Math.max((counts[i] / maxVal) * chartH, 4) : 0;
    const y = padT + chartH - barH;
    const isToday = day === todayStr();
    ctx.fillStyle = isToday ? "#3b82f6" : "#bfdbfe";
    ctx.beginPath();
    ctx.roundRect?.(x, y, barW, barH, [3,3,0,0]) || ctx.rect(x, y, barW, barH);
    ctx.fill();

    // label
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px 'Noto Sans JP', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(labels[i], x + barW/2, h - 8);

    // count
    if (counts[i] > 0) {
      ctx.fillStyle = "#6b7280";
      ctx.fillText(counts[i], x + barW/2, y - 4);
    }
  });
}

function renderProjectTable() {
  const el = document.getElementById("projectTable");
  if (!el) return;
  const projectMap = {};
  tasks.forEach(t => {
    const p = t.project || "（未設定）";
    if (!projectMap[p]) projectMap[p] = { total:0, done:0, urgent:0 };
    projectMap[p].total++;
    if (t.status === "完了") projectMap[p].done++;
    if (t.status === "要対応") projectMap[p].urgent++;
  });

  const rows = Object.entries(projectMap).sort((a,b) => b[1].total - a[1].total);
  if (rows.length === 0) { el.innerHTML = '<div class="empty-state">データなし</div>'; return; }

  el.innerHTML = `<table class="project-table">
    <thead><tr>
      <th>案件名</th><th>合計</th><th>完了</th><th>要対応</th><th>完了率</th>
    </tr></thead>
    <tbody>
      ${rows.map(([name, d]) => {
        const pct = Math.round(d.done / d.total * 100);
        return `<tr>
          <td>${name}</td>
          <td>${d.total}</td>
          <td style="color:#10b981;font-weight:500">${d.done}</td>
          <td style="color:${d.urgent>0?"#ef4444":"var(--text-secondary)"};">${d.urgent}</td>
          <td>
            <div style="display:flex;align-items:center;gap:6px;">
              <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:#3b82f6;border-radius:3px;"></div>
              </div>
              <span style="font-size:11px;color:var(--text-secondary);width:28px;text-align:right">${pct}%</span>
            </div>
          </td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>`;
}
