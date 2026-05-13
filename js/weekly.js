// js/weekly.js
import { db, getDocs, collection, doc, setDoc, getDoc } from "./firebase.js";

let currentWeekStart = null;

export function initWeekly() {
  document.getElementById("generateWeeklyBtn")?.addEventListener("click", generateWeeklySummary);
  renderWeekSelector();
  loadWeeklyReports(getWeekStart(new Date()));
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function renderWeekSelector() {
  const el = document.getElementById("weeklyWeekSelector");
  if (!el) return;
  const weeks = [];
  const now = new Date();
  for (let i = 0; i < 5; i++) {
    const start = getWeekStart(new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000));
    const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
    weeks.push({ start, end });
  }

  currentWeekStart = weeks[0].start;

  el.innerHTML = weeks.map((w, i) => {
    const label = i === 0 ? "今週" : i === 1 ? "先週" : `${w.start.getMonth()+1}/${w.start.getDate()}週`;
    return `<button class="week-btn ${i===0?"active":""}" onclick="selectWeek(this, '${formatDate(w.start)}')">${label}</button>`;
  }).join("");
}

window.selectWeek = function(btn, dateStr) {
  document.querySelectorAll(".week-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  currentWeekStart = new Date(dateStr + "T00:00:00");
  loadWeeklyReports(currentWeekStart);
};

async function loadWeeklyReports(weekStart) {
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  const startStr = formatDate(weekStart);
  const endStr = formatDate(weekEnd);

  // 保存済みサマリーを表示
  const summaryEl = document.getElementById("weeklySummaryOutput");
  try {
    const snap = await getDoc(doc(db, "weekly_summaries", startStr));
    if (snap.exists()) {
      const data = snap.data();
      summaryEl.innerHTML = `
        <div class="weekly-summary-card">
          <div class="weekly-summary-title">
            AIサマリー（${startStr} 〜 ${endStr}）
            <span style="font-size:11px;color:var(--text-muted);font-weight:400">保存済み</span>
          </div>
          <div class="weekly-summary-content">${esc(data.content)}</div>
        </div>
      `;
    } else {
      summaryEl.innerHTML = "";
    }
  } catch(e) { summaryEl.innerHTML = ""; }

  // 日報一覧を表示
  try {
    const snap = await getDocs(collection(db, "daily_reports"));
    const reports = [];
    snap.forEach(d => {
      const data = d.data();
      if (data.date >= startStr && data.date <= endStr) reports.push(data);
    });
    reports.sort((a, b) => a.date.localeCompare(b.date));
    renderWeeklyReportList(reports);
  } catch(e) {
    document.getElementById("weeklyReports").innerHTML = '<div class="weekly-empty">読み込みエラー</div>';
  }
}

function renderWeeklyReportList(reports) {
  const el = document.getElementById("weeklyReports");
  if (!reports.length) {
    el.innerHTML = '<div class="weekly-empty">この週の日報はまだありません</div>';
    return;
  }

  const weekDays = ["日","月","火","水","木","金","土"];
  el.innerHTML = reports.map(r => {
    const d = new Date(r.date + "T00:00:00");
    const label = `${d.getMonth()+1}月${d.getDate()}日（${weekDays[d.getDay()]}）`;
    return `<div class="weekly-report-item">
      <div class="weekly-report-header" onclick="toggleWeeklyReport(this)">
        <span class="weekly-report-date">${label}</span>
        <span class="weekly-report-toggle">▾</span>
      </div>
      <div class="weekly-report-body">
        ${r.done ? `<div class="weekly-report-section"><div class="weekly-report-section-label">■ 本日の作業</div><div>${esc(r.done).replace(/\n/g,"<br>")}</div></div>` : ""}
        ${r.tomorrow ? `<div class="weekly-report-section"><div class="weekly-report-section-label">■ 明日の予定</div><div>${esc(r.tomorrow).replace(/\n/g,"<br>")}</div></div>` : ""}
      </div>
    </div>`;
  }).join("");
}

window.toggleWeeklyReport = function(header) {
  header.parentElement.classList.toggle("collapsed");
};

async function generateWeeklySummary() {
  if (!currentWeekStart) return;
  const weekEnd = new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  const startStr = formatDate(currentWeekStart);
  const endStr = formatDate(weekEnd);

  const summaryEl = document.getElementById("weeklySummaryOutput");
  summaryEl.innerHTML = `<div class="weekly-generating"><div class="spinner"></div>AIがサマリーを生成中…</div>`;

  try {
    // 日報データを取得
    const snap = await getDocs(collection(db, "daily_reports"));
    const reports = [];
    snap.forEach(d => {
      const data = d.data();
      if (data.date >= startStr && data.date <= endStr) reports.push(data);
    });
    reports.sort((a, b) => a.date.localeCompare(b.date));

    if (!reports.length) {
      summaryEl.innerHTML = '<div class="weekly-empty">この週の日報がないためサマリーを生成できません</div>';
      return;
    }

    const reportText = reports.map(r => {
      const d = new Date(r.date + "T00:00:00");
      const weekDays = ["日","月","火","水","木","金","土"];
      return `【${d.getMonth()+1}/${d.getDate()}（${weekDays[d.getDay()]}）】\n本日の作業：${r.done||"なし"}\n明日の予定：${r.tomorrow||"なし"}`;
    }).join("\n\n");

    // ルールベースでサマリーを生成（CORSエラー回避）
    const content = generateRuleSummary(reports, startStr, endStr);

    // Firestoreに保存
    await setDoc(doc(db, "weekly_summaries", startStr), {
      weekStart: startStr,
      weekEnd: endStr,
      content,
      generatedAt: Date.now()
    });

    summaryEl.innerHTML = `
      <div class="weekly-summary-card">
        <div class="weekly-summary-title">
          AIサマリー（${startStr} 〜 ${endStr}）
          <button class="btn-copy" onclick="copyWeeklySummary(this)" style="font-size:12px;padding:4px 10px">コピー</button>
        </div>
        <div class="weekly-summary-content" id="weeklySummaryText">${esc(content)}</div>
      </div>
    `;
  } catch(e) {
    summaryEl.innerHTML = '<div class="weekly-empty">生成エラーが発生しました。もう一度お試しください。</div>';
    console.error(e);
  }
}

window.copyWeeklySummary = async function(btn) {
  const text = document.getElementById("weeklySummaryText")?.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "✓ コピー済み";
    setTimeout(() => { btn.textContent = "コピー"; }, 1500);
  } catch {}
};


function generateRuleSummary(reports, startStr, endStr) {
  const allDone = [];
  const allTomorrow = [];

  reports.forEach(r => {
    if (r.done) {
      r.done.split("\n").map(l => l.trim()).filter(l => l).forEach(l => {
        allDone.push(l.replace(/^[・•\-]\s*/, "・"));
      });
    }
    if (r.tomorrow) {
      r.tomorrow.split("\n").map(l => l.trim()).filter(l => l).forEach(l => {
        allTomorrow.push(l.replace(/^[・•\-]\s*/, "・"));
      });
    }
  });

  const doneSection = allDone.length > 0
    ? allDone.slice(0, 8).join("\n")
    : "　（記録なし）";

  const tomorrowSection = allTomorrow.length > 0
    ? [...new Set(allTomorrow)].slice(0, 5).join("\n")
    : "　（記録なし）";

  const dayCount = reports.length;
  const weekDays = ["日","月","火","水","木","金","土"];
  const dateRange = reports.map(r => {
    const d = new Date(r.date+"T00:00:00");
    return `${d.getMonth()+1}/${d.getDate()}（${weekDays[d.getDay()]}）`;
  }).join("、");

  return `【週次サマリー】${startStr} 〜 ${endStr}
日報記録: ${dayCount}日分（${dateRange}）

■ 今週の主な作業
${doneSection}

■ 来週への引き継ぎ
${tomorrowSection}`;
}

function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
