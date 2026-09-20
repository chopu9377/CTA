export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function pad(n) {
  return String(n).padStart(2, "0");
}

export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(dateStr) {
  return new Date(dateStr + "T00:00:00");
}

export function todayStr() {
  return toISODate(new Date());
}

export function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function diffDays(fromStr, toStr) {
  return Math.round((parseDate(toStr) - parseDate(fromStr)) / 86400000);
}

export function weekdayOf(dateStr) {
  return parseDate(dateStr).getDay();
}

export function formatMD(dateStr) {
  const d = parseDate(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatKoreanDate(dateStr) {
  const d = parseDate(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAY_LABELS[d.getDay()]})`;
}

export function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

// "YYYY-MM" 달 키를 n달 앞뒤로 옮긴다
export function shiftMonth(key, n) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
