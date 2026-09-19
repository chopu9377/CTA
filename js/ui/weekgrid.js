import { formatMD, WEEKDAY_LABELS } from "../dates.js";
import { escapeHtml } from "./shared.js";

const TAPPABLE = ["future", "rest", "review", "today", "none"];

export function legendHTML() {
  return `<div class="legend">
    <span><i class="dot cell-full"></i>당일 달성</span>
    <span><i class="dot cell-carried"></i>이월 후 완료</span>
    <span><i class="dot cell-partial"></i>부분</span>
    <span><i class="dot cell-pending"></i>이월 대기</span>
    <span><i class="dot cell-miss"></i>미달</span>
    <span><i class="dot cell-rest"></i>휴식</span>
    <span><i class="dot cell-review"></i>복습</span>
  </div>`;
}

function cellHTML(day, { mini, today }) {
  const tappable = !mini && day.date >= today && TAPPABLE.includes(day.status);
  const label = day.status === "rest" ? "휴" : day.status === "review" ? "복" : Number(day.date.slice(8));
  const attrs = tappable ? ` data-action="cycle-day" data-date="${day.date}"` : "";
  const title = day.holiday ? ` title="${escapeHtml(day.holiday)}"` : "";
  return `<div class="cell cell-${day.status}${tappable ? " tap" : ""}${day.holiday ? " holiday" : ""}"${attrs}${title}>${label}</div>`;
}

export function weekHTML(week, { mini, today, currentIndex }) {
  const status = week.complete
    ? `<b class="ok-text">완료 ✓</b>`
    : `달성 ${week.ok}/${week.activeCount}${week.pending ? ` · 이월 ${week.pending}` : ""}`;
  return `<div class="week${mini ? " mini" : ""}${week.complete ? " done" : ""}${week.index === currentIndex ? " current" : ""}">
    <div class="week-head"><b>${week.index + 1}주차 <span class="muted">${formatMD(week.start)}–${formatMD(week.end)}</span></b><span>${status}</span></div>
    <div class="days">
      ${mini ? "" : WEEKDAY_LABELS.map((d) => `<div class="day-label">${d}</div>`).join("")}
      ${week.days.map((day) => cellHTML(day, { mini, today })).join("")}
    </div>
  </div>`;
}
