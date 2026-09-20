import { formatMD, WEEKDAY_LABELS } from "../dates.js";
import { escapeHtml } from "./shared.js";

const TAPPABLE = ["future", "rest", "review", "today", "none", "bonus"];

export function legendHTML() {
  return `<div class="legend">
    <span><i class="dot cell-full"></i>당일 달성</span>
    <span><i class="dot cell-carried"></i>이월 후 완료</span>
    <span><i class="dot cell-partial"></i>부분</span>
    <span><i class="dot cell-pending"></i>이월 대기</span>
    <span><i class="dot cell-miss"></i>미달</span>
    <span><i class="dot cell-rest"></i>휴식</span>
    <span><i class="dot cell-review"></i>복습</span>
    <span><i class="dot cell-bonus"></i>보상 휴식</span>
  </div>`;
}

// pick: 보상 휴식 날짜 고르기 모드일 때 고를 수 있는 날짜 집합(아니면 null)
function cellHTML(day, { mini, today, pick }) {
  const label = day.status === "rest" ? "휴" : day.status === "review" ? "복" : day.status === "bonus" ? "🎁" : Number(day.date.slice(8));
  const title = day.holiday ? ` title="${escapeHtml(day.holiday)}"` : "";
  let attrs = "";
  let cls = "";
  if (!mini && pick) {
    if (pick.has(day.date)) {
      attrs = ` data-action="pick-bonus-day" data-date="${day.date}"`;
      cls = " tap pickable";
    } else cls = " dim";
  } else if (!mini && day.date >= today && TAPPABLE.includes(day.status)) {
    attrs = ` data-action="${day.bonus ? "bonus-day" : "cycle-day"}" data-date="${day.date}"`;
    cls = " tap";
  }
  if (day.bonus && day.status !== "bonus") cls += " has-bonus";
  return `<div class="cell cell-${day.status}${cls}${day.holiday ? " holiday" : ""}"${attrs}${title}>${label}</div>`;
}

export function weekHTML(week, { mini, today, currentIndex, pick = null }) {
  const status = week.complete
    ? `<b class="ok-text">완료 ✓</b>`
    : `달성 ${week.ok}/${week.activeCount}일${week.pending ? ` · 이월 ${week.pending}일` : ""}`;
  return `<div class="week${mini ? " mini" : ""}${week.complete ? " done" : ""}${week.index === currentIndex ? " current" : ""}">
    <div class="week-head"><b>${week.index + 1}주차 <span class="muted">${formatMD(week.start)}–${formatMD(week.end)}</span></b><span>${status}</span></div>
    <div class="days">
      ${mini ? "" : WEEKDAY_LABELS.map((d) => `<div class="day-label">${d}</div>`).join("")}
      ${week.days.map((day) => cellHTML(day, { mini, today, pick })).join("")}
    </div>
  </div>`;
}
