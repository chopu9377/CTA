import { addDays, diffDays, todayStr } from "./dates.js";
import { effectiveKind, targetOn } from "./stats.js";
import { limitMinutes, plannedTrackOn, maintenanceTargets, cumulativeOf } from "./plan.js";
import { weekStartOf, isAutoGoal, autoWeekTotal, distribute } from "./weekplan.js";
import { dataVersion } from "./version.js";
import { seededRandom, randomInt, shuffle } from "./random.js";
import { deepGroupOf, DEEP_GROUPS } from "./presets.js";

// 주간 랜덤 배치: 과목마다 한 주 양(자동은 역산 필요량, 고정은 평일/주말 숫자)과 주 N일은 그대로 두고
// "무슨 요일에 무슨 과목"만 매주 랜덤으로 정한다. 요일별 시간이 공부 가능 시간 비율에 가깝게 고른 배치들 중에서 고르고,
// 과목이 3일 넘게 비는 배치와 이틀 연속 과목이 많이 겹치는 배치는 감점한다. "채우기" 과목은 마지막에 남는 시간을 채운다.
// 저장하지 않고 매번 같은 결과를 계산한다(시드 = 트랙·주 시작일·재배치 기준일·공부일 목록).
// 휴식일 지정처럼 계획이 바뀌면(markReplan → layoutFrom) 그날부터 남은 날만 다시 섞고, 그 전 날은 저장된 스냅샷을 쓴다.

export const LAYOUT_RULES = {
  restarts: 10,
  farRestarts: 3, // 다음 주보다 먼 주는 미리보기일 뿐이라(그 주가 시작될 때 진도로 다시 정해진다) 가볍게 계산
  tolerance: 1800, // 최선 배치와 이만큼(분²) 차이 안의 배치는 같은 후보로 보고 그중 랜덤
  overlapLimit: 2 / 3,
  overlapPenalty: 2500,
  maxGap: 3,
  gapPenalty: 1e8, // 사실상 필수 규칙(피할 수 있으면 요일 균형보다 먼저 피한다)
  // 진득: 묶음마다 하루 한 과목에서 벗어난 과목 수당(약 80분 어긋남만큼 — 시간 균형이 크게 깨지면 1·3과목 허용).
  // 실제 사용량 기준 1600 → 71%, 6400 → 93%가 딱 두 과목이었고 과부하는 늘지 않았다
  deepPenalty: 6400,
  fillPerDay: 2
};

// 그날 적용되는 하루 구성 모드. 시험 N일 전부터는 자동으로 물붓기.
export function layoutModeOn(data, track, dateStr) {
  const { layoutMode, autoSpreadDays } = data.settings;
  const exam = data.tracks[track].examDate;
  if (autoSpreadDays > 0 && exam && dateStr >= addDays(exam, -autoSpreadDays)) return "spread";
  return layoutMode || "basic";
}

const weekDates = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

function combos(n, k) {
  const out = [];
  const cur = [];
  const rec = (s) => {
    if (cur.length === k) {
      out.push([...cur]);
      return;
    }
    for (let i = s; i <= n - (k - cur.length); i++) {
      cur.push(i);
      rec(i + 1);
      cur.pop();
    }
  };
  rec(0);
  return out;
}

function popcount(x) {
  let c = 0;
  for (let v = x; v; v &= v - 1) c++;
  return c;
}

// 이미 굳은 날의 목표. 보상 휴식으로 줄인 과목도 그날 공부하기로 했던 것으로 본다.
function frozenTargets(data, dateStr) {
  const snap = data.dayTargets[dateStr];
  if (!snap) return null;
  const out = { ...snap };
  const bonus = data.bonusRest[dateStr];
  if (bonus && typeof bonus === "object") Object.entries(bonus).forEach(([id, n]) => (out[id] = (out[id] || 0) + n));
  return out;
}

function onlyGoals(targets, ids) {
  return Object.fromEntries(Object.entries(targets || {}).filter(([id, n]) => ids.has(id) && n > 0));
}

function anchorOf(data, goals, weekStart, weekEnd) {
  const points = [data.layoutFrom, ...goals.flatMap((g) => [g.replanFrom, g.autoFrom])];
  return points.filter((d) => d && d > weekStart && d < weekEnd).sort().pop() || weekStart;
}

function maintenanceMinutes(data, dateStr, today) {
  const targets = maintenanceTargets(data, dateStr, today);
  return Object.keys(targets).reduce((sum, id) => {
    const g = data.goals.find((x) => x.id === id);
    return sum + (g ? targets[id] * g.minutesPerUnit : 0);
  }, 0);
}

// 과목이 빈 날 수를 셀 때 휴식·복습일은 빼고 센다(일부러 쉬는 날 앞에 과목을 몰아넣지 않게)
function gapPenalty(dates, prevLast, weekEnd, emptyBetween) {
  const { maxGap, gapPenalty: unit } = LAYOUT_RULES;
  if (!dates.length) return 0;
  const seq = prevLast ? [prevLast, ...dates] : dates;
  let over = 0;
  for (let i = 1; i < seq.length; i++) over += Math.max(0, emptyBetween(seq[i - 1], seq[i]) - maxGap);
  over += Math.max(0, emptyBetween(dates[dates.length - 1], weekEnd) - maxGap);
  return over * unit;
}

// 과목별 요일 후보와 후보마다의 요일별 분 수·과목 표시 비트·공백 감점을 미리 만든다.
// 진득 모드의 묶음 과목(자동)은 며칠에 나눌지도 정해 두지 않고(1~남은 공부일 모두 후보) 묶음 감점이 고르게 한다.
// 물붓기 모드의 자동 과목은 남은 공부일 전부에 나눈다.
function buildModels(ctx) {
  const { data, goals, segment, limits, weekStart, weekEnd, anchor, byDate, prefix, targetsBefore, today, mode } = ctx;
  const m = segment.length;
  const models = [];
  goals.forEach((goal) => {
    if (goal.planMode === "fill" || models.length >= 30) return;
    const n = Math.max(1, Math.min(7, goal.daysPerWeek || 7));
    const doneDays = prefix.filter((d) => (byDate.get(d)[goal.id] || 0) > 0);
    const auto = isAutoGoal(data, goal) && goal.autoFrom <= anchor;
    const group = mode === "deep" ? deepGroupOf(goal.subject) : null;
    let total = 0;
    let sizes;
    if (auto) {
      const week = autoWeekTotal(data, goal, weekStart, today);
      total = week.total;
      if (week.effStart < anchor) total -= doneDays.filter((d) => d >= week.effStart).reduce((s, d) => s + byDate.get(d)[goal.id], 0);
      if (total <= 0) return;
      // 주 중간에 다시 섞을 때 남은 양은 남은 기간 비율로 새로 구해지므로 요일 수도 남은 공부일 비율만큼(지난 날 수를 빼지 않는다)
      const k = Math.min(m, Math.max(1, Math.round((n * m) / ctx.studyDaysInWeek)));
      if (mode === "spread") sizes = [m];
      else if (group) sizes = Array.from({ length: Math.min(m, total) }, (_, i) => i + 1);
      else sizes = [k];
    } else {
      if (!goal.weekdayTarget && !goal.weekendTarget) return;
      const k = n - doneDays.length;
      if (k <= 0) return;
      sizes = [Math.min(k, m)];
    }
    let prevLast = null;
    for (let d = addDays(anchor, -1); d >= addDays(anchor, -7) && !prevLast; d = addDays(d, -1)) {
      if ((targetsBefore(d)[goal.id] || 0) > 0) prevLast = d;
    }
    const checkGap = n >= 2 || !!group;
    const emptyBetween = (a, b) => {
      let count = 0;
      for (let d = addDays(a, 1); d < b; d = addDays(d, 1)) if (!effectiveKind(data, d)) count++;
      return count;
    };
    const bit = 1 << models.length;
    const options = sizes.flatMap((size) => combos(m, size)).map((idx) => {
      const amounts = auto ? distribute(total, idx.map((i) => ({ w: limits[i] }))) : idx.map((i) => targetOn(goal, segment[i]));
      const minutes = Array(m).fill(0);
      const bits = Array(m).fill(0);
      const dates = [];
      idx.forEach((i, j) => {
        if (amounts[j] <= 0) return;
        minutes[i] = amounts[j] * goal.minutesPerUnit;
        bits[i] = bit;
        dates.push(segment[i]);
      });
      return { idx, amounts, minutes, bits, gap: checkGap ? gapPenalty(dates, prevLast, weekEnd, emptyBetween) : 0 };
    });
    models.push({ goal, bit, group, options });
  });
  return models;
}

function makeScorer(ctx, models) {
  const { segment, limits, base, prevMask } = ctx;
  const m = segment.length;
  const sumLimit = limits.reduce((a, b) => a + b, 0) || 1;
  const adjacent = segment.map((d, i) => (i === 0 ? true : diffDays(segment[i - 1], d) === 1));
  const { overlapLimit, overlapPenalty, deepPenalty } = LAYOUT_RULES;
  const groupKeys = Object.keys(DEEP_GROUPS).filter((key) => models.some((model) => model.group === key));
  // 진득: 묶음마다 매일 딱 한 과목
  const deep = (counts) => groupKeys.reduce((pen, key) => pen + counts[key].reduce((s, c) => s + Math.abs(c - 1), 0), 0) * deepPenalty;

  const balance = (loads) => {
    const total = loads.reduce((a, b) => a + b, 0);
    return loads.reduce((s, l, i) => s + (l - (total * limits[i]) / sumLimit) ** 2, 0);
  };
  const overlap = (masks) => {
    let pen = 0;
    for (let i = 0; i < m; i++) {
      const prev = i === 0 ? prevMask : adjacent[i] ? masks[i - 1] : 0;
      if (!prev || !masks[i]) continue;
      const ratio = popcount(prev & masks[i]) / Math.max(popcount(prev), popcount(masks[i]));
      if (ratio >= overlapLimit) pen += overlapPenalty * ratio * (prev === masks[i] ? 2 : 1);
    }
    return pen;
  };
  const state = (choice, skip = -1) => {
    const loads = [...base];
    const masks = Array(m).fill(0);
    const counts = Object.fromEntries(groupKeys.map((key) => [key, Array(m).fill(0)]));
    let gaps = 0;
    models.forEach((model, gi) => {
      if (gi === skip) return;
      const o = model.options[choice[gi]];
      for (let i = 0; i < m; i++) {
        loads[i] += o.minutes[i];
        masks[i] |= o.bits[i];
        if (model.group && o.bits[i]) counts[model.group][i]++;
      }
      gaps += o.gap;
    });
    return { loads, masks, counts, gaps };
  };
  const withOption = (s, o, group) => {
    const loads = s.loads.map((l, i) => l + o.minutes[i]);
    const masks = s.masks.map((b, i) => b | o.bits[i]);
    const counts = group ? { ...s.counts, [group]: s.counts[group].map((c, i) => c + (o.bits[i] ? 1 : 0)) } : s.counts;
    return balance(loads) + overlap(masks) + deep(counts) + o.gap;
  };
  const score = (choice) => {
    const s = state(choice);
    return balance(s.loads) + overlap(s.masks) + deep(s.counts) + s.gaps;
  };
  return { state, withOption, score };
}

function search(ctx, models, rand) {
  const scorer = makeScorer(ctx, models);
  const order = models.map((_, i) => i);
  const solutions = new Map();
  const far = ctx.weekStart > addDays(weekStartOf(ctx.data, ctx.today), 7);
  const restarts = far ? LAYOUT_RULES.farRestarts : LAYOUT_RULES.restarts;
  for (let r = 0; r < restarts; r++) {
    const choice = models.map((model) => randomInt(rand, model.options.length));
    for (let pass = 0; pass < 30; pass++) {
      let moved = false;
      shuffle(rand, order).forEach((gi) => {
        const rest = scorer.state(choice, gi);
        let bestScore = Infinity;
        let best = [];
        models[gi].options.forEach((o, j) => {
          const s = scorer.withOption(rest, o, models[gi].group);
          if (s < bestScore - 1e-6) {
            bestScore = s;
            best = [j];
          } else if (Math.abs(s - bestScore) <= 1e-6) best.push(j);
        });
        const next = best.includes(choice[gi]) ? choice[gi] : best[randomInt(rand, best.length)];
        if (next !== choice[gi]) {
          choice[gi] = next;
          moved = true;
        }
      });
      if (!moved) break;
    }
    const key = choice.join(",");
    if (!solutions.has(key)) solutions.set(key, { choice: [...choice], score: scorer.score(choice) });
  }
  const list = [...solutions.values()];
  const best = Math.min(...list.map((s) => s.score));
  const pool = list.filter((s) => s.score <= best + LAYOUT_RULES.tolerance);
  return { choice: pool[randomInt(rand, pool.length)].choice, scorer };
}

// 보상 휴식으로 줄여 둔 과목은 그날에서 빠지지 않게 한다(이미 들어 있으면 아무것도 바꾸지 않는다).
function keepBonusDays(ctx, models, choice, scorer) {
  const { data, segment } = ctx;
  segment.forEach((d, i) => {
    const bonus = data.bonusRest[d];
    if (!bonus || typeof bonus !== "object") return;
    models.forEach((model, gi) => {
      if (!(bonus[model.goal.id] > 0) || model.options[choice[gi]].bits[i]) return;
      const current = new Set(model.options[choice[gi]].idx);
      let best = null;
      model.options.forEach((o, j) => {
        if (!o.bits[i]) return;
        const shared = o.idx.filter((x) => current.has(x)).length;
        const trial = [...choice];
        trial[gi] = j;
        const s = scorer.score(trial);
        if (!best || shared > best.shared || (shared === best.shared && s < best.s)) best = { j, shared, s };
      });
      if (best) choice[gi] = best.j;
    });
  });
}

function fillGoals(ctx, loads) {
  const { data, goals, segment, limits, byDate, anchor } = ctx;
  goals
    .filter((g) => g.planMode === "fill")
    .forEach((goal) => {
      const since = data.entries.filter((e) => e.goalId === goal.id && e.date >= anchor).reduce((s, e) => s + e.amount, 0);
      const rounds = goal.targetRounds > 0 ? goal.targetRounds : 1;
      let left = goal.total > 0 ? Math.max(0, rounds * goal.total - (cumulativeOf(goal) - since)) : Infinity;
      segment.forEach((d, i) => {
        if (left <= 0) return;
        const amount = Math.min(LAYOUT_RULES.fillPerDay, Math.floor((limits[i] - loads[i]) / goal.minutesPerUnit), left);
        if (amount <= 0) return;
        byDate.get(d)[goal.id] = amount;
        loads[i] += amount * goal.minutesPerUnit;
        left -= amount;
      });
    });
}

function buildLayout(data, track, weekStart, today) {
  const weekEnd = addDays(weekStart, 7);
  const goals = data.goals.filter((g) => !g.archived && g.track === track);
  const ids = new Set(goals.map((g) => g.id));
  const anchor = anchorOf(data, goals, weekStart, weekEnd);
  const byDate = new Map();
  const prefix = weekDates(weekStart).filter((d) => d < anchor);
  prefix.forEach((d) => byDate.set(d, onlyGoals(frozenTargets(data, d), ids)));
  const segment = weekDates(weekStart).filter((d) => d >= anchor && !effectiveKind(data, d) && plannedTrackOn(data, d, today) === track);
  segment.forEach((d) => byDate.set(d, {}));
  const mode = layoutModeOn(data, track, anchor);

  if (segment.length) {
    const targetsBefore = (d) => {
      if (d >= anchor) return {};
      if (d >= weekStart) return byDate.get(d) || {};
      if (d < data.startDate) return {};
      const frozen = frozenTargets(data, d);
      return onlyGoals(frozen || weekLayout(data, track, weekStartOf(data, d), today).byDate.get(d), ids);
    };
    const ctx = {
      data,
      goals,
      segment,
      prefix,
      byDate,
      anchor,
      weekStart,
      weekEnd,
      today,
      mode,
      targetsBefore,
      studyDaysInWeek: Math.max(1, weekDates(weekStart).filter((d) => !effectiveKind(data, d) && plannedTrackOn(data, d, today) === track).length),
      limits: segment.map((d) => limitMinutes(data, d)),
      base: segment.map((d) => maintenanceMinutes(data, d, today))
    };
    const models = buildModels(ctx);
    const before = targetsBefore(addDays(segment[0], -1));
    ctx.prevMask = models.reduce((mask, model) => mask | ((before[model.goal.id] || 0) > 0 ? model.bit : 0), 0);
    const loads = [...ctx.base];
    if (models.length) {
      // 기본 모드는 모드 이름을 시드에 넣지 않는다(모드 기능 이전에 정해진 배치가 그대로 유지되게)
      const rand = seededRandom(`${track}|${weekStart}|${anchor}|${mode === "basic" ? "" : `${mode}|`}${segment.join(",")}`);
      const { choice, scorer } = search(ctx, models, rand);
      keepBonusDays(ctx, models, choice, scorer);
      models.forEach((model, gi) => {
        const o = model.options[choice[gi]];
        o.idx.forEach((i, j) => {
          if (o.amounts[j] > 0) byDate.get(segment[i])[model.goal.id] = o.amounts[j];
        });
        o.minutes.forEach((v, i) => (loads[i] += v));
      });
    }
    fillGoals(ctx, loads);
  }

  const goalDates = new Map();
  [...byDate.keys()].sort().forEach((d) =>
    Object.entries(byDate.get(d)).forEach(([id, n]) => {
      if (n <= 0) return;
      if (!goalDates.has(id)) goalDates.set(id, []);
      goalDates.get(id).push(d);
    })
  );
  return { weekStart, anchor, mode, byDate, goalDates };
}

const cache = new Map();
let cachedVersion = -1;

export function weekLayout(data, track, weekStart, today = todayStr()) {
  const version = dataVersion();
  if (version !== cachedVersion) {
    cache.clear();
    cachedVersion = version;
  }
  const key = `${track}|${weekStart}|${today}`;
  if (cache.has(key)) return cache.get(key) || { weekStart, anchor: weekStart, mode: "basic", byDate: new Map(), goalDates: new Map() };
  cache.set(key, null);
  const layout = buildLayout(data, track, weekStart, today);
  cache.set(key, layout);
  return layout;
}

// 그날 배치된 과목별 양(휴식 저축 차감·같은 주 이월 몫은 더하기 전)
export function layoutOn(data, track, dateStr, today = todayStr()) {
  return weekLayout(data, track, weekStartOf(data, dateStr), today).byDate.get(dateStr) || {};
}

// 그 주에 그 과목이 배치된 날짜들(오름차순)
export function goalDatesIn(data, goal, weekStart, today = todayStr()) {
  return weekLayout(data, goal.track, weekStart, today).goalDates.get(goal.id) || [];
}
