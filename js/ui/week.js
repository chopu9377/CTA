import { addDays, monthKey } from "../dates.js";
import { trackAt, weekReport, weekQuotas, currentWeekIndex, daysUntil, pendingSettlements, historyEnd } from "../stats.js";
import { focusRows } from "../plan.js";
import { TRACK_LABEL, countUnit } from "../presets.js";
import { escapeHtml, ringHTML, subjectColor } from "./shared.js";
import { legendHTML, weekHTML } from "./weekgrid.js";

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
  const undecided = pendingSettlements(data, ctx, today).length;
  if (undecided) {
    notices.push(`<div class="notice">이월 여부를 정하지 않은 미달분이 ${undecided}일치 있어요. <button class="btn btn-sm btn-secondary" data-action="open-settle" type="button">정하기</button></div>`);
  }
  return notices.join("");
}

function focusHTML(data, track, today) {
  const { rows, days, from } = focusRows(data, track, today);
  if (!days) return `<p class="empty-state">설정에서 ${TRACK_LABEL[track]} 시험일을 입력하면 하루 필요량이 계산돼요.</p>`;
  return `<p class="hint">남은 분량 ÷ 남은 공부일수(${days}일, ${from} 기준)만 봅니다. 휴식·복습일은 제외.</p>
    <table class="focus-table"><tr><th>과목</th><th>남은 분량</th><th>하루 필요</th></tr>
    ${rows.map((r) => `<tr>
      <td><i class="swatch" style="background:${subjectColor(data, r.goal.subject)}"></i>${escapeHtml(r.goal.subject)}<span class="unit">${escapeHtml(countUnit(r.goal.unit))}</span></td>
      <td>${r.remaining === null ? "총 분량 미입력" : r.remaining}</td>
      <td>${r.perDay === null ? "-" : `<b>${r.perDay.toFixed(1)}</b>`}</td></tr>`).join("")}</table>`;
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

function monthWeeksHTML(data, ctx, today) {
  const month = monthKey(today);
  const currentIndex = currentWeekIndex(data, today);
  const weekCount = Math.ceil((new Date(historyEnd(data, today)) - new Date(data.startDate)) / 86400000 / 7) + 1;
  let html = "";
  for (let w = 0; w < weekCount; w++) {
    const start = addDays(data.startDate, w * 7);
    const touches = Array.from({ length: 7 }, (_, i) => addDays(start, i)).some((d) => monthKey(d) === month);
    if (touches) html += weekHTML(weekReport(data, ctx, w, today), { mini: false, today, currentIndex });
  }
  return html;
}

export function renderWeek(data, ctx, today) {
  const track = trackAt(data, today);
  const focus = data.settings.focusMode;
  const monthNumber = Number(today.slice(5, 7));
  return `<section class="view">
    ${trackBarHTML(data, track, today)}
    ${noticesHTML(data, ctx, track, today)}
    <div class="card">
      <div class="section-header-row">
        <h2 class="section-title">${monthNumber}월 주간 현황</h2>
        <span class="switch-row">집중 모드 <button class="sw${focus ? " on" : ""}" data-action="toggle-focus" type="button" aria-label="집중 모드"></button></span>
      </div>
      ${focus ? focusHTML(data, track, today) : `${legendHTML()}${monthWeeksHTML(data, ctx, today)}
        <p class="hint">이번 달 주간만 보여요(지난 기록은 '공부기록' 탭). 미래 칸을 탭: 1번 휴식 → 2번 복습(주 1일) → 3번 원상복귀.</p>`}
    </div>
    ${focus ? "" : quotaHTML(data, ctx, track, currentWeekIndex(data, today))}
  </section>`;
}
