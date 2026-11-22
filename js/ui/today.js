import { formatKoreanDate, addDays, diffDays } from "../dates.js";
import { weekQuotas, currentWeekIndex, trackAt, dayReport, effectiveKind, lightTarget } from "../stats.js";
import { dayLoad, maintenanceGoals, maintenanceTargets } from "../plan.js";
import { weekStartOf, isAutoGoal, weekProgress, isLastStudyDay, weekCarries } from "../weekplan.js";
import { UNIT_SUGGESTIONS, TRACK_LABEL, countUnit } from "../presets.js";
import { escapeHtml, subjectColor, formatDuration, ringHTML } from "./shared.js";
import { tomorrowCardHTML } from "./tomorrow.js";
import { postponeLineHTML } from "./postpone.js";
import { postponeIn } from "../postpone.js";
import { minutesOn, entryMinutes } from "../minutes.js";
import * as sw from "../stopwatch.js";

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

// light: "오늘은 가볍게"를 켠 날은 절반을 목표처럼 보여 준다(원래 목표는 옆에 작게)
function goalRowHTML(data, ctx, row, selected, tag = "", auto = null, light = false, incoming = 0) {
  const { goal, done } = row;
  const pre = row.prepaid || 0; // 앞날에 미리 풀어 둔 양으로 채운 몫
  const full = row.target;
  const target = light && full > 0 ? lightTarget(full) : full;
  const carry = carryOf(data, ctx, goal.id);
  const fin = target > 0 && done + pre >= target;
  return `<div class="goal-row${selected ? " selected" : ""}${fin ? " fin" : ""}${tag ? " maint" : ""}" data-action="select-goal" data-id="${goal.id}">
    <div>
      <div class="goal-name"><i class="swatch" style="background:${subjectColor(data, goal.subject)}"></i>${escapeHtml(goal.subject)}<span class="round">${goal.round}${goal.targetRounds ? `/${goal.targetRounds}` : ""}회독</span></div>
      <div class="goal-meta"><span class="unit">${escapeHtml(goal.unit)}</span>${tag ? `<span class="unit maint-tag">${tag}</span>` : ""}${carry ? `<span class="unit carry">이월 ${carry}${escapeHtml(countUnit(goal.unit))}</span>` : ""}${incoming ? `<span class="unit carry">넘겨받음 ${incoming}${escapeHtml(countUnit(goal.unit))}</span>` : ""}${pre ? `<span class="unit auto-tag">미리 품 ${pre}${escapeHtml(countUnit(goal.unit))}</span>` : ""}${auto ? `<span class="unit auto-tag">자동 · 이번 주 ${auto.progress.done}/${auto.progress.quota}</span>` : ""}</div>
      ${auto && auto.last && !fin ? `<div class="goal-rec">이번 주 마지막 공부일 · 못 채우면 다음 주 계획에 자동 반영돼요</div>` : ""}
    </div>
    <div class="goal-count">${target > 0 ? `${done + pre} / ${target}<small>${escapeHtml(countUnit(goal.unit))}${target < full ? ` · 원래 ${full}` : ""}</small>${fin ? " ✓" : ""}` : `${done}<small>${escapeHtml(countUnit(goal.unit))} · 오늘 목표 없음</small>`}</div>
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
       <button type="button" class="step-btn" data-action="days-step" data-id="${goal.id}" data-step="1" aria-label="하루 늘리기"${goal.daysPerWeek >= 7 ? " disabled" : ""}>+</button>
       <button type="button" class="chip-btn${goal.skipWorkout ? " on" : ""}" data-action="toggle-skip-workout" data-id="${goal.id}" aria-pressed="${goal.skipWorkout}">🥊 운동일 빼기</button>`;
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
// 입력 시트의 스톱워치 줄(v97): 이 과목 시계가 없으면 ▶ 시작, 있으면 시간 + ⏸/▶ + ⏹
function stopwatchRowHTML(goal) {
  const cur = sw.state();
  if (!cur || cur.goalId !== goal.id) {
    return `<div class="sw-row"><button class="btn btn-secondary sw-start" data-action="sw-start" data-id="${escapeHtml(goal.id)}" type="button">▶ 스톱워치 시작</button>
      <span class="sw-hint">풀고 나서 추가하면 시간이 같이 기록돼요</span></div>`;
  }
  return `<div class="sw-row on${cur.running ? " running" : ""}">
    <span class="sw-time" data-sw-time>${sw.clock(cur.ms)}</span>
    ${cur.running
      ? '<button class="sw-btn" data-action="sw-pause" type="button" aria-label="일시정지">⏸</button>'
      : '<button class="sw-btn play" data-action="sw-resume" type="button" aria-label="재생">▶</button>'}
    <button class="sw-btn" data-action="sw-pip" type="button" aria-label="작은 창으로 띄우기">⧉</button>
    <button class="sw-btn" data-action="sw-stop" type="button" aria-label="중단">⏹</button>
    <span class="sw-hint">추가하면 이 시간이 붙고 0부터 다시 재요 · ⧉ 작은 창(시험)</span></div>`;
}

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
    ${stopwatchRowHTML(goal)}
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

function yesterdayLineHTML(data, today) {
  const yesterday = addDays(today, -1);
  const sums = new Map();
  data.entries.forEach((e) => e.date === yesterday && sums.set(e.goalId, (sums.get(e.goalId) || 0) + e.amount));
  const items = data.goals
    .filter((g) => (sums.get(g.id) || 0) > 0)
    .map((g) => `<span class="yday-item"><i class="swatch" style="background:${subjectColor(data, g.subject)}"></i>${escapeHtml(g.subject)} ${sums.get(g.id)}${escapeHtml(countUnit(g.unit))}</span>`);
  const kind = { rest: "휴식", review: "복습" }[effectiveKind(data, yesterday)];
  if (!items.length && !kind) return `<div class="yday-line"><b>어제</b> 기록 없음</div>`;
  return `<div class="yday-line"><b>어제</b>${kind && !items.length ? ` ${kind}` : ""}${items.join("")}</div>`;
}

function dayNoticeHTML(data, today, report) {
  const load = dayLoad(data, today, today);
  // 앞날에 미리 풀어 채운 몫은 오늘 할 시간에서 뺀다
  load.minutes -= report.rows.reduce((s, r) => s + Math.min(r.prepaid, r.target) * minutesOn(r.goal, today), 0);
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

// 지친 날용: 과목마다 절반만 목표로 보여 준다. 계획·판정은 그대로라 덜 한 양은 기존 규칙대로 넘어간다
// (자동·채우기 과목은 그 주 안에서 자동 소급, 고정 과목은 다음 날 이월/버림을 묻는다).
function lightHTML(data, report, light) {
  if (report.kind || !report.rows.length) return "";
  if (!light) {
    if (!report.shortfalls.length) return "";
    return `<div class="light-line"><button class="btn btn-secondary btn-sm" data-action="toggle-light" type="button">🪶 오늘은 가볍게</button><span>지친 날엔 절반만 해요</span></div>`;
  }
  const asks = report.rows.some((r) => !weekCarries(data, r.goal));
  return `<div class="notice light">🪶 가볍게 모드 · 과목마다 절반만 채우면 돼요. 덜 한 양은 이번 주 안에 더 풀면 자동으로 갚아져요${asks ? "(고정 목표는 내일 이월할지 물어봐요)" : ""}.
    <button class="btn btn-sm btn-secondary" data-action="toggle-light" type="button">원래대로</button></div>`;
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

// 주간 목표 화면(v87 Codex, v91 다듬음 — 일간 화면 대신 이것만 보인다). 주간 탭 = 전체·과목별 달성률, 오늘 탭 = 과목별 입력.
function weeklyRing(color, pct, size = 60) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const arc = pct > 0 ? `<circle cx="30" cy="30" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(c * Math.min(pct, 100) / 100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 30 30)" />` : "";
  const label = pct >= 100 ? "✓" : `${pct}%`;
  return `<svg class="wk-ring" viewBox="0 0 60 60" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="30" cy="30" r="${r}" fill="none" stroke="var(--gridline)" stroke-width="6" />${arc}
    <text x="30" y="35" text-anchor="middle" font-size="${pct >= 100 ? 20 : 14}" font-weight="700" fill="var(--text-primary)">${label}</text></svg>`;
}

const shortDate = (d) => formatKoreanDate(d);
const hoursText = (min) => (min >= 60 ? `${Math.round(min / 6) / 10}h` : min > 0 ? `${Math.round(min)}m` : "");

// 주간 화면 공통 계산: 과목별로 묶은 목표, 과목 달성률(양수 목표 균등 평균), 전체 달성률(과목 평균, 완주 전 최대 99%)
export function weeklyModel(data, ctx, today) {
  const track = trackAt(data, today);
  const { rings } = weekQuotas(data, ctx, currentWeekIndex(data, today), track);
  const start = weekStartOf(data, today);
  const end = addDays(start, 6);
  const rows = [...rings, ...maintenanceGoals(data, today, today).map((goal) => ({
    goal, quota: 0, done: weekProgress(data, ctx, goal, today).done
  }))];
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.goal.subject)) map.set(row.goal.subject, []);
    map.get(row.goal.subject).push(row);
  }
  let totalFraction = 0;
  let targets = 0;
  let completed = 0;
  const groups = Array.from(map, ([subject, items]) => {
    const required = items.filter((row) => row.quota > 0);
    const fraction = required.reduce((sum, row) => sum + Math.min(1, row.done / row.quota), 0);
    const full = required.length > 0 && required.every((row) => row.done >= row.quota);
    if (required.length) { targets++; totalFraction += fraction / required.length; }
    if (full) completed++;
    const pct = full ? 100 : Math.min(99, Math.floor(100 * fraction / (required.length || 1)));
    return { subject, items, required, full, pct, color: escapeHtml(subjectColor(data, subject)) };
  });
  const won = targets > 0 && targets === completed;
  const overall = won ? 100 : Math.min(99, Math.floor(100 * totalFraction / (targets || 1)));
  const info = data.tracks[track];
  const d = info.examDate ? diffDays(today, info.examDate) : null;
  const dday = d === null ? "" : d > 0 ? `D-${d}` : d === 0 ? "D-DAY" : `D+${-d}`;
  return { track, start, end, rows, groups, won, overall, targets, completed, dday, daysLeft: Math.max(1, diffDays(today, end) + 1) };
}

function beltCelebration(m) {
  if (!m.won) return "";
  const key = "cta-belt-" + m.track + "-" + m.start;
  try {
    if (localStorage.getItem(key)) return "";
    localStorage.setItem(key, "1");
  } catch (e) { return ""; }
  return '<div class="orbit-victory" aria-hidden="true"><img class="belt" src="./icons/champion-belt.svg" alt=""><strong>주간 목표 달성!</strong></div>';
}

// 요일별 실제 공부 시간 막대(v92 주간 탭, v94부터 일간 주간 탭에도). 입력 수량 × 1개당 시간, 과목 색으로 쌓는다.
export function weekStudyBarsHTML(data, ctx, today, start, goals, hint) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const parts = new Map();
    const ids = new Map(goals.map((g) => [g.id, g]));
    for (const e of data.entries) {
      const goal = e.date === date && ids.get(e.goalId);
      if (!goal) continue;
      const min = entryMinutes(goal, e); // v97: 스톱워치 실측이 있으면 그 시간
      if (min > 0) parts.set(goal.subject, (parts.get(goal.subject) || 0) + min);
    }
    const total = [...parts.values()].reduce((a, b) => a + b, 0);
    return { date, parts, total };
  });
  const weekMin = days.reduce((a, d) => a + d.total, 0);
  const peak = Math.max(240, ...days.map((d) => d.total));
  const bars = days.map(({ date, parts, total }) => {
    const label = formatKoreanDate(date).match(/\((.)\)/)[1];
    const future = date > today;
    const stack = [...parts].map(([subject, min]) => `<i style="height:${(100 * min / peak).toFixed(1)}%;background:${escapeHtml(subjectColor(data, subject))}"></i>`).join("");
    return `<div class="wk-day${date === today ? " today" : ""}${future ? " future" : ""}">
      <span class="wk-day-val">${hoursText(total)}</span>
      <div class="wk-day-bar">${stack}</div>
      <span class="wk-day-label">${label}</span></div>`;
  }).join("");
  return `<div class="card">
      <div class="section-header-row"><h2 class="section-title">이번 주 공부 시간</h2><span class="chip">${weekMin ? formatDuration(weekMin) : "아직 기록 없음"}</span></div>
      <div class="wk-days">${bars}</div>
      <p class="hint">${hint}</p>
    </div>`;
}

// 주간 탭(v92): 전체 링 + 요일별 공부 시간(목표 없이 기록만) + 과목별 막대
function renderWeeklyOverview(data, ctx, today, m) {
  const meters = m.groups.filter((g) => g.required.length).map((g) => {
    const detail = g.required.map((row) => `${escapeHtml(g.required.length > 1 ? row.goal.unit.replace(/\(.*\)/, "") + " " : "")}${row.done}/${row.quota}`).join(" · ");
    return `<div class="wk-meter${g.full ? " full" : ""}">
      <div class="wk-meter-head"><span class="wk-name"><i class="swatch" style="background:${g.color}"></i>${escapeHtml(g.subject)}</span>
        <span class="wk-num">${detail}<b>${g.full ? "✓" : g.pct + "%"}</b></span></div>
      <div class="wk-bar" role="progressbar" aria-label="${escapeHtml(g.subject)} 주간 달성률" aria-valuenow="${g.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${g.pct}%;background:${g.color}"></i></div>
    </div>`;
  }).join("");
  return `<section class="view">
    <div class="card wk-hero${m.won ? " won" : ""}">
      <div class="wk-hero-ring">${weeklyRing(m.won ? "#d39b2a" : "var(--accent)", m.overall, 112)}</div>
      <div class="wk-hero-text">
        <span class="wk-hero-range">${TRACK_LABEL[m.track]} · ${shortDate(m.start)} ~ ${shortDate(m.end)}</span>
        <strong>${m.won ? "이번 주 챔피언 🏆" : "이번 주 달성률"}</strong>
        <span>${m.completed} / ${m.targets}과목 달성</span>
        <span class="wk-hero-chips">${m.won ? "" : `<em>${m.daysLeft}일 남음</em>`}${m.dday ? `<em class="dday">${m.dday}</em>` : ""}</span>
      </div>
      ${m.won ? '<img class="belt" src="./icons/champion-belt.svg" alt="CTA 주간 챔피언 벨트">' : ""}
    </div>
    ${beltCelebration(m)}
    ${weekStudyBarsHTML(data, ctx, today, m.start, m.rows.map((row) => row.goal), "하루 목표는 없어요. 한 날만큼 쌓일 뿐이에요.")}
    <div class="card">
      <h2 class="section-title">과목별</h2>
      <div class="wk-meters">${meters || '<p class="hint">이번 주에 설정된 목표가 없어요.</p>'}</div>
      <p class="hint">기록은 오늘 탭에서 과목을 눌러 넣어요.</p>
    </div>
  </section>`;
}

export function renderWeeklyInput(data, ctx, today, ui) {
  const m = weeklyModel(data, ctx, today);
  if (ui.view === "week") return renderWeeklyOverview(data, ctx, today, m);
  const selected = ui.pickerOpen && m.rows.find((row) => row.goal.id === ui.selectedGoalId);
  const cards = m.groups.map(({ subject, items, required, full, pct, color }) => {
    const inputs = items.map(({ goal, quota, done }) => {
      const active = selected && selected.goal.id === goal.id;
      const left = Math.max(0, quota - done);
      return `<button class="wk-input${active ? " selected" : ""}${quota && !left ? " done" : ""}" type="button" data-action="select-goal" data-id="${escapeHtml(goal.id)}">
        <span class="wk-unit">${escapeHtml(goal.unit)}</span>
        <span class="wk-count"><span><b>${done}</b>${quota ? ` / ${quota}` : ""}</span><small>${quota ? (left ? `남은 ${left}` : "완료 ✓") : "자유 기록"}</small></span>
        <span class="wk-plus" aria-hidden="true">＋</span></button>`;
    }).join("");
    return `<article class="wk-card${full ? " full" : ""}">
      ${required.length ? weeklyRing(color, pct) : `<span class="wk-ring-blank" style="background:${color}"></span>`}
      <div class="wk-card-body"><h3>${escapeHtml(subject)}</h3>${inputs}</div></article>`;
  }).join("");
  const banner = `<div class="wk-banner${m.won ? " won" : ""}">
      <div class="wk-banner-top"><span>${TRACK_LABEL[m.track]} · ${shortDate(m.start)} ~ ${shortDate(m.end)}</span>${m.dday ? `<span class="wk-dday">${m.dday}</span>` : ""}</div>
      <h2>${m.won ? "이번 주 챔피언 🏆" : "이번 주 과목별 목표"}</h2>
      <div class="wk-banner-foot"><span role="status">${m.completed} / ${m.targets}과목 달성</span><span>${m.won ? "다음 주도 이렇게!" : `이번 주 ${m.daysLeft}일 남음`}</span></div>
      ${m.won ? '<img class="belt" src="./icons/champion-belt.svg" alt="CTA 주간 챔피언 벨트">' : ""}</div>`;
  return `<section class="view${selected ? " picker-open" : ""}"><div class="card wk">
    ${banner}
    ${beltCelebration(m)}
    <div class="wk-list">${cards || '<p class="hint">이번 주에 설정된 목표가 없어요.</p>'}</div>
    ${selected ? "" : undoLineHTML(data, today)}
    </div>${selected ? pickerSheetHTML(ui.pick, selected.goal, data, today, false) : ""}</section>`;
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
  const incoming = report.kind ? {} : postponeIn(data, today);
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
    return goalRowHTML(data, ctx, rowFor(g), sheetOpen && g.id === selected.id, "", auto, ui.light, incoming[g.id] || 0);
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
      ${ui.editing ? "" : yesterdayLineHTML(data, today)}
      ${ui.editing ? "" : lightHTML(data, report, ui.light)}
      ${ui.editing ? "" : postponeLineHTML(data, ctx, today, report)}
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
