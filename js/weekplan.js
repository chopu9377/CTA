import { addDays, diffDays, weekdayOf, todayStr } from "./dates.js";
import { effectiveKind, isWeekendLike, targetsFor } from "./stats.js";
import { dataVersion } from "./version.js";
import { paceFor, paceMissing, studiesTrackOn, workLeft, cumulativeOf, limitMinutes, maintenanceTargets } from "./plan.js";

// 주간 자동 역산(미리보기). 하루 목표를 먼저 올림하지 않고 "이번 주 필요량"을 소수점까지 구한 뒤 정수로 나눈다.
// 저장하는 값은 없다: 주 시작 시점 진도 = 현재 누적 - 그 주에 입력한 기록 으로 매번 같은 계획을 다시 만든다
// (같은 데이터면 폰과 웹의 결과가 같고 동기화 충돌이 생기지 않는다).

export const STATUS_RULES = {
  onTrackDays: 7, // 예상 완료가 마감일 +7일 이내면 정상
  lateDays: 21, // +21일 이내면 약간 밀림, 그보다 늦으면 위험
  aheadDays: 28, // 마감보다 4주 넘게 빠르면 "목표를 줄여도 됨"
  windowDays: 28, // 실제 페이스는 최근 4주 기록으로 본다
  minObservedDays: 14, // 앱을 쓴 지 2주가 안 됐으면 실제 페이스를 추정하지 않는다
  horizonDays: 800 // 실제 페이스로 완료일을 찾는 최대 기간
};

function weekendRatio(data) {
  const { weekdayHours, weekendHours } = data.settings;
  return weekdayHours > 0 && weekendHours > 0 ? weekendHours / weekdayHours : 1;
}

function entriesOf(data, goalId, from, to) {
  return data.entries
    .filter((e) => e.goalId === goalId && e.date >= from && (to === undefined || e.date < to))
    .reduce((sum, e) => sum + e.amount, 0);
}

export function weekStartOf(data, dateStr) {
  const index = Math.max(0, Math.floor(diffDays(data.startDate, dateStr) / 7));
  return addDays(data.startDate, index * 7);
}

// 이번 주(1차가 아직 시작 전이면 집중이 시작되는 주)의 시작일
function planBasis(data, goal, today) {
  const info = data.tracks[goal.track];
  const upcoming = goal.track === 1 && !!info.activeFrom && info.activeFrom > today;
  const weekStart = weekStartOf(data, upcoming ? info.activeFrom : today);
  return { upcoming, weekStart, weekEnd: addDays(weekStart, 7) };
}

// paceFor와 같은 규칙: 휴식·복습일과 그 목표의 쉬는 요일은 뺀다. 다른 트랙 집중 기간은 공부일이 아니고,
// 유지 모드가 켜져 있으면 그날 유지량을 진도로 인정(credit)한다.
function collectDays(data, goal, from, end, today) {
  const info = data.tracks[goal.track];
  const ratio = weekendRatio(data);
  const days = [];
  let credit = 0;
  for (let d = from; d < end; d = addDays(d, 1)) {
    if (effectiveKind(data, d) || !goal.weekdays.includes(weekdayOf(d))) continue;
    if (!studiesTrackOn(data, goal.track, d, today)) {
      if (info.maintain) credit += isWeekendLike(d) ? goal.maintWeekendTarget : goal.maintWeekdayTarget;
    } else {
      days.push({ date: d, dow: weekdayOf(d), w: isWeekendLike(d) ? ratio : 1 });
    }
  }
  return { days, credit };
}

// 최대잔여법: 가중치대로 소수 몫을 구하고 내림한 뒤 남은 개수를 소수 부분이 큰 날부터 1개씩 준다(같으면 이른 날).
export function distribute(total, days) {
  const sumW = days.reduce((s, d) => s + d.w, 0);
  if (!days.length || total <= 0 || sumW <= 0) return days.map(() => 0);
  const quotas = days.map((d) => (total * d.w) / sumW);
  const amounts = quotas.map(Math.floor);
  const rest = total - amounts.reduce((a, b) => a + b, 0);
  quotas
    .map((q, i) => ({ i, frac: q - amounts[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
    .slice(0, rest)
    .forEach(({ i }) => amounts[i]++);
  return amounts;
}

// 매주 시작 시점에 남은 분량과 남은 공부일 가중치로 그 주 필요량을 다시 구하는 과정을 끝까지 돌려 본다.
function runPlan(days, left0, weekStart) {
  const groups = new Map();
  days.forEach((d) => {
    const key = Math.floor(diffDays(weekStart, d.date) / 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  });
  let weightLeft = days.reduce((s, d) => s + d.w, 0);
  let left = left0;
  const weeks = [];
  let finish = null;
  for (const key of [...groups.keys()].sort((a, b) => a - b)) {
    const weekDays = groups.get(key);
    const weight = weekDays.reduce((s, d) => s + d.w, 0);
    const need = weightLeft > 0 ? (left * weight) / weightLeft : 0;
    const total = Math.min(left, Math.round(need));
    const amounts = distribute(total, weekDays);
    weeks.push({ key, days: weekDays, need, total, amounts });
    left -= total;
    weightLeft -= weight;
    if (left <= 0) {
      const last = amounts.map((a, i) => (a > 0 ? i : -1)).filter((i) => i >= 0).pop();
      finish = weekDays[last === undefined ? weekDays.length - 1 : last].date;
      break;
    }
  }
  return { weeks, finish };
}

// 한 주의 계획. 주 시작 시점(자동 모드를 켠 주는 켠 날)의 진도로 계산하므로 그 주 안에서는 기록이 쌓여도 바뀌지 않는다.
function buildWeek(data, goal, weekStart, today) {
  const info = data.tracks[goal.track];
  const endDate = addDays(info.examDate, -data.settings.bufferDays);
  const auto = goal.planMode === "auto" && !!goal.autoFrom;
  const planStart = auto ? [goal.autoFrom, goal.replanFrom].filter(Boolean).sort().pop() : null;
  const effStart = planStart && planStart > weekStart ? planStart : weekStart;
  const upcoming = goal.track === 1 && !!info.activeFrom && info.activeFrom > today;
  const calcFrom = upcoming && info.activeFrom > effStart ? info.activeFrom : effStart;
  const cumulativeAtStart = cumulativeOf(goal) - entriesOf(data, goal.id, effStart);
  const rawLeftAtStart = Math.max(0, goal.targetRounds * goal.total - cumulativeAtStart);
  const { days, credit } = collectDays(data, goal, calcFrom, endDate, today);
  const left0 = Math.max(0, rawLeftAtStart - credit);
  const plan = runPlan(days, left0, weekStart);
  const thisWeek = plan.weeks.find((w) => w.key === 0) || { days: [], need: 0, total: 0, amounts: [] };
  const amountByDate = new Map(thisWeek.days.map((d, i) => [d.date, thisWeek.amounts[i]]));
  return { weekStart, effStart, endDate, rawLeftAtStart, credit, left0, plan, thisWeek, amountByDate };
}

// 저장 데이터가 바뀔 때마다(version.js) 비운다. 화면을 그릴 때 같은 주 계획을 여러 번 묻기 때문에 필요하다.
const weekCache = new Map();
let cachedVersion = -1;

function getWeek(data, goal, weekStart, today) {
  const version = dataVersion();
  if (version !== cachedVersion) {
    weekCache.clear();
    cachedVersion = version;
  }
  const key = `${goal.id}|${weekStart}|${today}`;
  if (!weekCache.has(key)) weekCache.set(key, buildWeek(data, goal, weekStart, today));
  return weekCache.get(key);
}

// ---- 자동 계획 목표(planMode "auto") ----

// 자동 모드이면서 계획에 필요한 입력(시험일·총 분량·목표 회독)이 다 있을 때만 자동으로 동작한다. 아니면 고정 목표를 쓴다.
export function isAutoGoal(data, goal) {
  return goal.planMode === "auto" && !!goal.autoFrom && !paceMissing(data, goal).length;
}

// 그 주 계획에서 이월(redistribute) 몫이 얹히는 날: 미달 다음 날부터, 이월을 정한 날(atDate) 이후의 남은 공부일
function carryDays(week, c) {
  return week.thisWeek.days.filter((d) => d.date > c.fromDate && d.date >= (c.atDate || c.fromDate));
}

function carryShare(data, goal, week, dateStr) {
  let sum = 0;
  data.carries.forEach((c) => {
    // 새 출발(effStart) 이전 날의 이월은 새 계획의 남은 분량에 이미 들어 있으므로 다시 얹지 않는다
    if (c.goalId !== goal.id || !c.redistribute || weekStartOf(data, c.fromDate) !== week.weekStart || c.fromDate < week.effStart) return;
    const days = carryDays(week, c);
    const index = days.findIndex((d) => d.date === dateStr);
    if (index >= 0) sum += distribute(c.amount, days)[index];
  });
  return sum;
}

// 자동 목표의 그날 목표 = 그 주 계획 + 같은 주 이월 몫. 아직 시작 안 한 주는 계획이 없다(그 주가 시작될 때 정해진다).
// preview: 아직 시작 안 한 주도 "지금 진도 기준 예상"으로 계산한다(내일 미리보기용, 그 주가 시작되면 달라질 수 있다).
export function autoTargetOn(data, goal, dateStr, preview = false) {
  const today = todayStr();
  const weekStart = weekStartOf(data, dateStr);
  if (!preview && weekStart > weekStartOf(data, today)) return 0;
  const week = getWeek(data, goal, weekStart, today);
  return (week.amountByDate.get(dateStr) || 0) + carryShare(data, goal, week, dateStr);
}

// fromDate의 미달분 amount를 이월한다면 dateStr에 얹힐 양(같은 주 남은 공부일에 나눠 얹는 자동 계획 이월 기준)
export function carryPreview(data, goal, amount, fromDate, dateStr, today) {
  const week = getWeek(data, goal, weekStartOf(data, fromDate), today);
  const days = week.thisWeek.days.filter((d) => d.date > fromDate);
  const index = days.findIndex((d) => d.date === dateStr);
  return index >= 0 ? distribute(amount, days)[index] : 0;
}

export function autoApplies(data, goal, dateStr) {
  return isAutoGoal(data, goal) && dateStr >= goal.autoFrom;
}

// 그날 미달분을 같은 주 안에서 다시 나눌 수 있는가(오늘 포함 남은 공부일이 있는가)
export function canRedistribute(data, goal, fromDate, today) {
  const week = getWeek(data, goal, weekStartOf(data, fromDate), today);
  return fromDate >= week.effStart && week.thisWeek.days.some((d) => d.date > fromDate && d.date >= today);
}

// 이월해서 나눠 얹은 양을 그 몫이 붙은 날들에서 다 채웠는지
export function redistributionState(data, sums, carry, today) {
  const goal = data.goals.find((g) => g.id === carry.goalId);
  if (!goal) return "expired";
  const days = carryDays(getWeek(data, goal, weekStartOf(data, carry.fromDate), today), carry);
  if (!days.length) return "expired";
  let done = 0;
  let target = 0;
  days.forEach((d) => {
    done += sums.get(`${goal.id}|${d.date}`) || 0;
    target += targetsFor(data, d.date)[goal.id] || 0;
  });
  if (done >= target) return "paid";
  return days[days.length - 1].date < today ? "expired" : "pending";
}

// 오늘이 이번 주 그 과목의 마지막 공부일인가(못 채우면 다음 주 계획에 자동 반영된다)
export function isLastStudyDay(data, goal, today) {
  const week = getWeek(data, goal, weekStartOf(data, today), today);
  const dates = week.thisWeek.days.map((d) => d.date);
  return dates.includes(today) && dates[dates.length - 1] === today;
}

// 이월해서 다른 날로 옮긴 양(그 날짜들의 원래 목표에는 남아 있으므로 주간 목표에서 뺀다)
export function movedOut(data, goalId, dates) {
  const goal = data.goals.find((g) => g.id === goalId);
  if (!goal || !isAutoGoal(data, goal)) return 0;
  return data.carries
    .filter((c) => c.redistribute && c.goalId === goalId && dates.includes(c.fromDate))
    .reduce((sum, c) => sum + c.amount, 0);
}

// 그 주 목표량. 자동 목표가 주 중간에 새 출발(replan)했다면 그 이전 날은 실제 한 양으로 확정하고, 이후는 새 계획의 목표를 쓴다
// (이전 날에 못 한 양은 새 계획의 남은 분량에 이미 들어 있어서 목표에 두 번 세면 안 된다).
export function weekQuota(data, sums, goal, dates) {
  const today = todayStr();
  let from = dates[0];
  if (isAutoGoal(data, goal) && weekStartOf(data, from) <= weekStartOf(data, today)) {
    const effStart = getWeek(data, goal, weekStartOf(data, from), today).effStart;
    if (effStart > from) from = effStart;
  }
  const sumOf = (d) => sums.get(`${goal.id}|${d}`) || 0;
  const before = dates.filter((d) => d < from).reduce((s, d) => s + sumOf(d), 0);
  const rest = dates.filter((d) => d >= from);
  return before + rest.reduce((s, d) => s + (targetsFor(data, d)[goal.id] || 0), 0) - movedOut(data, goal.id, rest);
}

// 이번 주 현재/주간 목표
export function weekProgress(data, ctx, goal, today) {
  const start = weekStartOf(data, today);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const done = dates.reduce((sum, d) => sum + (ctx.sums.get(`${goal.id}|${d}`) || 0), 0);
  return { quota: weekQuota(data, ctx.sums, goal, dates), done };
}

// 지난주(자동 계획으로 통째로 돌던 주)에 못 채운 양. 새 주 계획에 이미 들어 있다는 안내에 쓴다. 주 초반에만 돌려준다.
export function absorbedShortfalls(data, ctx, today) {
  const start = weekStartOf(data, today);
  if (diffDays(start, today) >= 3) return [];
  const prev = addDays(start, -7);
  const list = [];
  data.goals.forEach((goal) => {
    if (goal.archived || !isAutoGoal(data, goal) || goal.autoFrom > prev) return;
    const dates = Array.from({ length: 7 }, (_, i) => addDays(prev, i));
    const planned = weekQuota(data, ctx.sums, goal, dates);
    const done = dates.reduce((sum, d) => sum + (ctx.sums.get(`${goal.id}|${d}`) || 0), 0);
    if (planned > done) list.push({ goal, amount: planned - done });
  });
  return list;
}

// 최근 실제 기록으로 본 페이스와 그 속도가 계속될 때의 완료 예정일
function actualPace(data, goal, today, upcoming) {
  if (upcoming) return { state: "upcoming" };
  const { windowDays, minObservedDays, horizonDays } = STATUS_RULES;
  const earliest = addDays(today, -windowDays);
  const windowStart = data.startDate > earliest ? data.startDate : earliest;
  const observed = diffDays(windowStart, today);
  if (observed < minObservedDays) return { state: "insufficient", observed };

  const info = data.tracks[goal.track];
  const ratio = weekendRatio(data);
  let weight = 0;
  for (let d = windowStart; d < today; d = addDays(d, 1)) {
    if (effectiveKind(data, d) || !goal.weekdays.includes(weekdayOf(d)) || !studiesTrackOn(data, goal.track, d, today)) continue;
    weight += isWeekendLike(d) ? ratio : 1;
  }
  if (weight <= 0) return { state: "insufficient", observed };

  const rate = entriesOf(data, goal.id, windowStart, today) / weight;
  let left = workLeft(goal);
  let projected = null;
  for (let i = 1; i <= horizonDays && left > 0; i++) {
    const d = addDays(today, i);
    if (effectiveKind(data, d) || !goal.weekdays.includes(weekdayOf(d))) continue;
    if (!studiesTrackOn(data, goal.track, d, today)) {
      if (info.maintain) left -= isWeekendLike(d) ? goal.maintWeekendTarget : goal.maintWeekdayTarget;
    } else {
      left -= rate * (isWeekendLike(d) ? ratio : 1);
    }
    if (left <= 0) projected = d;
  }
  return { state: "ok", rate, projected, observed, windowStart };
}

function judge({ finished, covered, noDays, impossible, actual, plannedFinish, endDate }) {
  if (finished) return { level: "done", basis: "none" };
  if (covered) return { level: "ok", basis: "plan" };
  if (noDays || impossible) return { level: "danger", basis: "none" };
  const rules = STATUS_RULES;
  if (actual.state === "ok") {
    if (!actual.projected) return { level: "danger", basis: "actual" };
    const diff = diffDays(endDate, actual.projected);
    const level = diff > rules.lateDays ? "danger" : diff > rules.onTrackDays ? "late" : diff < -rules.aheadDays ? "ahead" : "ok";
    return { level, basis: "actual" };
  }
  const diff = plannedFinish ? diffDays(endDate, plannedFinish) : rules.lateDays + 1;
  return { level: diff > rules.lateDays ? "danger" : diff > rules.onTrackDays ? "late" : "ok", basis: "plan" };
}

// 설정의 "권장량 도출" 미리보기용. 입력이 빠진 목표는 null.
export function planPreview(data, goal, today) {
  if (paceMissing(data, goal).length) return null;
  const info = data.tracks[goal.track];
  const basis = planBasis(data, goal, today);
  const week = getWeek(data, goal, basis.weekStart, today);
  const { endDate, rawLeftAtStart, credit, left0, plan, thisWeek } = week;
  const covered = left0 <= 0 && rawLeftAtStart > 0;
  const plannedFinish = left0 > 0 ? plan.finish : null;

  // 지금부터 남은 공부 시간으로 물리적으로 끝낼 수 있는가(이 목표만 따로 본 필요조건)
  const anchor = basis.upcoming ? info.activeFrom : today;
  const now = collectDays(data, goal, anchor, endDate, today);
  const rawLeftNow = workLeft(goal);
  const leftNow = Math.max(0, rawLeftNow - now.credit);
  const capacityMin = now.days.reduce((sum, d) => sum + limitMinutes(data, d.date), 0);
  const impossible = leftNow * goal.minutesPerUnit > capacityMin;

  const actual = actualPace(data, goal, today, basis.upcoming);
  const status = judge({ finished: rawLeftNow <= 0, covered, noDays: leftNow > 0 && !now.days.length, impossible, actual, plannedFinish, endDate });

  return {
    weekStart: basis.weekStart,
    upcoming: basis.upcoming,
    endDate,
    rawLeftNow,
    leftNow,
    credit,
    left0,
    weekNeed: thisWeek.need,
    weekTotal: thisWeek.total,
    weekDays: thisWeek.days.map((d, i) => ({ date: d.date, dow: d.dow, amount: thisWeek.amounts[i] })),
    doneThisWeek: entriesOf(data, goal.id, basis.weekStart, basis.weekEnd),
    plannedFinish,
    covered,
    actual,
    status,
    impossible,
    needMin: leftNow * goal.minutesPerUnit,
    capacityMin
  };
}

// 트랙 전체: 남은 분량 × 1개당 소요 시간 vs 마감일까지 남은 실제 공부 가능 시간(휴식·복습일, 다른 트랙 집중 기간,
// 이 트랙이 공부하는 날의 다른 트랙 유지 시간은 뺀다).
export function trackFeasibility(data, track, today) {
  const info = data.tracks[track];
  if (!info.examDate) return null;
  const goals = data.goals.filter((g) => !g.archived && g.track === track);
  const from = track === 1 && info.activeFrom && info.activeFrom > today ? info.activeFrom : today;
  const end = addDays(info.examDate, -data.settings.bufferDays);
  let needMin = 0;
  let counted = 0;
  goals.forEach((g) => {
    const pace = paceFor(data, g, today);
    if (!pace) return;
    needMin += pace.left * g.minutesPerUnit;
    counted++;
  });
  let availMin = 0;
  for (let d = from; d < end; d = addDays(d, 1)) {
    if (effectiveKind(data, d) || !studiesTrackOn(data, track, d, today)) continue;
    const maint = maintenanceTargets(data, d, today);
    const used = Object.keys(maint).reduce((sum, id) => {
      const g = data.goals.find((x) => x.id === id);
      return sum + (g ? maint[id] * g.minutesPerUnit : 0);
    }, 0);
    availMin += Math.max(0, limitMinutes(data, d) - used);
  }
  return { needMin, availMin, ratio: availMin > 0 ? needMin / availMin : null, counted, total: goals.length, from, end };
}

// 이번 주(1차가 아직 시작 전이면 집중이 시작되는 주) 계획의 날짜별 예상 공부 시간과 공부 가능 시간.
// 계획을 계산할 수 있는 과목은 그 주 배분 × 1개당 소요 시간, 그렇지 않은 과목은 고정 목표를 쓰고, 다른 트랙 유지 목표도 더한다.
export function weekLoadRows(data, track, today) {
  const info = data.tracks[track];
  const upcoming = track === 1 && !!info.activeFrom && info.activeFrom > today;
  const start = weekStartOf(data, upcoming ? info.activeFrom : today);
  const goals = data.goals.filter((g) => !g.archived && g.track === track);
  const previews = new Map(goals.map((g) => [g.id, planPreview(data, g, today)]));
  const rows = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    let minutes = 0;
    goals.forEach((g) => {
      const preview = previews.get(g.id);
      let amount = 0;
      if (preview) amount = preview.weekDays.find((d) => d.date === date)?.amount || 0;
      else if (!effectiveKind(data, date) && g.weekdays.includes(weekdayOf(date)) && !(upcoming && date < info.activeFrom)) {
        amount = isWeekendLike(date) ? g.weekendTarget : g.weekdayTarget;
      }
      minutes += amount * g.minutesPerUnit;
    });
    const maint = maintenanceTargets(data, date, today);
    minutes += Object.keys(maint).reduce((sum, id) => {
      const g = data.goals.find((x) => x.id === id);
      return sum + (g ? maint[id] * g.minutesPerUnit : 0);
    }, 0);
    return { date, dow: weekdayOf(date), minutes, limit: limitMinutes(data, date) };
  });
  return { rows, start, upcoming, planned: [...previews.values()].filter(Boolean).length, total: goals.length };
}
