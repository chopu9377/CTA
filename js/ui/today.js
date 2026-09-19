import { formatKoreanDate, weekdayOf, WEEKDAY_LABELS } from "../dates.js";
import { trackAt, dayReport, paceFor, dayLoad } from "../stats.js";
import { UNIT_SUGGESTIONS, WEEKDAY_PRESETS } from "../presets.js";
import { escapeHtml, subjectColor, shortUnit, formatDuration } from "./shared.js";

function carryOf(data, ctx, goalId) {
  return data.carries
    .filter((c) => c.goalId === goalId)
    .reduce((sum, c) => sum + Math.max(0, ctx.remaining.get(c.id) || 0), 0);
}

function recommendation(data, goal, today, weekend) {
  const pace = paceFor(data, goal, today);
  if (!pace) return null;
  const amount = weekend ? pace.perWeekend : pace.perWeekday;
  return amount > 0 ? amount : null;
}

function goalRowHTML(data, ctx, row, selected, rec) {
  const { goal, target, done } = row;
  const carry = carryOf(data, ctx, goal.id);
  const fin = target > 0 && done >= target;
  return `<div class="goal-row${selected ? " selected" : ""}${fin ? " fin" : ""}" data-action="select-goal" data-id="${goal.id}">
    <div>
      <div class="goal-name"><i class="swatch" style="background:${subjectColor(data, goal.subject)}"></i>${escapeHtml(goal.subject)}<span class="round">${goal.round}${goal.targetRounds ? `/${goal.targetRounds}` : ""}회독</span></div>
      <div class="goal-meta"><span class="unit">${escapeHtml(goal.unit)}</span>${carry ? `<span class="unit carry">이월 ${carry}</span>` : ""}</div>
      ${rec ? `<div class="goal-rec">권장 <b>${rec}${escapeHtml(shortUnit(goal.unit))}</b></div>` : ""}
    </div>
    <div class="goal-count">${target > 0 ? `${done} / ${target}${fin ? " ✓" : ""}` : `${done}<small> 오늘 목표 없음</small>`}</div>
  </div>`;
}

function goalEditHTML(goal) {
  const chips = WEEKDAY_LABELS.map(
    (label, day) => `<button type="button" class="chip-btn${goal.weekdays.includes(day) ? " on" : ""}" data-action="toggle-weekday" data-id="${goal.id}" data-day="${day}">${label}</button>`
  ).join("");
  const num = (field, value, label) =>
    `<input type="number" min="0" inputmode="numeric" value="${value}" data-goal-field="${field}" data-id="${goal.id}" aria-label="${label}" />`;
  return `<div class="goal-edit">
    <div class="goal-edit-main">
      <input type="text" value="${escapeHtml(goal.subject)}" data-goal-field="subject" data-id="${goal.id}" aria-label="과목" list="subject-names" />
      <input type="text" value="${escapeHtml(goal.unit)}" data-goal-field="unit" data-id="${goal.id}" aria-label="단위" list="unit-names" />
      ${num("weekdayTarget", goal.weekdayTarget, "평일 목표")}
      ${num("weekendTarget", goal.weekendTarget, "주말 목표")}
      <button type="button" class="btn-danger" data-action="archive-goal" data-id="${goal.id}" aria-label="삭제">✕</button>
    </div>
    <div class="weekday-chips">${chips}</div>
  </div>`;
}

function presetsHTML() {
  return `<div class="preset-box">
    <div class="preset-title">요일 패턴 프리셋</div>
    <div class="preset-btns">${WEEKDAY_PRESETS.map((p) => `<button class="btn btn-secondary btn-sm" data-action="apply-preset" data-preset="${p.key}" type="button">${p.label}</button>`).join("")}</div>
    <p class="hint">${WEEKDAY_PRESETS.map((p) => `<b>${p.label}</b>: ${p.desc}`).join("<br />")}</p>
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

function dayNoticeHTML(data, today, report) {
  const load = dayLoad(data, today);
  const type = load.weekend ? "주말" : "평일";
  const holiday = report.holiday ? ` · ${escapeHtml(report.holiday)}` : "";
  if (report.kind) {
    return `<div class="notice">${report.kind === "rest" ? "오늘은 휴식일이에요" : "오늘은 복습일이에요 — 진도 대신 이번 주 공부를 다시 떠올려봐요"}${holiday}</div>`;
  }
  const head = `<div class="notice">오늘은 ${type}이에요${holiday} · 공부 가능 ${formatDuration(load.limit)} · 오늘 목표 합계 약 ${formatDuration(load.minutes)}</div>`;
  const warn = load.minutes > load.limit
    ? `<div class="notice warn">오늘 목표 합계가 공부 가능 시간(${formatDuration(load.limit)})보다 ${formatDuration(load.minutes - load.limit)} 많아요. 목표를 줄이거나 다른 날로 옮겨보세요.</div>`
    : "";
  return head + warn;
}

export function renderToday(data, ctx, today, ui) {
  const track = trackAt(data, today);
  const report = dayReport(data, ctx, today, today);
  const goals = data.goals.filter((g) => !g.archived && g.track === track);
  const rowFor = (goal) => report.rows.find((r) => r.goal.id === goal.id) || { goal, target: 0, done: ctx.sums.get(`${goal.id}|${today}`) || 0 };
  const selected = goals.find((g) => g.id === ui.selectedGoalId) || goals[0];
  const weekend = dayLoad(data, today).weekend;
  const scheduledToday = (g) => !report.kind && g.weekdays.includes(weekdayOf(today));
  const names = [...new Set(data.goals.map((g) => g.subject))];

  return `<section class="view">
    <div class="card">
      <div class="section-header-row"><h2 class="section-title">오늘 ${formatKoreanDate(today)}</h2>
        <button class="btn btn-secondary btn-sm" data-action="toggle-edit" type="button">${ui.editing ? "완료" : "편집"}</button></div>
      ${ui.editing ? "" : dayNoticeHTML(data, today, report)}
      ${ui.editing
        ? `${presetsHTML()}
           <div class="goal-edit-head"><span>과목</span><span>단위</span><span>평일</span><span>주말</span><span></span></div>
           ${goals.map(goalEditHTML).join("")}
           <form data-form="add-goal" class="form goal-add">
             <div class="goal-add-fields"><input type="text" name="subject" placeholder="과목 이름" required list="subject-names" /><input type="text" name="unit" placeholder="단위(예: 문제)" required list="unit-names" /></div>
             <button class="btn btn-secondary" type="submit">+ 목표 추가</button>
           </form>
           <p class="hint">이름·단위·평일/주말 목표·요일을 직접 수정해요. 삭제해도 지난 기록은 남아요. 같은 과목 이름이면 색도 같아요. 공휴일은 주말로 계산해요.</p>
           <datalist id="subject-names">${names.map((n) => `<option value="${escapeHtml(n)}">`).join("")}</datalist>
           <datalist id="unit-names">${UNIT_SUGGESTIONS.map((n) => `<option value="${n}">`).join("")}</datalist>`
        : goals.length
          ? goals.map((g) => goalRowHTML(data, ctx, rowFor(g), selected && g.id === selected.id, scheduledToday(g) ? recommendation(data, g, today, weekend) : null)).join("")
          : `<p class="empty-state">목표가 없어요. 편집에서 추가해보세요.</p>`}
    </div>
    ${ui.editing || !selected ? "" : pickerHTML(ui.pick, selected)}
  </section>`;
}
