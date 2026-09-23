import { formatKoreanDate } from "../dates.js";
import { trackAt, dayReport } from "../stats.js";
import { dayLoad, maintenanceGoals, maintenanceTargets } from "../plan.js";
import { isAutoGoal, weekProgress, isLastStudyDay } from "../weekplan.js";
import { UNIT_SUGGESTIONS, TRACK_LABEL, countUnit } from "../presets.js";
import { escapeHtml, subjectColor, formatDuration } from "./shared.js";
import { tomorrowCardHTML } from "./tomorrow.js";

// 남은 이월: 고정 목표의 이월 + 자동 목표의 이번 주 부족분(주가 끝나면 다음 주 역산에 흡수되어 빠진다)
function carryOf(data, ctx, goalId) {
  const fixed = data.carries
    .filter((c) => c.goalId === goalId && !c.redistribute)
    .reduce((sum, c) => sum + Math.max(0, ctx.remaining.get(c.id) || 0), 0);
  let auto = 0;
  ctx.autoDebts.forEach((debt, key) => {
    if (debt.open && key.startsWith(`${goalId}|`)) auto += debt.left;
  });
  return fixed + auto;
}

function goalRowHTML(data, ctx, row, selected, tag = "", auto = null) {
  const { goal, target, done } = row;
  const carry = carryOf(data, ctx, goal.id);
  const fin = target > 0 && done >= target;
  return `<div class="goal-row${selected ? " selected" : ""}${fin ? " fin" : ""}${tag ? " maint" : ""}" data-action="select-goal" data-id="${goal.id}">
    <div>
      <div class="goal-name"><i class="swatch" style="background:${subjectColor(data, goal.subject)}"></i>${escapeHtml(goal.subject)}<span class="round">${goal.round}${goal.targetRounds ? `/${goal.targetRounds}` : ""}회독</span></div>
      <div class="goal-meta"><span class="unit">${escapeHtml(goal.unit)}</span>${tag ? `<span class="unit maint-tag">${tag}</span>` : ""}${carry ? `<span class="unit carry">이월 ${carry}${escapeHtml(countUnit(goal.unit))}</span>` : ""}${auto ? `<span class="unit auto-tag">자동 · 이번 주 ${auto.progress.done}/${auto.progress.quota}</span>` : ""}</div>
      ${auto && auto.last && !fin ? `<div class="goal-rec">이번 주 마지막 공부일 · 못 채우면 다음 주 계획에 자동 반영돼요</div>` : ""}
    </div>
    <div class="goal-count">${target > 0 ? `${done} / ${target}<small>${escapeHtml(countUnit(goal.unit))}</small>${fin ? " ✓" : ""}` : `${done}<small>${escapeHtml(countUnit(goal.unit))} · 오늘 목표 없음</small>`}</div>
  </div>`;
}

// mode: auto(자동 계획)·fill(남는 시간 채우기)은 평일/주말 숫자를 쓰지 않는다. compact: 목록 전체가 숫자를 안 써서 숫자 칸 자리를 없앤다.
function goalEditHTML(goal, mode, compact = false) {
  const num = (field, value, label) =>
    `<input type="number" min="0" inputmode="numeric" value="${value}" data-goal-field="${field}" data-id="${goal.id}" aria-label="${label}" />`;
  const label = { auto: "자동 계획", fill: "채우기" }[mode];
  const targets = compact ? "" : label ? `<span class="auto-cell">${label}</span>` : `${num("weekdayTarget", goal.weekdayTarget, "평일 목표")}${num("weekendTarget", goal.weekendTarget, "주말 목표")}`;
  const days = mode === "fill"
    ? `<span class="days-note">남는 시간에 하루 최대 2개씩 채워요</span>`
    : `<span class="days-label">주</span>
       <button type="button" class="step-btn" data-action="days-step" data-id="${goal.id}" data-step="-1" aria-label="하루 줄이기"${goal.daysPerWeek <= 1 ? " disabled" : ""}>−</button>
       <b class="days-value">${goal.daysPerWeek}일</b>
       <button type="button" class="step-btn" data-action="days-step" data-id="${goal.id}" data-step="1" aria-label="하루 늘리기"${goal.daysPerWeek >= 7 ? " disabled" : ""}>+</button>`;
  return `<div class="goal-edit">
    <div class="goal-edit-main${compact ? " compact" : ""}">
      <input type="text" value="${escapeHtml(goal.subject)}" data-goal-field="subject" data-id="${goal.id}" aria-label="과목" list="subject-names" />
      <input type="text" value="${escapeHtml(goal.unit)}" data-goal-field="unit" data-id="${goal.id}" aria-label="단위" list="unit-names" />
      ${targets}
      <button type="button" class="btn-danger" data-action="archive-goal" data-id="${goal.id}" aria-label="삭제">✕</button>
    </div>
    <div class="days-stepper">${days}</div>
  </div>`;
}

const editModeOf = (data, goal) => (goal.planMode === "fill" ? "fill" : isAutoGoal(data, goal) ? "auto" : "fixed");

function undoInfoHTML(data, today) {
  const entries = data.entries.filter((e) => e.date === today);
  if (!entries.length) return "";
  const last = entries.reduce((a, b) => (b.at >= a.at ? b : a));
  const goal = data.goals.find((g) => g.id === last.goalId);
  return `<p class="hint">오늘 입력 ${entries.length}건 · 되돌리기를 누르면 직전 입력(${goal ? escapeHtml(goal.subject) : "?"} +${last.amount})부터 하나씩 취소돼요.</p>`;
}

// 과목을 탭하면 탭바 위로 올라오는 입력 시트. 목록이 길어도 스크롤 없이 고르고 바로 추가할 수 있다.
function pickerSheetHTML(pick, goal, data, today, animate) {
  const count = data.entries.filter((e) => e.date === today).length;
  return `<div class="picker-sheet${animate ? " sheet-in" : ""}">
    <div class="picker-sheet-head">
      <span class="chip">${escapeHtml(goal.subject)} · ${escapeHtml(goal.unit)}</span>
      <button class="sheet-close" data-action="close-picker" type="button" aria-label="입력창 닫기">✕</button>
    </div>
    <div class="picker"><div class="picker-scroll" id="picker" data-pick="${pick}">
      ${Array.from({ length: 11 }, (_, i) => `<div class="picker-item">${i}</div>`).join("")}
    </div></div>
    <div class="form-inline picker-actions">
      <button class="btn btn-primary" data-action="add-entry" data-unit="${escapeHtml(countUnit(goal.unit))}" type="button">+ ${pick}${escapeHtml(countUnit(goal.unit))} 추가</button>
      <button class="btn btn-secondary" data-action="undo-entry" type="button">되돌리기${count ? ` (${count})` : ""}</button>
    </div>
    ${undoInfoHTML(data, today) || `<p class="hint">0~10을 스크롤 → 추가. 여러 번 눌러 누적해요. 목표를 넘긴 양은 이월분부터 갚아요.</p>`}
  </div>`;
}

// 시트가 닫혀 있을 때도 실수한 입력을 되돌릴 수 있게 목록 아래에 한 줄 둔다.
function undoLineHTML(data, today) {
  const count = data.entries.filter((e) => e.date === today).length;
  if (!count) return "";
  return `<div class="undo-line"><span>오늘 입력 ${count}건</span><button class="btn btn-secondary btn-sm" data-action="undo-entry" type="button">되돌리기 (${count})</button></div>`;
}

function dawnNoticeHTML(dawn) {
  if (!dawn) return "";
  return `<div class="notice">🌙 새벽이라 아직 ${formatKoreanDate(dawn.resolved)} 걸로 기록 중이에요.
    <button class="btn btn-sm btn-secondary" data-action="toggle-dawn" data-date="${dawn.other}" type="button">${formatKoreanDate(dawn.other)} 걸로 바꾸기</button></div>`;
}

function dayNoticeHTML(data, today, report) {
  const load = dayLoad(data, today, today);
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

// 다른 트랙 집중 기간에 가볍게 이어 가는 목표. 못 채워도 달성/미달 판정·이월에 영향이 없다.
function maintSectionHTML(data, ctx, today, maintGoals, maintTargets, selected) {
  if (!maintGoals.length) return "";
  const label = TRACK_LABEL[maintGoals[0].track];
  return `<div class="maint-title">${label} 유지 · 가볍게 <small>(못 채워도 미달로 안 세요)</small></div>
    ${maintGoals
      .map((g) => goalRowHTML(data, ctx, { goal: g, target: maintTargets[g.id] || 0, done: ctx.sums.get(`${g.id}|${today}`) || 0 }, selected && g.id === selected.id, "유지"))
      .join("")}`;
}

export function renderToday(data, ctx, today, ui, dawn = null) {
  const track = trackAt(data, today);
  const report = dayReport(data, ctx, today, today);
  const goals = data.goals.filter((g) => !g.archived && g.track === track);
  const rowFor = (goal) => report.rows.find((r) => r.goal.id === goal.id) || { goal, target: 0, done: ctx.sums.get(`${goal.id}|${today}`) || 0 };
  const maintGoals = maintenanceGoals(data, today, today);
  const maintTargets = maintenanceTargets(data, today, today);
  const selected = [...goals, ...maintGoals].find((g) => g.id === ui.selectedGoalId) || goals[0] || maintGoals[0];
  const sheetOpen = !ui.editing && ui.pickerOpen && !!selected;
  const names = [...new Set(data.goals.map((g) => g.subject))];
  const allAuto = goals.length > 0 && goals.every((g) => editModeOf(data, g) !== "fixed");
  const animate = sheetOpen && ui.pickerAnim;
  ui.pickerAnim = false;

  // 오늘 목표도 이월도 기록도 없는 과목은 접어 둔다(탭하면 펼쳐지고, 골라서 추가 입력은 가능)
  const isQuiet = (g) => {
    const row = rowFor(g);
    return row.target <= 0 && row.done <= 0 && !carryOf(data, ctx, g.id);
  };
  const activeGoals = goals.filter((g) => !isQuiet(g));
  const quietGoals = goals.filter(isQuiet);
  const quietOpen = ui.quietOpen || (sheetOpen && quietGoals.some((g) => g.id === selected.id));
  const rowHTML = (g) => {
    const auto = isAutoGoal(data, g) ? { progress: weekProgress(data, ctx, g, today), last: !report.kind && isLastStudyDay(data, g, today) } : null;
    return goalRowHTML(data, ctx, rowFor(g), sheetOpen && g.id === selected.id, "", auto);
  };
  const quietHTML = quietGoals.length
    ? `<button class="quiet-toggle" data-action="toggle-quiet" type="button" aria-expanded="${quietOpen}">
        <span>오늘 목표 없는 과목 ${quietGoals.length}개</span><span class="chev${quietOpen ? " open" : ""}">›</span></button>
       ${quietOpen ? quietGoals.map(rowHTML).join("") : ""}`
    : "";

  return `<section class="view${sheetOpen ? " picker-open" : ""}">
    <div class="card">
      <div class="section-header-row"><h2 class="section-title">오늘 ${formatKoreanDate(today)}</h2>
        <button class="btn btn-secondary btn-sm" data-action="toggle-edit" type="button">${ui.editing ? "완료" : "편집"}</button></div>
      ${ui.editing ? "" : dawnNoticeHTML(dawn)}
      ${ui.editing ? "" : dayNoticeHTML(data, today, report)}
      ${ui.editing
        ? `<div class="goal-edit-head${allAuto ? " compact" : ""}"><span>과목</span><span>단위</span>${allAuto ? "" : "<span>평일</span><span>주말</span>"}<span></span></div>
           ${goals.map((g) => goalEditHTML(g, editModeOf(data, g), allAuto)).join("")}
           <form data-form="add-goal" class="form goal-add">
             <div class="goal-add-fields"><input type="text" name="subject" placeholder="과목 이름" required list="subject-names" /><input type="text" name="unit" placeholder="단위(예: 문제)" required list="unit-names" /></div>
             <button class="btn btn-secondary" type="submit">+ 목표 추가</button>
           </form>
           <p class="hint">${allAuto ? "이름·단위·주 며칠 할지를 직접 수정해요. 하루 목표는 자동 계획이 계산해요." : "이름·단위·주 며칠 할지(고정 목표는 평일/주말 목표도)를 직접 수정해요."} 어느 요일에 할지는 매주 랜덤으로 정해져요(요일별 시간은 고르게, 과목이 3일 넘게 비지 않게). 삭제해도 지난 기록은 남아요. 같은 과목 이름이면 색도 같아요. 공휴일은 주말로 계산해요.</p>
           <datalist id="subject-names">${names.map((n) => `<option value="${escapeHtml(n)}">`).join("")}</datalist>
           <datalist id="unit-names">${UNIT_SUGGESTIONS.map((n) => `<option value="${n}">`).join("")}</datalist>`
        : goals.length
          ? `${activeGoals.map(rowHTML).join("")}${quietHTML}`
          : `<p class="empty-state">목표가 없어요. 편집에서 추가해보세요.</p>`}
      ${ui.editing ? "" : maintSectionHTML(data, ctx, today, maintGoals, maintTargets, sheetOpen ? selected : null)}
      ${ui.editing || sheetOpen ? "" : undoLineHTML(data, today)}
    </div>
    ${ui.editing || sheetOpen ? "" : tomorrowCardHTML(data, ctx, today, ui)}
    ${sheetOpen ? pickerSheetHTML(ui.pick, selected, data, today, animate) : ""}
  </section>`;
}
