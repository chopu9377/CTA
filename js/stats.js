import { addDays, diffDays, weekdayOf, monthKey, todayStr } from "./dates.js";
import { holidayName } from "./holidays.js";
import { applyBonus, bonusMinutes } from "./bonus.js";
import { autoApplies, autoTargetOn, autoDebts, weekCarries, weekQuota } from "./weekplan.js";
import { layoutOn } from "./layout.js";

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

// 토·일과 공휴일은 주말로 본다(직장인은 공휴일에 쉬는 만큼 더 공부할 수 있는 날).
export function isWeekendLike(dateStr) {
  const day = weekdayOf(dateStr);
  return day === 0 || day === 6 || !!holidayName(dateStr);
}

export function targetOn(goal, dateStr) {
  return isWeekendLike(dateStr) ? goal.weekendTarget : goal.weekdayTarget;
}

// 그날 목표 = 주간 랜덤 배치(layout.js)에서 그날 놓인 양. 자동 목표는 같은 주 이월 몫을 더하고, 보상 휴식만큼 뺀다.
export function computeTargets(data, dateStr, preview = false) {
  if (effectiveKind(data, dateStr)) return {};
  const track = trackAt(data, dateStr);
  const planned = layoutOn(data, track, dateStr);
  const targets = {};
  data.goals.forEach((g) => {
    if (g.archived || g.track !== track) return;
    const amount = autoApplies(data, g, dateStr) ? autoTargetOn(data, g, dateStr, preview) : planned[g.id] || 0;
    if (amount > 0) targets[g.id] = amount;
  });
  return applyBonus(data, dateStr, targets);
}

export function targetsFor(data, dateStr) {
  return data.dayTargets[dateStr] || computeTargets(data, dateStr);
}

// byDate는 그날 활성 트랙의 기록만 센다(유지 모드로 푼 다른 트랙 기록은 달성/미달 판정에 넣지 않기 위해).
// autoDebts: 자동 목표의 주간 소급(부족분별 남은 양). 고정 목표의 이월은 remaining.
export function buildContext(data, today = todayStr()) {
  const sums = new Map();
  const byDate = new Map();
  const goalTrack = new Map(data.goals.map((g) => [g.id, g.track]));
  data.entries.forEach((e) => {
    const key = `${e.goalId}|${e.date}`;
    sums.set(key, (sums.get(key) || 0) + e.amount);
    if (goalTrack.get(e.goalId) === trackAt(data, e.date)) byDate.set(e.date, (byDate.get(e.date) || 0) + e.amount);
  });
  return { sums, byDate, remaining: carryRemaining(data, sums), autoDebts: autoDebts(data, sums, today) };
}

// 그날 목표를 넘겨 푼 양(초과분)이 고정 목표의 이월분을 오래된 순서로 갚는다.
function carryRemaining(data, sums) {
  const remaining = new Map();
  const carriesByGoal = new Map();
  // 옛 버전의 자동 목표 같은 주 이월(redistribute)은 더 이상 쓰지 않는다(자동 목표는 autoDebts로 소급)
  data.carries.forEach((c) => {
    if (c.redistribute) return;
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
  const shortfalls = rows.filter((r) => r.done < r.target).map((r) => {
    const auto = weekCarries(data, r.goal);
    // 이월/버림을 묻는 건 고정 목표만. 자동·채우기 목표는 묻지 않고 그 주 안에서 자동 소급(autoDebts)된다.
    return { goalId: r.goal.id, amount: r.target - r.done, auto, canCarry: !auto };
  });
  const totalDone = ctx.byDate.get(dateStr) || 0;
  const decision = data.settlements[dateStr];
  const bonus = bonusMinutes(data, dateStr);
  const fullBonus = bonus > 0 && !rows.length;

  // 부족분마다: paid(다 갚음) / pending(갚는 중) / unpaid(버렸거나 주가 끝나 흡수됨)
  const shortfallState = (s) => {
    if (s.auto) {
      const debt = ctx.autoDebts.get(`${s.goalId}|${dateStr}`);
      if (!debt) return "unpaid";
      return debt.left <= 0 ? "paid" : debt.open ? "pending" : "unpaid";
    }
    if (!s.canCarry || decision !== "carried") return "unpaid";
    const carry = data.carries.find((c) => c.fromDate === dateStr && c.goalId === s.goalId && !c.redistribute);
    if (!carry) return "unpaid";
    return ctx.remaining.get(carry.id) <= 0 ? "paid" : "pending";
  };

  let status;
  if (dateStr > today) status = kind || (fullBonus ? "bonus" : "future");
  else if (kind) status = kind;
  else if (!rows.length) status = totalDone > 0 ? "full" : fullBonus ? "bonus" : dateStr === today ? "today" : "none";
  else if (!shortfalls.length) status = "full";
  else if (dateStr === today) status = "today";
  else {
    const states = shortfalls.map(shortfallState);
    if (states.every((s) => s === "paid")) status = "carried";
    else if (states.includes("pending")) status = "pending";
    else status = totalDone > 0 ? "partial" : "miss";
  }

  const undecided = dateStr < today && !kind && shortfalls.some((s) => s.canCarry) && decision === undefined;
  return { date: dateStr, kind, status, rows, shortfalls, undecided, totalDone, bonus, holiday: holidayName(dateStr) };
}

const NEUTRAL = ["rest", "review", "none", "bonus"];

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
      const quota = weekQuota(data, ctx.sums, goal, dates);
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

export function exportedLastBackupDays(lastBackupAt) {
  if (!lastBackupAt) return null;
  return Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / 86400000);
}
