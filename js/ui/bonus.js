import { formatKoreanDate } from "../dates.js";
import { weekShip, bonusSavings, bonusLockedOn, bonusGoalRows, bonusMinutes } from "../bonus.js";
import { countUnit } from "../presets.js";
import { escapeHtml, formatDuration, subjectColor, SHIP } from "./shared.js";

const WEEK_TEXT = {
  behind: (s) => `지금까지 ${formatDuration(s.behindMin)} 부족해요`,
  cruise: () => "이번 주 계획대로 가고 있어요",
  ahead: (s) => `이번 주 목표보다 ${formatDuration(s.aheadMin)} 더 했어요`
};

// "법인세 2문제 (40분)"
function savedText(goal, n) {
  return `${n}${escapeHtml(countUnit(goal.unit))} (${formatDuration(n * goal.minutesPerUnit)})`;
}

// 과목별 저축 게이지(과목마다 7시간어치가 상한)
function savingsRowsHTML(data, byGoal) {
  return [...byGoal.values()]
    .map(({ goal, saved, cap }) => `<div class="overall"><span>${escapeHtml(goal.subject)}</span><div class="meter-track"><div class="meter-fill" style="width:${Math.min(100, (saved / cap) * 100)}%;background:${subjectColor(data, goal.subject)}"></div></div><b>${savedText(goal, saved)}</b></div>`)
    .join("");
}

// 주간 탭 상단: 이번 주 진행 배지 + 과목별 휴식 저축 게이지 + 쓰기 버튼
export function shipCardHTML(data, ctx, today, ui) {
  const ship = weekShip(data, ctx, today);
  const { byGoal } = bonusSavings(data, ctx, today);
  const locked = bonusLockedOn(data, today, today);
  const canUse = !locked && byGoal.size > 0;
  const hint = locked
    ? "시험 3주 전부터는 휴식 저축을 쓸 수 없어요"
    : byGoal.size
      ? "목표를 넘겨 푼 양이 과목별로 쌓였어요. 미래의 하루에 그 과목 목표를 줄이는 데 쓸 수 있어요"
      : "목표보다 넘게 풀면 그 과목 휴식 저축이 쌓여요(이월분을 먼저 갚고 남은 것만)";
  const gauge = byGoal.size
    ? savingsRowsHTML(data, byGoal)
    : `<div class="overall"><span>휴식 저축</span><div class="meter-track"><div class="meter-fill" style="width:0%"></div></div><b>없음</b></div>`;
  const action = ui.bonusPick
    ? `<button class="btn btn-secondary btn-sm" data-action="bonus-toggle" type="button">쓰기 취소</button>`
    : `<button class="btn btn-primary btn-sm" data-action="bonus-toggle" type="button"${canUse ? "" : " disabled"}>저축 쓰기</button>`;
  return `<div class="card ship ship-${ship.level}">
    <div class="ship-main">
      <span class="ship-emoji" aria-hidden="true">${SHIP[ship.level].emoji}</span>
      <div><b>이번 주 ${SHIP[ship.level].label}</b><div class="ship-sub">${WEEK_TEXT[ship.level](ship)}</div></div>
    </div>
    ${gauge}
    <div class="ship-foot"><p class="hint">${ui.bonusPick ? "쉴 날을 탭하세요. 테두리가 있는 칸만 고를 수 있고, 회색 칸(지난 날·휴식/복습일·시험 3주 전 이후)은 쓸 수 없어요." : hint}</p>${action}</div>
  </div>`;
}

function goalStepperHTML(goal, target, amount, saved, canAdd) {
  const unit = escapeHtml(countUnit(goal.unit));
  const note = saved > 0 ? `목표 ${target}${unit} · 저축 ${saved}${unit} 중 ${amount}${unit} 줄임` : `목표 ${target}${unit} · 이 과목 저축 없음`;
  return `<div class="bonus-goal-row">
    <div class="bonus-goal-name">${escapeHtml(goal.subject)} <span class="hint">${note}</span></div>
    <div class="bonus-stepper">
      <button class="btn btn-secondary btn-sm" data-action="bonus-goal-step" data-goal="${goal.id}" data-step="-1" type="button"${amount <= 0 ? " disabled" : ""}>−</button>
      <b>${amount}${unit}</b>
      <button class="btn btn-secondary btn-sm" data-action="bonus-goal-step" data-goal="${goal.id}" data-step="1" type="button"${canAdd ? "" : " disabled"}>＋</button>
    </div>
  </div>`;
}

// 날짜를 고른 뒤 확인 시트: 과목마다 얼마나 줄일지 스테퍼로 고른다(그 과목 저축 한도 안에서)
export function bonusSheetHTML(data, ctx, today, ui) {
  const { byGoal } = bonusSavings(data, ctx, today);
  const date = ui.bonusDate;
  const { rows, planned } = bonusGoalRows(data, date, today);
  const amounts = ui.bonusAmounts || {};
  let usedMin = 0;
  const list = rows
    .map((r) => {
      const saved = byGoal.get(r.goal.id)?.saved || 0;
      const amount = Math.min(amounts[r.goal.id] || 0, r.target, saved);
      usedMin += amount * r.goal.minutesPerUnit;
      return goalStepperHTML(r.goal, r.target, amount, saved, amount < r.target && amount < saved);
    })
    .join("");
  const note = rows.length
    ? list
    : `<div class="settle-what">그날은 줄일 목표가 없어요.</div>`;
  const planNote = planned
    ? ""
    : `<div class="settle-what">그날 목표량은 그 주가 시작될 때 정해져요. 지금은 지금 진도 기준 예상치예요.</div>`;
  return `<div class="sheet-backdrop"><div class="sheet">
    <h3 class="sheet-title">${formatKoreanDate(date)} 보상 휴식</h3>
    <p class="hint">줄일 과목을 골라요. 과목마다 그 과목 저축만큼만 줄일 수 있어요(다른 과목 저축은 못 써요).</p>
    <div class="overall"><span>줄이는 시간</span><b>${formatDuration(usedMin)}</b></div>
    <div class="settle-item">
      ${note}
      ${planNote}
    </div>
    <div class="form-inline">
      <button class="btn btn-primary" data-action="confirm-bonus" type="button"${usedMin > 0 ? "" : " disabled"}>쉬기로 확정</button>
      <button class="btn btn-secondary" data-action="close-sheet" type="button">닫기</button>
    </div>
  </div></div>`;
}

// 이미 보상 휴식인 날을 탭했을 때: 취소하면 시간이 저축으로 돌아온다
export function bonusCancelSheetHTML(data, ui) {
  const minutes = bonusMinutes(data, ui.bonusDate);
  return `<div class="sheet-backdrop"><div class="sheet">
    <h3 class="sheet-title">${formatKoreanDate(ui.bonusDate)} 보상 휴식</h3>
    <p class="hint">쉬기로 한 시간은 ${formatDuration(minutes)}예요. 취소하면 줄인 양이 그 과목 휴식 저축으로 돌아오고 그날 목표도 원래대로 돌아가요.</p>
    <div class="form-inline">
      <button class="btn btn-secondary" data-action="cancel-bonus" type="button">휴식 취소</button>
      <button class="btn btn-primary" data-action="close-sheet" type="button">그대로 두기</button>
    </div>
  </div></div>`;
}
