import { formatKoreanDate, WEEKDAY_LABELS } from "../dates.js";
import { trackAt, dayReport } from "../stats.js";
import { UNIT_SUGGESTIONS } from "../presets.js";
import { escapeHtml, subjectColor } from "./shared.js";

function carryOf(data, ctx, goalId) {
  return data.carries
    .filter((c) => c.goalId === goalId)
    .reduce((sum, c) => sum + Math.max(0, ctx.remaining.get(c.id) || 0), 0);
}

function goalRowHTML(data, ctx, row, selected) {
  const { goal, target, done } = row;
  const carry = carryOf(data, ctx, goal.id);
  const fin = target > 0 && done >= target;
  return `<div class="goal-row${selected ? " selected" : ""}${fin ? " fin" : ""}" data-action="select-goal" data-id="${goal.id}">
    <div>
      <div class="goal-name"><i class="swatch" style="background:${subjectColor(data, goal.subject)}"></i>${escapeHtml(goal.subject)}<span class="round">${goal.round}회독</span></div>
      <div class="goal-meta"><span class="unit">${escapeHtml(goal.unit)}</span>${carry ? `<span class="unit carry">이월 ${carry}</span>` : ""}</div>
    </div>
    <div class="goal-count">${target > 0 ? `${done} / ${target}${fin ? " ✓" : ""}` : `${done}<small> 오늘 목표 없음</small>`}</div>
  </div>`;
}

function goalEditHTML(goal) {
  const chips = WEEKDAY_LABELS.map(
    (label, day) => `<button type="button" class="chip-btn${goal.weekdays.includes(day) ? " on" : ""}" data-action="toggle-weekday" data-id="${goal.id}" data-day="${day}">${label}</button>`
  ).join("");
  return `<div class="goal-edit">
    <div class="goal-edit-main">
      <input type="text" value="${escapeHtml(goal.subject)}" data-goal-field="subject" data-id="${goal.id}" aria-label="과목" list="subject-names" />
      <input type="text" value="${escapeHtml(goal.unit)}" data-goal-field="unit" data-id="${goal.id}" aria-label="단위" list="unit-names" />
      <input type="number" min="0" inputmode="numeric" value="${goal.dailyTarget}" data-goal-field="dailyTarget" data-id="${goal.id}" aria-label="하루 목표" />
      <button type="button" class="btn-danger" data-action="archive-goal" data-id="${goal.id}" aria-label="삭제">✕</button>
    </div>
    <div class="weekday-chips">${chips}</div>
  </div>`;
}

function pickerHTML(pick, goal) {
  return `<div class="card">
    <div class="section-header-row"><h2 class="section-title">푼 개수 추가</h2><span class="chip">${escapeHtml(goal.subject)} · ${escapeHtml(goal.unit)}</span></div>
    <div class="picker"><div class="picker-scroll" id="picker" data-pick="${pick}">
      ${Array.from({ length: 11 }, (_, i) => `<div class="picker-item">${i}</div>`).join("")}
    </div></div>
    <div class="form-inline picker-actions">
      <button class="btn btn-primary" data-action="add-entry" type="button">+ 추가</button>
      <button class="btn btn-secondary" data-action="undo-entry" type="button">되돌리기</button>
    </div>
    <p class="hint">과목을 탭 → 0~10 스크롤 → 추가. 여러 번 눌러 누적해요. 목표를 넘긴 양은 이월분부터 갚아요.</p>
  </div>`;
}

export function renderToday(data, ctx, today, ui) {
  const track = trackAt(data, today);
  const report = dayReport(data, ctx, today, today);
  const goals = data.goals.filter((g) => !g.archived && g.track === track);
  const rowFor = (goal) => report.rows.find((r) => r.goal.id === goal.id) || { goal, target: 0, done: ctx.sums.get(`${goal.id}|${today}`) || 0 };
  const selected = goals.find((g) => g.id === ui.selectedGoalId) || goals[0];
  const kindBanner = report.kind
    ? `<div class="notice">${report.kind === "rest" ? "오늘은 휴식일이에요" : "오늘은 복습일이에요 — 진도 대신 이번 주 공부를 다시 떠올려봐요"}${report.holiday ? ` · ${escapeHtml(report.holiday)}` : ""}</div>`
    : report.holiday
      ? `<div class="notice">${escapeHtml(report.holiday)}</div>`
      : "";
  const names = [...new Set(data.goals.map((g) => g.subject))];

  return `<section class="view">
    <div class="card">
      <div class="section-header-row"><h2 class="section-title">오늘 ${formatKoreanDate(today)}</h2>
        <button class="btn btn-secondary btn-sm" data-action="toggle-edit" type="button">${ui.editing ? "완료" : "편집"}</button></div>
      ${kindBanner}
      ${ui.editing
        ? `${goals.map(goalEditHTML).join("")}
           <form data-form="add-goal" class="form goal-add">
             <div class="goal-edit-main"><input type="text" name="subject" placeholder="과목 이름" required list="subject-names" /><input type="text" name="unit" placeholder="단위(예: 문제)" required list="unit-names" /></div>
             <button class="btn btn-secondary" type="submit">+ 목표 추가</button>
           </form>
           <p class="hint">이름·단위·하루 목표·요일을 직접 수정해요. 삭제해도 지난 기록은 남아요. 같은 과목 이름이면 색도 같아요.</p>
           <datalist id="subject-names">${names.map((n) => `<option value="${escapeHtml(n)}">`).join("")}</datalist>
           <datalist id="unit-names">${UNIT_SUGGESTIONS.map((n) => `<option value="${n}">`).join("")}</datalist>`
        : goals.length
          ? goals.map((g) => goalRowHTML(data, ctx, rowFor(g), selected && g.id === selected.id)).join("")
          : `<p class="empty-state">목표가 없어요. 편집에서 추가해보세요.</p>`}
    </div>
    ${ui.editing || !selected ? "" : pickerHTML(ui.pick, selected)}
  </section>`;
}
