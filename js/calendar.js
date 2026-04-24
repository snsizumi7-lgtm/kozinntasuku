// js/calendar.js
import { tasks } from "./tasks.js";
import { todayStr, isHoliday, countBusinessDays } from "./holidays.js";

let currentYear, currentMonth;
let selectedDate = null;

const WEEK_DAYS = ["日","月","火","水","木","金","土"];
const MONTH_NAMES = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

export function initCalendar() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();

  document.getElementById("prevMonth").addEventListener("click", () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
  });

  document.getElementById("nextMonth").addEventListener("click", () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
  });

  renderCalendar();
  window.addEventListener("tasksUpdated", renderCalendar);
}

export function renderCalendar() {
  const titleEl = document.getElementById("calMonthTitle");
  if (titleEl) titleEl.textContent = `${currentYear}年 ${MONTH_NAMES[currentMonth]}`;

  const grid = document.getElementById("calendarGrid");
  if (!grid) return;

  // Build deadline map
  const deadlineMap = buildDeadlineMap();

  // Calendar header
  let html = `<div class="cal-week-header">`;
  WEEK_DAYS.forEach((d, i) => {
    const cls = i === 0 ? "sun" : i === 6 ? "sat" : "";
    html += `<div class="cal-week-day ${cls}">${d}</div>`;
  });
  html += `</div><div class="cal-body">`;

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrev = new Date(currentYear, currentMonth, 0).getDate();
  const today = todayStr();

  // Fill cells
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  for (let i = 0; i < totalCells; i++) {
    let day, year = currentYear, month = currentMonth;
    let otherMonth = false;
    if (i < firstDay) {
      day = daysInPrev - firstDay + i + 1;
      month = currentMonth - 1;
      if (month < 0) { month = 11; year--; }
      otherMonth = true;
    } else if (i >= firstDay + daysInMonth) {
      day = i - firstDay - daysInMonth + 1;
      month = currentMonth + 1;
      if (month > 11) { month = 0; year++; }
      otherMonth = true;
    } else {
      day = i - firstDay + 1;
    }

    const dateStr = `${year}-${String(month + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const dayOfWeek = i % 7;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const holiday = isHoliday(dateStr);
    const isToday = dateStr === today;
    const isSelected = dateStr === selectedDate;

    let cls = "cal-cell";
    if (otherMonth) cls += " other-month";
    else if (holiday) cls += " holiday";
    else if (isWeekend) cls += " weekend";
    if (isToday) cls += " today";
    if (isSelected) cls += " selected";

    const items = deadlineMap[dateStr] || [];
    const maxShow = 3;
    const visibleItems = items.slice(0, maxShow);
    const moreCount = items.length - maxShow;

    html += `<div class="${cls}" data-date="${dateStr}" onclick="selectCalDate('${dateStr}')">
      <div class="cal-date">${day}</div>
      <div class="cal-dots">
        ${visibleItems.map(item => `<div class="cal-dot-item ${item.type}" title="${item.label}">${item.label}</div>`).join("")}
        ${moreCount > 0 ? `<div class="cal-more">+${moreCount}件</div>` : ""}
      </div>
    </div>`;
  }

  html += `</div>`;
  grid.innerHTML = html;
}

function buildDeadlineMap() {
  const map = {};
  const today = todayStr();

  tasks.forEach(task => {
    if (task.deadline) {
      const bdays = countBusinessDays(today, task.deadline);
      const type = bdays < 0 ? "over" : "deadline";
      if (!map[task.deadline]) map[task.deadline] = [];
      map[task.deadline].push({ label: task.name || task.project || "タスク", type });
    }
    (task.subtasks || []).forEach(s => {
      if (s.dueDate) {
        const bdays = countBusinessDays(today, s.dueDate);
        const type = bdays < 0 ? "over" : "sub-deadline";
        if (!map[s.dueDate]) map[s.dueDate] = [];
        map[s.dueDate].push({ label: `[${s.assignee || ""}] ${s.text}`, type });
      }
    });
  });

  return map;
}

window.selectCalDate = function(dateStr) {
  selectedDate = dateStr;
  renderCalendar();
  showDateDetail(dateStr);
};

function showDateDetail(dateStr) {
  const detailTitle = document.getElementById("calendarDetail")?.querySelector(".detail-title");
  const detailList = document.getElementById("detailList");
  if (!detailTitle || !detailList) return;

  const d = new Date(dateStr + "T00:00:00");
  const weekDay = ["日","月","火","水","木","金","土"][d.getDay()];
  detailTitle.textContent = `${d.getMonth() + 1}月${d.getDate()}日（${weekDay}）`;

  const items = [];
  tasks.forEach(task => {
    if (task.deadline === dateStr) {
      items.push({
        name: task.name || task.project,
        meta: `${task.project} — ${task.status}`,
        type: "deadline"
      });
    }
    (task.subtasks || []).forEach(s => {
      if (s.dueDate === dateStr) {
        items.push({
          name: s.text,
          meta: `${task.project} / ${s.assignee || "担当者未設定"}`,
          type: "sub"
        });
      }
    });
  });

  if (items.length === 0) {
    detailList.innerHTML = '<div class="empty-state">締切なし</div>';
    return;
  }

  detailList.innerHTML = items.map(item => `
    <div class="detail-item">
      <div class="detail-task-name">${item.name}</div>
      <div class="detail-task-meta">${item.meta}</div>
    </div>
  `).join("");
}
