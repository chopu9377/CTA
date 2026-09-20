import { addDays, weekdayOf } from "./dates.js";
import { effectiveKind, targetsFor, trackAt, computeTargets } from "./stats.js";
import { limitMinutes, plannedTrackOn } from "./plan.js";
import { weekStartOf } from "./weekplan.js";

// 휴식 저축(보상 휴식): 목표보다 넘게 푼 양을 "시간"으로 모아 두었다가 미래의 하루(또는 일부)를 쉬는 데 쓴다.
// 저장하는 값은 사용 기록(bonusRest{ 날짜: 분 })뿐이고, 저축액은 기록에서 매번 다시 계산한다.

export const BONUS_CAP_MIN = 7 * 60; // 원기옥 상한(주말 하루 분량)
export const BONUS_STEP_MIN = 30;
export const BONUS_LOCK_DAYS = 21; // 시험 3주 전부터는 쓸 수 없다

export function bonusMinutes(data, dateStr) {
  return data.bonusRest[dateStr] || 0;
}

function scaleTargets(targets, minutes, limit) {
  const ratio = limit > 0 ? Math.min(1, minutes / limit) : 1;
  const out = {};
  Object.keys(targets).forEach((id) => {
    const left = ratio >= 1 ? 0 : targets[id] - Math.round(targets[id] * ratio);
    if (left > 0) out[id] = left;
  });
  return out;
}

// 그날 목표에서 쉬는 시간 비율만큼 덜어 낸다(하루 공부 가능 시간 대비). 통째로 쉬면 목표가 없다.
export function applyBonus(data, dateStr, targets) {
  const minutes = bonusMinutes(data, dateStr);
  return minutes ? scaleTargets(targets, minutes, limitMinutes(data, dateStr)) : targets;
}

export function bonusLockedOn(data, dateStr, today) {
  const exam = data.tracks[plannedTrackOn(data, dateStr, today)].examDate;
  return !!exam && dateStr > addDays(exam, -BONUS_LOCK_DAYS);
}

// 그날을 보상 휴식으로 고를 수 없는 이유(고를 수 있으면 null)
export function bonusBlockReason(data, dateStr, today) {
  if (dateStr < today) return "지난 날이에요";
  if (effectiveKind(data, dateStr)) return "이미 휴식·복습일이에요";
  if (bonusMinutes(data, dateStr)) return "이미 보상 휴식이에요";
  if (bonusLockedOn(data, dateStr, today)) return "시험 3주 전부터는 쓸 수 없어요";
  const track = plannedTrackOn(data, dateStr, today);
  const weekday = weekdayOf(dateStr);
  if (!data.goals.some((g) => !g.archived && g.track === track && g.weekdays.includes(weekday))) return "공부할 목표가 없는 날이에요";
  return null;
}

// 초과 시간 - 이월 상환에 쓴 시간 - 이미 쓴 시간. 상한을 넘는 초과분은 진도로 남아 다음 주 계획을 낮춘다.
export function bonusSavings(data, ctx, today) {
  const goalById = new Map(data.goals.map((g) => [g.id, g]));
  let excessMin = 0;
  ctx.sums.forEach((done, key) => {
    const [goalId, date] = key.split("|");
    const goal = goalById.get(goalId);
    if (!goal || date > today || goal.track !== trackAt(data, date)) return;
    const excess = done - (targetsFor(data, date)[goalId] || 0);
    if (excess > 0) excessMin += excess * goal.minutesPerUnit;
  });
  let repaidMin = 0;
  data.carries.forEach((c) => {
    const goal = goalById.get(c.goalId);
    if (c.redistribute || !goal) return;
    repaidMin += (c.amount - (ctx.remaining.get(c.id) ?? c.amount)) * goal.minutesPerUnit;
  });
  const usedMin = Object.values(data.bonusRest).reduce((sum, m) => sum + m, 0);
  const rawMin = Math.max(0, Math.round(excessMin - repaidMin - usedMin));
  return { rawMin, savedMin: Math.min(BONUS_CAP_MIN, rawMin), usedMin };
}

// 하루에 쓸 수 있는 최대 시간(저축과 그날 공부 가능 시간 중 작은 쪽, 30분 단위)
export function bonusMaxFor(data, dateStr, savedMin) {
  const cap = Math.min(savedMin, limitMinutes(data, dateStr));
  return Math.floor(cap / BONUS_STEP_MIN) * BONUS_STEP_MIN;
}

// 이번 주 진행 상태. 지금까지(오늘 제외) 계획보다 뒤처졌으면 behind, 오늘 목표까지 채우고도 남으면 ahead.
// 이월해서 뒤로 넘긴 양은 뒤처진 것으로 세지 않는다(넘긴 날의 목표에서 빼고, 받는 날의 목표에 얹혀 있다).
export function weekShip(data, ctx, today) {
  const start = weekStartOf(data, today);
  const goalById = new Map(data.goals.map((g) => [g.id, g]));
  let netBefore = 0;
  let netToday = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const targets = targetsFor(data, d);
    data.goals.forEach((g) => {
      if (g.track !== trackAt(data, d)) return;
      const diff = ((ctx.sums.get(`${g.id}|${d}`) || 0) - (targets[g.id] || 0)) * g.minutesPerUnit;
      if (d < today) netBefore += diff;
      else netToday += diff;
    });
  }
  data.carries.forEach((c) => {
    const goal = goalById.get(c.goalId);
    if (c.redistribute && goal && c.fromDate >= start && c.fromDate < today) netBefore += c.amount * goal.minutesPerUnit;
  });
  const net = netBefore + netToday;
  const level = net > 0 ? "ahead" : netBefore < 0 ? "behind" : "cruise";
  return { level, aheadMin: Math.max(0, Math.round(net)), behindMin: Math.max(0, Math.round(-netBefore)) };
}

// 쓰기 전 확인용: 그날 목표가 어떻게 바뀌는지(이미 계획이 나온 날만 양을 알 수 있다)
export function bonusPreview(data, dateStr, minutes, today) {
  const limit = limitMinutes(data, dateStr);
  const before = computeTargets(data, dateStr);
  const after = scaleTargets(before, minutes, limit);
  const rows = Object.keys(before)
    .map((id) => ({ goal: data.goals.find((g) => g.id === id), before: before[id], after: after[id] || 0 }))
    .filter((r) => r.goal);
  return { full: minutes >= limit, ratio: limit > 0 ? Math.min(1, minutes / limit) : 1, rows, planned: weekStartOf(data, dateStr) <= weekStartOf(data, today) };
}
