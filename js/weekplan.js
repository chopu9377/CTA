import { addDays, diffDays, weekdayOf, todayStr } from "./dates.js";
import { effectiveKind, isWeekendLike, targetsFor, trackAt } from "./stats.js";
import { dataVersion } from "./version.js";
import { paceFor, paceMissing, studiesTrackOn, workLeft, cumulativeOf, limitMinutes, maintenanceTargets, weekShare } from "./plan.js";
import { layoutOn, goalDatesIn, weekLayout } from "./layout.js";

// 주간 자동 역산(미리보기). 하루 목표를 먼저 올림하지 않고 "이번 주 필요량"을 소수점까지 구한 뒤 정수로 나눈다.
// 저장하는 값은 없다: 주 시작 시점 진도 = 현재 누적 - 그 주에 입력한 기록 으로 매번 같은 계획을 다시 만든다
// (같은 데이터면 폰과 웹의 결과가 같고 동기화 충돌이 생기지 않는다).
// 요일은 과목별로 고정하지 않는다: 이번 주 필요량은 공부일 전체 가중치로 구하고, 어느 날에 얼마를 둘지는 layout.js의 주간 랜덤 배치가 정한다.

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

// paceFor와 같은 규칙: 휴식·복습일은 뺀다. 다른 트랙 집중 기간은 공부일이 아니고,
// 유지 모드가 켜져 있으면 그날 유지량을 진도로 인정(credit)한다(유지는 주 N일이라 하루 몫 × N/7).
function collectDays(data, goal, from, end, today) {
  const info = data.tracks[goal.track];
  const ratio = weekendRatio(data);
  const share = weekShare(goal);
  const days = [];
  let credit = 0;
  for (let d = from; d < end; d = addDays(d, 1)) {
    if (effectiveKind(data, d)) continue;
    if (!studiesTrackOn(data, goal.track, d, today)) {
      if (info.maintain) credit += (isWeekendLike(d) ? goal.maintWeekendTarget : goal.maintWeekdayTarget) * share;
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
  return { weekStart, effStart, endDate, rawLeftAtStart, credit, left0, plan, thisWeek };
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

// 이번 주 계획 필요량(랜덤 배치가 요일에 나눈다)과 계획의 출발일
export function autoWeekTotal(data, goal, weekStart, today) {
  const week = getWeek(data, goal, weekStart, today);
  return { total: week.thisWeek.total, effStart: week.effStart };
}

// 자동 목표의 그날 목표 = 그 주 랜덤 배치 몫(이월분은 얹지 않는다 — 아래 autoDebts로 따로 갚는다).
// 아직 시작 안 한 주는 계획이 없다(그 주가 시작될 때 정해진다).
// preview: 아직 시작 안 한 주도 "지금 진도 기준 예상"으로 계산한다(내일 미리보기용, 그 주가 시작되면 달라질 수 있다).
export function autoTargetOn(data, goal, dateStr, preview = false) {
  const today = todayStr();
  if (!preview && weekStartOf(data, dateStr) > weekStartOf(data, today)) return 0;
  return layoutOn(data, goal.track, dateStr, today)[goal.id] || 0;
}

export function autoApplies(data, goal, dateStr) {
  return isAutoGoal(data, goal) && dateStr >= goal.autoFrom;
}

// 그 주 안에서 자동 계획이 새로 출발한 날(자동을 켠 날·다시 나눈 날). 그 주 밖의 출발일은 그 주와 상관없다.
function weekEffStart(goal, weekStart) {
  const weekEnd = addDays(weekStart, 7);
  return [goal.autoFrom, goal.replanFrom].filter((d) => d && d > weekStart && d < weekEnd).sort().pop() || weekStart;
}

// 자동 목표의 주간 소급. 그 주 출발일부터 지난 날의 못 채운 양을 부족분으로 쌓고, 그날 목표를 넘겨 푼 양(휴식·복습일 포함)으로
// 먼저 생긴 부족분부터 갚는다(그날 몫을 먼저 채운 뒤 남는 양만). 주가 끝나면 남은 부족분은 다음 주 역산에 이미 들어가므로
// 다른 주의 초과로는 갚지 않는다. 출발일 이전 날의 부족분도 새 계획에 흡수되어 있어 세지 않는다.
// 결과: "목표id|날짜" → { amount, left, open(그 주가 아직 안 끝남) }
export function autoDebts(data, sums, today) {
  const out = new Map();
  data.goals.forEach((goal) => {
    if (goal.archived || !isAutoGoal(data, goal)) return;
    for (let ws = weekStartOf(data, goal.autoFrom); ws <= today; ws = addDays(ws, 7)) {
      const weekEnd = addDays(ws, 7);
      const debts = [];
      for (let d = weekEffStart(goal, ws); d < weekEnd && d <= today; d = addDays(d, 1)) {
        if (d < goal.autoFrom || trackAt(data, d) !== goal.track) continue;
        const diff = (sums.get(`${goal.id}|${d}`) || 0) - (targetsFor(data, d)[goal.id] || 0);
        if (diff > 0) {
          let pool = diff;
          debts.forEach((x) => {
            const pay = Math.min(pool, x.left);
            x.left -= pay;
            pool -= pay;
          });
        } else if (diff < 0 && d < today) debts.push({ date: d, amount: -diff, left: -diff });
      }
      debts.forEach((x) => out.set(`${goal.id}|${x.date}`, { amount: x.amount, left: x.left, open: weekEnd > today }));
    }
  });
  return out;
}

// 오늘이 이번 주 그 과목의 마지막 공부일인가(못 채우면 다음 주 계획에 자동 반영된다)
export function isLastStudyDay(data, goal, today) {
  const dates = goalDatesIn(data, goal, weekStartOf(data, today), today);
  return dates.includes(today) && dates[dates.length - 1] === today;
}

// 그 주 목표량. 자동 목표가 주 중간에 새 출발(replan)했다면 그 이전 날은 실제 한 양으로 확정하고, 이후는 새 계획의 목표를 쓴다
// (이전 날에 못 한 양은 새 계획의 남은 분량에 이미 들어 있어서 목표에 두 번 세면 안 된다).
export function weekQuota(data, sums, goal, dates) {
  let from = dates[0];
  if (isAutoGoal(data, goal)) from = weekEffStart(goal, weekStartOf(data, from));
  const sumOf = (d) => sums.get(`${goal.id}|${d}`) || 0;
  const before = dates.filter((d) => d < from).reduce((s, d) => s + sumOf(d), 0);
  const rest = dates.filter((d) => d >= from);
  return before + rest.reduce((s, d) => s + (targetsFor(data, d)[goal.id] || 0), 0);
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
  const share = weekShare(goal);
  let weight = 0;
  for (let d = windowStart; d < today; d = addDays(d, 1)) {
    if (effectiveKind(data, d) || !studiesTrackOn(data, goal.track, d, today)) continue;
    weight += isWeekendLike(d) ? ratio : 1;
  }
  if (weight <= 0) return { state: "insufficient", observed };

  const rate = entriesOf(data, goal.id, windowStart, today) / weight;
  let left = workLeft(goal);
  let projected = null;
  for (let i = 1; i <= horizonDays && left > 0; i++) {
    const d = addDays(today, i);
    if (effectiveKind(data, d)) continue;
    if (!studiesTrackOn(data, goal.track, d, today)) {
      if (info.maintain) left -= (isWeekendLike(d) ? goal.maintWeekendTarget : goal.maintWeekdayTarget) * share;
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
  const capacityMin = now.days.reduce((sum, d) => sum + limitMinutes(data, d.date), 0) * weekShare(goal);
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
    weekDays: isAutoGoal(data, goal)
      ? goalDatesIn(data, goal, basis.weekStart, today).map((date) => ({
          date,
          dow: weekdayOf(date),
          amount: weekLayout(data, goal.track, basis.weekStart, today).byDate.get(date)[goal.id]
        }))
      : [],
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

// 이번 주(1차가 아직 시작 전이면 집중이 시작되는 주) 랜덤 배치의 날짜별 과목·예상 공부 시간과 공부 가능 시간(다른 트랙 유지 목표 포함).
export function weekLoadRows(data, track, today) {
  const info = data.tracks[track];
  const upcoming = track === 1 && !!info.activeFrom && info.activeFrom > today;
  const start = weekStartOf(data, upcoming ? info.activeFrom : today);
  const layout = weekLayout(data, track, start, today);
  const goalById = new Map(data.goals.map((g) => [g.id, g]));
  const rows = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const planned = layout.byDate.get(date) || {};
    const maint = maintenanceTargets(data, date, today);
    const items = [
      ...Object.entries(planned).map(([id, amount]) => ({ goal: goalById.get(id), amount, maint: false })),
      ...Object.entries(maint).map(([id, amount]) => ({ goal: goalById.get(id), amount, maint: true }))
    ].filter((it) => it.goal && it.amount > 0);
    const minutes = items.reduce((sum, it) => sum + it.amount * it.goal.minutesPerUnit, 0);
    return { date, dow: weekdayOf(date), kind: effectiveKind(data, date), items, minutes, limit: limitMinutes(data, date) };
  });
  return { rows, start, upcoming };
}
