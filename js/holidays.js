// js/holidays.js

const HOLIDAYS = new Set([
  // 2025
  "2025-01-01","2025-01-13","2025-02-11","2025-02-23","2025-02-24",
  "2025-03-20","2025-04-29","2025-05-03","2025-05-04","2025-05-05","2025-05-06",
  "2025-07-21","2025-08-11","2025-09-15","2025-09-22","2025-09-23",
  "2025-10-13","2025-11-03","2025-11-23","2025-11-24",
  // 2026
  "2026-01-01","2026-01-12","2026-02-11","2026-02-23","2026-03-20",
  "2026-04-29","2026-05-03","2026-05-04","2026-05-05","2026-05-06",
  "2026-07-20","2026-08-11","2026-09-21","2026-09-22","2026-09-23",
  "2026-10-12","2026-11-03","2026-11-23",
  // 2027
  "2027-01-01","2027-01-11","2027-02-11","2027-02-23","2027-03-22",
  "2027-04-29","2027-05-03","2027-05-04","2027-05-05",
  "2027-07-19","2027-08-11","2027-09-20","2027-09-21","2027-09-23",
  "2027-10-11","2027-11-03","2027-11-23",
]);

export function isHoliday(dateStr) {
  return HOLIDAYS.has(dateStr);
}

export function isBusinessDay(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  if (HOLIDAYS.has(dateStr)) return false;
  return true;
}

export function countBusinessDays(fromDate, toDateStr) {
  const today = new Date(fromDate + "T00:00:00");
  const end = new Date(toDateStr + "T00:00:00");
  if (end < today) return -countBusinessDays(toDateStr, fromDate);
  let count = 0;
  const cur = new Date(today);
  while (cur <= end) {
    const s = cur.toISOString().slice(0, 10);
    if (isBusinessDay(s)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  // don't count today itself
  return count - (isBusinessDay(fromDate) ? 1 : 0);
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export { HOLIDAYS };
