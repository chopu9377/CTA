import { formatKoreanDate } from "../dates.js";
import { weekShip, bonusSavings, bonusLockedOn, bonusPreview, bonusMinutes, bonusMaxFor, BONUS_CAP_MIN, BONUS_STEP_MIN } from "../bonus.js";
import { limitMinutes } from "../plan.js";
import { countUnit } from "../presets.js";
import { escapeHtml, formatDuration, SHIP } from "./shared.js";

const WEEK_TEXT = {
  behind: (s) => `지금까지 ${formatDuration(s.behindMin)} 부족해요`,
  cruise: () => "이번 주 계획대로 가고 있어요",
  ahead: (s) => `이번 주 목표보다 ${formatDuration(s.aheadMin)} 더 했어요`
};

// 주간 탭 상단: 이번 주 진행 배지 + 휴식 저축 게이지 + 쓰기 버튼
export function shipCardHTML(data, ctx, today, ui) {
  const ship = weekShip(data, ctx, today);
  const { savedMin } = bonusSavings(data, ctx, today);
  const locked = bonusLockedOn(data, today, today);
  const canUse = !locked && savedMin >= BONUS_STEP_MIN;
  const pct = Math.min(100, (savedMin / BONUS_CAP_MIN) * 100);
  const hint = locked
    ? "시험 3주 전부터는 휴식 저축을 쓸 수 없어요"
    : savedMin >= BONUS_STEP_MIN
      ? "목표를 넘겨 푼 시간이 쌓였어요. 미래의 하루를 쉬는 데 쓸 수 있어요"
      : "목표보다 넘게 풀면 휴식 저축이 쌓여요(이월분을 먼저 갚고 남은 것만)";
  const action = ui.bonusPick
    ? `<button class="btn btn-secondary btn-sm" data-action="bonus-toggle" type="button">쓰기 취소</button>`
    : `<button class="btn btn-primary btn-sm" data-action="bonus-toggle" type="button"${canUse ? "" : " disabled"}>저축 쓰기</button>`;
  return `<div class="card ship ship-${ship.level}">
    <div class="ship-main">
      <span class="ship-emoji" aria-hidden="true">${SHIP[ship.level].emoji}</span>
      <div><b>이번 주 ${SHIP[ship.level].label}</b><div class="ship-sub">${WEEK_TEXT[ship.level](ship)}</div></div>
    </div>
    <div class="overall"><span>휴식 저축</span><div class="meter-track"><div class="meter-fill" style="width:${pct}%"></div></div><b>${formatDuration(savedMin)} / ${formatDuration(BONUS_CAP_MIN)}</b></div>
    <div class="ship-foot"><p class="hint">${ui.bonusPick ? "쉴 날을 탭하세요. 테두리가 있는 칸만 고를 수 있고, 회색 칸(지난 날·휴식/복습일·시험 3주 전 이후)은 쓸 수 없어요." : hint}</p>${action}</div>
  </div>`;
}

function stepperHTML(minutes, max) {
  return `<div class="bonus-stepper">
    <button class="btn btn-secondary btn-sm" data-action="bonus-step" data-step="-1" type="button"${minutes <= BONUS_STEP_MIN ? " disabled" : ""}>−</button>
    <b>${formatDuration(minutes)}</b>
    <button class="btn btn-secondary btn-sm" data-action="bonus-step" data-step="1" type="button"${minutes >= max ? " disabled" : ""}>＋</button>
  </div>`;
}

// 날짜를 고른 뒤 확인 시트: 쉴 시간을 정하고 그날 목표가 어떻게 바뀌는지 미리 본다
export function bonusSheetHTML(data, ctx, today, ui) {
  const { savedMin } = bonusSavings(data, ctx, today);
  const date = ui.bonusDate;
  const max = bonusMaxFor(data, date, savedMin);
  const minutes = Math.min(Math.max(ui.bonusMinutes, BONUS_STEP_MIN), max);
  const preview = bonusPreview(data, date, minutes, today);
  const limit = limitMinutes(data, date);
  const rows = preview.rows
    .map((r) => `<div class="settle-what">${escapeHtml(r.goal.subject)} ${r.before}${escapeHtml(countUnit(r.goal.unit))} → <b>${r.after}${escapeHtml(countUnit(r.goal.unit))}</b></div>`)
    .join("");
  const note = preview.planned
    ? rows
    : `<div class="settle-what">그날 목표량은 그 주가 시작될 때 정해지고, 그때 같은 비율로 줄어요.</div>`;
  return `<div class="sheet-backdrop"><div class="sheet">
    <h3 class="sheet-title">${formatKoreanDate(date)} 보상 휴식</h3>
    <p class="hint">그날 공부 가능 시간 ${formatDuration(limit)} 중 쉴 시간을 골라요. 저축 ${formatDuration(savedMin)}에서 빠져요.</p>
    ${stepperHTML(minutes, max)}
    <div class="settle-item">
      <div class="settle-date">${preview.full ? "그날은 통째로 쉬어요" : `그날 목표가 약 ${Math.round(preview.ratio * 100)}% 줄어요`}</div>
      ${note}
    </div>
    <div class="form-inline">
      <button class="btn btn-primary" data-action="confirm-bonus" type="button">쉬기로 확정</button>
      <button class="btn btn-secondary" data-action="close-sheet" type="button">닫기</button>
    </div>
  </div></div>`;
}

// 이미 보상 휴식인 날을 탭했을 때: 취소하면 시간이 저축으로 돌아온다
export function bonusCancelSheetHTML(data, ui) {
  const minutes = bonusMinutes(data, ui.bonusDate);
  return `<div class="sheet-backdrop"><div class="sheet">
    <h3 class="sheet-title">${formatKoreanDate(ui.bonusDate)} 보상 휴식</h3>
    <p class="hint">쉬기로 한 시간은 ${formatDuration(minutes)}예요. 취소하면 그 시간이 휴식 저축으로 돌아오고 그날 목표도 원래대로 돌아가요.</p>
    <div class="form-inline">
      <button class="btn btn-secondary" data-action="cancel-bonus" type="button">휴식 취소</button>
      <button class="btn btn-primary" data-action="close-sheet" type="button">그대로 두기</button>
    </div>
  </div></div>`;
}
