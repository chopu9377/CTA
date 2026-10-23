import { addDays, formatKoreanDate } from "../dates.js";
import { targetsFor, computeTargets, effectiveKind } from "../stats.js";
import { limitMinutes, maintenanceTargets } from "../plan.js";
import { weekStartOf } from "../weekplan.js";
import { escapeHtml, subjectColor } from "./shared.js";

// 주간 탭: 요일별 계획 시간·실제 공부 시간·공부 가능 시간. 이번 주 / 다음 주(지금 진도 기준 예상).
// 저장 값 없이 그날 목표 × 1개당 소요 시간으로 계산한다.

const hm = (min) => {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

function minutesOf(data, targets) {
  return Object.entries(targets).reduce((sum, [id, n]) => {
    const goal = data.goals.find((g) => g.id === id);
    return sum + (goal ? n * goal.minutesPerUnit : 0);
  }, 0);
}

// 과목 약자: 첫 글자([재]). 같은 트랙에서 첫 글자가 겹치는 다른 과목이면 두 글자(재무/재정),
// 같은 과목이 단위만 다르면 단위 첫 글자를 붙인다(세법학 인강·문제 → 세인/세연).
export function shortNames(goals) {
  const out = new Map();
  goals.forEach((g) => {
    const rivals = goals.filter((x) => x.id !== g.id && x.track === g.track);
    let name = g.subject.slice(0, 1);
    if (rivals.some((x) => x.subject !== g.subject && x.subject.slice(0, 1) === name)) name = g.subject.slice(0, 2);
    if (rivals.some((x) => x.subject === g.subject)) name += g.unit.slice(0, 1);
    out.set(g.id, name);
  });
  return out;
}

function dayRow(data, ctx, d, today) {
  const kind = effectiveKind(data, d);
  const targets = { ...(d <= today ? targetsFor(data, d) : computeTargets(data, d, true)), ...maintenanceTargets(data, d, today) };
  // 오늘·앞날은 미리 풀어 둔 양으로 채워진 몫을 빼고 남은 계획만 보여 준다
  if (d >= today) {
    Object.keys(targets).forEach((id) => {
      const left = targets[id] - (ctx.prepaid?.get(`${id}|${d}`) || 0);
      if (left > 0) targets[id] = left;
      else delete targets[id];
    });
  }
  const done = d <= today ? data.goals.reduce((s, g) => s + (ctx.sums.get(`${g.id}|${d}`) || 0) * g.minutesPerUnit, 0) : 0;
  return { date: d, kind, targets: kind ? {} : targets, plan: kind ? 0 : minutesOf(data, targets), done, limit: kind ? 0 : limitMinutes(data, d) };
}

export function weekHoursRows(data, ctx, today, which = "this") {
  const start = addDays(weekStartOf(data, today), which === "next" ? 7 : 0);
  return Array.from({ length: 7 }, (_, i) => dayRow(data, ctx, addDays(start, i), today));
}

export function weekHoursHTML(data, ctx, today, ui) {
  const which = ui.weekHours === "next" ? "next" : "this";
  const rows = weekHoursRows(data, ctx, today, which);
  const scale = Math.max(60, ...rows.map((r) => Math.max(r.plan, r.done, r.limit)));
  const pct = (m) => `${Math.min(100, (m / scale) * 100).toFixed(1)}%`;
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const names = shortNames(data.goals.filter((g) => !g.archived));
  // 그날 과목별 양: [재] 3 [법] 2 (과목 순서는 목표 목록 순)
  const subjects = (targets) => data.goals
    .filter((g) => targets[g.id] > 0 && names.has(g.id))
    .map((g) => `<span class="wh-sub"><b style="color:${subjectColor(data, g.subject)}">${escapeHtml(names.get(g.id))}</b>${targets[g.id]}</span>`)
    .join("");
  const body = rows
    .map((r) => {
      const label = formatKoreanDate(r.date).replace(/^\d+\//, "");
      const isToday = r.date === today;
      const over = r.plan > r.limit && r.limit > 0;
      if (r.kind && !r.done) {
        return `<div class="wh-row${isToday ? " today" : ""}"><span class="wh-day">${label}</span><span class="wh-rest">${r.kind === "rest" ? "휴식" : "복습"}</span><span class="wh-num"></span></div>`;
      }
      const num = which === "next" || r.date > today
        ? `${hm(r.plan)}${over ? " ⚠️" : ""}`
        : `<b>${hm(r.done)}</b> / ${hm(r.plan)}${over ? " ⚠️" : ""}`;
      return `<div class="wh-row${isToday ? " today" : ""}${over ? " over" : ""}">
        <span class="wh-day">${label}</span>
        <span class="wh-bar">
          <i class="wh-limit" style="width:${pct(r.limit)}"></i>
          <i class="wh-plan" style="width:${pct(r.plan)}"></i>
          <i class="wh-done" style="width:${pct(r.done)}"></i>
        </span>
        <span class="wh-num">${num}</span>
        ${Object.keys(r.targets).length ? `<span class="wh-subs">${subjects(r.targets)}</span>` : ""}
      </div>`;
    })
    .join("");
  const total = which === "next"
    ? `예상 <b>${hm(sum("plan"))}</b> · 공부 가능 ${hm(sum("limit"))}`
    : `한 시간 <b>${hm(sum("done"))}</b> / 계획 ${hm(sum("plan"))} · 공부 가능 ${hm(sum("limit"))}`;
  const tabs = [["this", "이번 주"], ["next", "다음 주"]]
    .map(([k, t]) => `<button type="button" class="${k === which ? "on" : ""}" data-action="week-hours" data-which="${k}">${t}</button>`)
    .join("");
  const hint = which === "next"
    ? "지금 진도 기준 예상이에요. 이번 주에 더 풀거나 덜 풀면 바뀌고, 그 주가 시작될 때 정해져요."
    : "진한 막대는 실제로 한 시간, 연한 막대는 계획, 회색은 공부 가능 시간이에요. ⚠️는 계획이 공부 가능 시간보다 많은 날이에요.";
  return `<div class="card">
    <div class="section-header-row"><h2 class="section-title">공부 시간</h2><div class="seg seg-sm">${tabs}</div></div>
    <div class="wh-list">${body}</div>
    <div class="wh-total">${total}</div>
    <p class="hint">${escapeHtml(hint)}</p>
  </div>`;
}
