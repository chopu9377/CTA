import { addDays, diffDays, weekdayOf, monthKey } from "./dates.js";
import { holidayName } from "./holidays.js";

export function trackAt(data, dateStr) {
  let track = 2;
  data.trackSwitches.forEach((s) => {
    if (s.from <= dateStr) track = s.track;
  });
  return track;
}

// 휴식/복습으로 지정한 날(또는 "공휴일 자동 휴식" 옵션이 켜진 공휴일)은 그날 목표가 없다.
export function effectiveKind(data, dateStr) {
  const kind = data.dayKinds[dateStr];
  if (kind) return kind;
  if (data.settings.holidayAutoRest && holidayName(dateStr)) return "rest";
  return null;
}

export function computeTargets(data, dateStr) {
  if (effectiveKind(data, dateStr)) return {};
  const track = trackAt(data, dateStr);
  const weekday = weekdayOf(dateStr);
  const targets = {};
  data.goals.forEach((g) => {
    if (g.archived || g.track !== track || g.dailyTarget <= 0 || !g.weekdays.includes(weekday)) return;
    targets[g.id] = g.dailyTarget;
  });
  return targets;
}

export function targetsFor(data, dateStr) {
  return data.dayTargets[dateStr] || computeTargets(data, dateStr);
}

export function buildContext(data) {
  const sums = new Map();
  const byDate = new Map();
  data.entries.forEach((e) => {
    const key = `${e.goalId}|${e.date}`;
    sums.set(key, (sums.get(key) || 0) + e.amount);
    byDate.set(e.date, (byDate.get(e.date) || 0) + e.amount);
  });
  return { sums, byDate, remaining: carryRemaining(data, sums) };
}

// 그날 목표를 넘겨 푼 양(초과분)이 이월분을 오래된 순서로 갚는다.
function carryRemaining(data, sums) {
  const remaining = new Map();
  const carriesByGoal = new Map();
  data.carries.forEach((c) => {
    remaining.set(c.id, c.amount);
    if (!carriesByGoal.has(c.goalId)) carriesByGoal.set(c.goalId, []);
    carriesByGoal.get(c.goalId).push(c);
  });

  const excessByGoal = new Map();
  sums.forEach((done, key) => {
    const [goalId, date] = key.split("|");
    if (!carriesByGoal.has(goalId)) return;
    const excess = done - (targetsFor(data, date)[goalId] || 0);
    if (excess <= 0) return;
    if (!excessByGoal.has(goalId)) excessByGoal.set(goalId, []);
    excessByGoal.get(goalId).push({ date, excess });
  });

  carriesByGoal.forEach((carries, goalId) => {
    carries.sort((a, b) => a.fromDate.localeCompare(b.fromDate));
    (excessByGoal.get(goalId) || [])
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((ex) => {
        let pool = ex.excess;
        carries.forEach((c) => {
          if (pool <= 0 || c.fromDate >= ex.date) return;
          const pay = Math.min(pool, remaining.get(c.id));
          remaining.set(c.id, remaining.get(c.id) - pay);
          pool -= pay;
        });
      });
  });
  return remaining;
}

export function dayReport(data, ctx, dateStr, today) {
  const kind = effectiveKind(data, dateStr);
  const targets = targetsFor(data, dateStr);
  const rows = Object.keys(targets).map((goalId) => ({
    goal: data.goals.find((g) => g.id === goalId),
    target: targets[goalId],
    done: ctx.sums.get(`${goalId}|${dateStr}`) || 0
  })).filter((r) => r.goal);
  const shortfalls = rows.filter((r) => r.done < r.target).map((r) => ({ goalId: r.goal.id, amount: r.target - r.done }));
  const totalDone = ctx.byDate.get(dateStr) || 0;
  const decision = data.settlements[dateStr];

  let status;
  if (dateStr > today) status = kind || "future";
  else if (kind) status = kind;
  else if (!rows.length) status = totalDone > 0 ? "full" : dateStr === today ? "today" : "none";
  else if (!shortfalls.length) status = "full";
  else if (dateStr === today) status = "today";
  else if (decision === "carried") {
    const paid = data.carries.filter((c) => c.fromDate === dateStr).every((c) => ctx.remaining.get(c.id) <= 0);
    status = paid ? "carried" : "pending";
  } else status = totalDone > 0 ? "partial" : "miss";

  const undecided = dateStr < today && !kind && shortfalls.length > 0 && decision === undefined;
  return { date: dateStr, kind, status, rows, shortfalls, undecided, totalDone, holiday: holidayName(dateStr) };
}

const NEUTRAL = ["rest", "review", "none"];

export function weekReport(data, ctx, weekIndex, today) {
  const start = addDays(data.startDate, weekIndex * 7);
  const days = Array.from({ length: 7 }, (_, i) => dayReport(data, ctx, addDays(start, i), today));
  const active = days.filter((d) => !NEUTRAL.includes(d.status) && d.status !== "future");
  const ok = days.filter((d) => d.status === "full" || d.status === "carried").length;
  const pending = days.filter((d) => d.status === "pending").length;
  const blocked = days.some((d) => ["today", "future", "pending", "partial", "miss"].includes(d.status));
  return { index: weekIndex, start, end: addDays(start, 6), days, ok, activeCount: active.length, pending, complete: ok > 0 && !blocked };
}

export function currentWeekIndex(data, today) {
  return Math.max(0, Math.floor(diffDays(data.startDate, today) / 7));
}

export function weekQuotas(data, ctx, weekIndex, track) {
  const start = addDays(data.startDate, weekIndex * 7);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const rings = data.goals
    .filter((g) => !g.archived && g.track === track)
    .map((goal) => {
      const quota = dates.reduce((sum, d) => sum + (targetsFor(data, d)[goal.id] || 0), 0);
      const done = dates.reduce((sum, d) => sum + (ctx.sums.get(`${goal.id}|${d}`) || 0), 0);
      return { goal, quota, done, pct: quota > 0 ? Math.min(100, (done / quota) * 100) : 0 };
    });
  const counted = rings.filter((r) => r.quota > 0);
  const overall = counted.length ? Math.round(counted.reduce((s, r) => s + r.pct, 0) / counted.length) : 0;
  const workdays = dates.filter((d) => !effectiveKind(data, d)).length;
  const rest = dates.filter((d) => effectiveKind(data, d) === "rest").length;
  const review = dates.filter((d) => effectiveKind(data, d) === "review").length;
  return { rings, overall, workdays, rest, review };
}

export function pendingSettlements(data, ctx, today) {
  const days = [];
  for (let d = data.startDate; d < today; d = addDays(d, 1)) {
    const report = dayReport(data, ctx, d, today);
    if (report.undecided) days.push(report);
  }
  return days;
}

export function historyEnd(data, today) {
  const dates = [1, 2].map((t) => data.tracks[t].examDate).filter(Boolean);
  const last = dates.length ? dates.sort().pop() : addDays(today, 84);
  return last > today ? last : today;
}

export function monthGroups(data, ctx, today) {
  const end = historyEnd(data, today);
  const weekCount = Math.ceil((diffDays(data.startDate, end) + 1) / 7);
  const groups = [];
  for (let w = 0; w < weekCount; w++) {
    const week = weekReport(data, ctx, w, today);
    const key = monthKey(week.start);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, weeks: [], ok: 0, active: 0 };
      groups.push(group);
    }
    group.weeks.push(week);
    group.ok += week.ok;
    group.active += week.activeCount;
  }
  return groups;
}

export function daysUntil(dateStr, today) {
  return dateStr ? diffDays(today, dateStr) : null;
}

export function studyDaysBetween(data, fromStr, toStr) {
  let count = 0;
  for (let d = fromStr; d <= toStr; d = addDays(d, 1)) if (!effectiveKind(data, d)) count++;
  return count;
}

function cumulativeOf(goal) {
  return (goal.round - 1) * goal.total + goal.progress;
}

// 목표 회독까지 남은 분량. 목표 회독이 없으면 현재 회독의 남은 분량.
function workLeft(goal) {
  if (goal.total <= 0) return null;
  if (goal.targetRounds > 0) return Math.max(0, goal.targetRounds * goal.total - cumulativeOf(goal));
  return goal.total - goal.progress;
}

// 권장 하루량 = 남은 분량 ÷ 시험일까지 남은 공부일수(휴식·복습일과 이 목표의 쉬는 요일 제외).
export function paceFor(data, goal, today) {
  const info = data.tracks[goal.track];
  if (!info.examDate || goal.total <= 0 || goal.targetRounds <= 0) return null;
  const from = goal.track === 1 && info.activeFrom && info.activeFrom > today ? info.activeFrom : today;
  let days = 0;
  for (let d = from; d < info.examDate; d = addDays(d, 1)) {
    if (!effectiveKind(data, d) && goal.weekdays.includes(weekdayOf(d))) days++;
  }
  const left = workLeft(goal);
  if (!days || left <= 0) return { left, days, perDay: left <= 0 ? 0 : null, perWeek: null };
  const perDay = Math.ceil(left / days);
  return { left, days, perDay, perWeek: perDay * goal.weekdays.length };
}

export function focusRows(data, track, today) {
  const info = data.tracks[track];
  const from = info.activeFrom && info.activeFrom > today ? info.activeFrom : today;
  const days = info.examDate ? Math.max(1, studyDaysBetween(data, from, info.examDate)) : null;
  const rows = data.goals
    .filter((g) => !g.archived && g.track === track)
    .map((goal) => {
      const remaining = workLeft(goal);
      return { goal, remaining, perDay: remaining !== null && days ? remaining / days : null };
    });
  return { rows, days, from };
}

export function exportedLastBackupDays(lastBackupAt) {
  if (!lastBackupAt) return null;
  return Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / 86400000);
}
