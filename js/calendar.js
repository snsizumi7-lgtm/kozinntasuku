// js/calendar.js
import { tasks } from "./tasks.js";
import { todayStr, isHoliday, countBusinessDays } from "./holidays.js";

let currentYear, currentMonth, selectedDate = null;
const WEEK_DAYS = ["日","月","火","水","木","金","土"];
const MONTH_NAMES = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

export function initCalendar() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();
  document.getElementById("prevMonth")?.addEventListener("click", () => { currentMonth--; if(currentMonth<0){currentMonth=11;currentYear--;} renderCalendar(); });
  document.getElementById("nextMonth")?.addEventListener("click", () => { currentMonth++; if(currentMonth>11){currentMonth=0;currentYear++;} renderCalendar(); });
  renderCalendar();
  window.addEventListener("tasksUpdated", renderCalendar);
}

export function renderCalendar() {
  const titleEl = document.getElementById("calMonthTitle");
  if (titleEl) titleEl.textContent = `${currentYear}年 ${MONTH_NAMES[currentMonth]}`;
  const grid = document.getElementById("calendarGrid");
  if (!grid) return;

  const map = {};
  tasks.forEach(t => {
    if (t.deadline) { if(!map[t.deadline]) map[t.deadline]=[]; map[t.deadline].push({label:t.name||t.project||"タスク",type:countBusinessDays(todayStr(),t.deadline)<0?"over":"deadline"}); }
    (t.subtasks||[]).forEach(s => { if(s.dueDate){ if(!map[s.dueDate]) map[s.dueDate]=[]; map[s.dueDate].push({label:s.text,type:countBusinessDays(todayStr(),s.dueDate)<0?"over":"sub-deadline"}); }});
  });

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth+1, 0).getDate();
  const daysInPrev = new Date(currentYear, currentMonth, 0).getDate();
  const today = todayStr();
  const totalCells = Math.ceil((firstDay+daysInMonth)/7)*7;

  let html = `<div class="cal-week-header">${WEEK_DAYS.map((d,i) => `<div class="cal-week-day ${i===0?"sun":i===6?"sat":""}">${d}</div>`).join("")}</div><div class="cal-body">`;

  for (let i = 0; i < totalCells; i++) {
    let day, year=currentYear, month=currentMonth, other=false;
    if (i<firstDay) { day=daysInPrev-firstDay+i+1; month=currentMonth-1; if(month<0){month=11;year--;} other=true; }
    else if (i>=firstDay+daysInMonth) { day=i-firstDay-daysInMonth+1; month=currentMonth+1; if(month>11){month=0;year++;} other=true; }
    else { day=i-firstDay+1; }

    const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const dow = i%7;
    const isWE = dow===0||dow===6;
    const isHol = isHoliday(dateStr);
    let cls = "cal-cell";
    if (other) cls+=" other-month"; else if (isHol) cls+=" holiday"; else if (isWE) cls+=" weekend";
    if (dateStr===today) cls+=" today";
    if (dateStr===selectedDate) cls+=" selected";

    const items = map[dateStr]||[];
    const dots = items.slice(0,3).map(it=>`<div class="cal-dot-item ${it.type}">${it.label}</div>`).join("");
    const more = items.length>3 ? `<div class="cal-more">+${items.length-3}件</div>` : "";

    html += `<div class="${cls}" data-date="${dateStr}" onclick="selectCalDate('${dateStr}')">
      <div class="cal-date">${day}</div>
      <div class="cal-dots">${dots}${more}</div>
    </div>`;
  }
  html += "</div>";
  grid.innerHTML = html;
}

window.selectCalDate = function(dateStr) {
  selectedDate = dateStr;
  renderCalendar();
  const dt = new Date(dateStr+"T00:00:00");
  const weekDays = ["日","月","火","水","木","金","土"];
  const titleEl = document.getElementById("calendarDetail")?.querySelector(".detail-title");
  if (titleEl) titleEl.textContent = `${dt.getMonth()+1}月${dt.getDate()}日（${weekDays[dt.getDay()]}）`;

  const list = document.getElementById("detailList");
  if (!list) return;
  const items = [];
  tasks.forEach(t => {
    if (t.deadline===dateStr) items.push({name:t.name,meta:`${t.project} — ${t.status}`});
    (t.subtasks||[]).forEach(s => { if(s.dueDate===dateStr) items.push({name:s.text,meta:`${t.project} / サブタスク`}); });
  });
  list.innerHTML = items.length===0 ? '<div class="empty-state">締切なし</div>' :
    items.map(it=>`<div class="detail-item"><div class="detail-task-name">${it.name}</div><div class="detail-task-meta">${it.meta}</div></div>`).join("");
};
