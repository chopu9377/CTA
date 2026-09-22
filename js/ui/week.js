import { addDays, monthKey } from "../dates.js";
import { trackAt, weekReport, weekQuotas, currentWeekIndex, daysUntil, pendingSettlements, historyEnd } from "../stats.js";
import { absorbedShortfalls } from "../weekplan.js";
import { TRACK_LABEL, countUnit } from "../presets.js";
import { escapeHtml, ringHTML, subjectColor } from "./shared.js";
import { legendHTML, weekHTML } from "./weekgrid.js";
import { bonusSavings, bonusBlockReason, bonusMaxFor } from "../bonus.js";
import { shipCardHTML } from "./bonus.js";

function ddayText(info, today) {
  if (!info.examDate) return "시험일 미설정";
  const d = daysUntil(info.examDate, today);
  const text = d > 0 ? `D-${d}` : d === 0 ? "D-DAY" : `D+${Math.abs(d)}`;
  return info.examEstimated ? `${text} · 추정` : text;
}

function trackBarHTML(data, activeTrack, today) {
  const info = data.tracks[activeTrack];
  return `<div class="top-row">
    <div class="seg">${[2, 1]
      .map((t) => `<button type="button" class="${t === activeTrack ? "on" : ""}" data-action="set-track" data-track="${t}">${TRACK_LABEL[t]}</button>`)
      .join("")}</div>
    <span class="chip">${TRACK_LABEL[activeTrack]} ${ddayText(info, today)}</span>
  </div>`;
}

function noticesHTML(data, ctx, activeTrack, today) {
  const notices = [];
  const first = data.tracks[1];
  // 1차 집중 기간 = 활성 시작일 ~ 시험일. 시험이 끝난 뒤에는 1차 전환을 다시 묻지 않는다.
  const inFocusWindow = first.activeFrom && today >= first.activeFrom && (!first.examDate || today <= first.examDate);
  if (activeTrack === 2 && inFocusWindow) {
    notices.push(`<div class="notice">1차 활성 시작일이 지났어요. 1차로 전환할까요? <button class="btn btn-sm btn-secondary" data-action="set-track" data-track="1" type="button">1차로 전환</button></div>`);
  }
  if (activeTrack === 1 && first.examDate && today > first.examDate) {
    notices.push(`<div class="notice">1차 시험일이 지났어요. 2차로 돌아갈까요? <button class="btn btn-sm btn-secondary" data-action="set-track" data-track="2" type="button">2차로 전환</button></div>`);
  }
  const absorbed = absorbedShortfalls(data, ctx, today).filter((a) => a.goal.track === activeTrack);
  if (absorbed.length) {
    notices.push(`<div class="notice">지난주에 못 한 양은 이번 주 계획에 자동으로 반영됐어요: ${absorbed.map((a) => `${escapeHtml(a.goal.subject)} ${a.amount}${escapeHtml(countUnit(a.goal.unit))}`).join(" · ")}</div>`);
  }
  const undecided = pendingSettlements(data, ctx, today).length;
  if (undecided) {
    notices.push(`<div class="notice">이월 여부를 정하지 않은 미달분이 ${undecided}일치 있어요. <button class="btn btn-sm btn-secondary" data-action="open-settle" type="button">정하기</button></div>`);
  }
  return notices.join("");
}

function quotaHTML(data, ctx, track, weekIndex) {
  const q = weekQuotas(data, ctx, weekIndex, track);
  const meta = `진도일 ${q.workdays}일${q.rest ? ` · 휴식 ${q.rest}` : ""}${q.review ? ` · 복습 ${q.review}` : ""}`;
  return `<div class="card">
    <div class="section-header-row"><h2 class="section-title">이번 주 쿼터 (${weekIndex + 1}주차)</h2><span class="chip">${meta}</span></div>
    <div class="overall"><span>전체</span><div class="meter-track"><div class="meter-fill" style="width:${q.overall}%"></div></div><b>${q.overall}%</b></div>
    <div class="ring-grid">${q.rings.map((r) => `<div class="ring-cell">
      ${ringHTML(subjectColor(data, r.goal.subject), r.pct)}
      <div class="ring-name">${escapeHtml(r.goal.subject)}</div>
      <div class="ring-count">${r.done}/${r.quota}${escapeHtml(countUnit(r.goal.unit))}</div></div>`).join("")}</div>
  </div>`;
}

function monthWeeksHTML(data, ctx, today, month, pick) {
  const currentIndex = currentWeekIndex(data, today);
  const weekCount = Math.ceil((new Date(historyEnd(data, today)) - new Date(data.startDate)) / 86400000 / 7) + 1;
  let html = "";
  for (let w = 0; w < weekCount; w++) {
    const start = addDays(data.startDate, w * 7);
    const touches = Array.from({ length: 7 }, (_, i) => addDays(start, i)).some((d) => monthKey(d) === month);
    if (touches) html += weekHTML(weekReport(data, ctx, w, today), { mini: false, today, currentIndex, pick });
  }
  return html;
}

// 보상 휴식 날짜 고르기 모드에서 고를 수 있는 날짜(그 달에 걸친 주의 모든 날)
function pickableDates(data, ctx, today, month) {
  const { savedMin } = bonusSavings(data, ctx, today);
  const set = new Set();
  const weekCount = Math.ceil((new Date(historyEnd(data, today)) - new Date(data.startDate)) / 86400000 / 7) + 1;
  for (let w = 0; w < weekCount; w++) {
    const start = addDays(data.startDate, w * 7);
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      if (monthKey(d) === month && !bonusBlockReason(data, d, today) && bonusMaxFor(data, d, savedMin) > 0) set.add(d);
    }
  }
  return set;
}

function monthNavHTML(month, today, data) {
  const first = monthKey(today);
  const last = monthKey(historyEnd(data, today));
  const btn = (step, label, off) => `<button class="btn btn-secondary btn-sm" data-action="bonus-month" data-step="${step}" type="button"${off ? " disabled" : ""}>${label}</button>`;
  return `<div class="month-nav">${btn(-1, "‹", month <= first)}<b>${Number(month.slice(5, 7))}월</b>${btn(1, "›", month >= last)}</div>`;
}

export function renderWeek(data, ctx, today, ui) {
  const track = trackAt(data, today);
  const month = ui.bonusPick && ui.weekMonth ? ui.weekMonth : monthKey(today);
  const pick = ui.bonusPick ? pickableDates(data, ctx, today, month) : null;
  return `<section class="view">
    ${trackBarHTML(data, track, today)}
    ${noticesHTML(data, ctx, track, today)}
    ${shipCardHTML(data, ctx, today, ui)}
    <div class="card">
      <div class="section-header-row">
        <h2 class="section-title">${Number(month.slice(5, 7))}월 주간 현황</h2>
      </div>
      ${ui.bonusPick ? monthNavHTML(month, today, data) : ""}
      ${legendHTML()}${monthWeeksHTML(data, ctx, today, month, pick)}
      <p class="hint">이번 달 주간만 보여요(지난 기록은 '공부기록' 탭). 미래 칸을 탭: 1번 휴식 → 2번 복습(주 1일) → 3번 원상복귀. 🎁 칸을 탭하면 보상 휴식을 취소할 수 있어요.</p>
    </div>
    ${quotaHTML(data, ctx, track, currentWeekIndex(data, today))}
  </section>`;
}
