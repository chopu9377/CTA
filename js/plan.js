import { addDays, weekdayOf } from "./dates.js";
import { trackAt, effectiveKind, isWeekendLike, targetsFor } from "./stats.js";
import { countUnit, weekdaysForPreset } from "./presets.js";

// 계획상 그날 활성인 트랙. 오늘·과거는 실제 전환 기록을 따르고, 미래는 "1차 활성 시작일 ~ 1차 시험일 전날"이
// 1차 집중 기간이고 그 밖은 2차라고 본다(두 날짜가 모두 있어야 계획으로 인정).
export function hasFocusPlan(data) {
  return !!(data.tracks[1].activeFrom && data.tracks[1].examDate);
}

export function plannedTrackOn(data, dateStr, today) {
  if (dateStr <= today || !hasFocusPlan(data)) return trackAt(data, dateStr);
  const first = data.tracks[1];
  return dateStr >= first.activeFrom && dateStr < first.examDate ? 1 : 2;
}

// 다른 트랙 집중 기간에 가볍게 이어 가는 "유지" 목표(설정에서 트랙별로 켠다).
// 그날 활성 트랙이 아닌 쪽의 목표 중 유지 모드가 켜진 것만 해당한다. 판정·이월에는 넣지 않는다.
export function maintenanceGoals(data, dateStr, today) {
  const active = plannedTrackOn(data, dateStr, today);
  return data.goals.filter((g) => !g.archived && g.track !== active && data.tracks[g.track].maintain);
}

export function maintenanceTargets(data, dateStr, today) {
  const targets = {};
  if (effectiveKind(data, dateStr)) return targets;
  const weekday = weekdayOf(dateStr);
  const weekend = isWeekendLike(dateStr);
  maintenanceGoals(data, dateStr, today).forEach((g) => {
    const amount = weekend ? g.maintWeekendTarget : g.maintWeekdayTarget;
    if (g.weekdays.includes(weekday) && amount > 0) targets[g.id] = amount;
  });
  return targets;
}

export function limitMinutes(data, dateStr) {
  const hours = isWeekendLike(dateStr) ? data.settings.weekendHours : data.settings.weekdayHours;
  return Math.round(hours * 60);
}

// 그날 목표(유지 포함) 합계를 (단위당 소요 시간 × 목표량)으로 환산한 예상 공부 시간과 공부 가능 시간
export function dayLoad(data, dateStr, today) {
  const targets = { ...targetsFor(data, dateStr), ...maintenanceTargets(data, dateStr, today) };
  const minutes = Object.keys(targets).reduce((sum, goalId) => {
    const goal = data.goals.find((g) => g.id === goalId);
    return sum + (goal ? targets[goalId] * goal.minutesPerUnit : 0);
  }, 0);
  return { minutes, limit: limitMinutes(data, dateStr), weekend: isWeekendLike(dateStr) };
}

// 한 주(일~토, 공휴일 무시) 목표 합계를 단위별로 센다. 요일 프리셋이 주간 총량을 얼마나 바꾸는지 보여줄 때 쓴다.
export function weeklyVolume(goals, daysOf = (g) => g.weekdays) {
  const totals = {};
  goals.forEach((g) => {
    const perWeek = daysOf(g).reduce((sum, dow) => sum + (dow === 0 || dow === 6 ? g.weekendTarget : g.weekdayTarget), 0);
    const unit = countUnit(g.unit);
    totals[unit] = (totals[unit] || 0) + perWeek;
  });
  return totals;
}

export function presetImpact(data, track, presetKey) {
  const goals = data.goals.filter((g) => !g.archived && g.track === track);
  return {
    before: weeklyVolume(goals),
    after: weeklyVolume(goals, (g) => weekdaysForPreset(presetKey, track, g.subject, g.unit) || g.weekdays)
  };
}

export function cumulativeOf(goal) {
  return (goal.round - 1) * goal.total + goal.progress;
}

// 목표 회독까지 남은 분량. 목표 회독이 없으면 현재 회독의 남은 분량.
export function workLeft(goal) {
  if (goal.total <= 0) return null;
  if (goal.targetRounds > 0) return Math.max(0, goal.targetRounds * goal.total - cumulativeOf(goal));
  return goal.total - goal.progress;
}

// 권장량 계산에 빠진 입력. 설정의 "권장량 도출" 트리가 무엇을 채워야 하는지 알려 주는 데 쓴다.
export function paceMissing(data, goal) {
  const missing = [];
  if (!data.tracks[goal.track].examDate) missing.push({ field: "examDate", label: "시험일" });
  if (goal.total <= 0) missing.push({ field: "total", label: "총 분량" });
  if (goal.targetRounds <= 0) missing.push({ field: "targetRounds", label: "목표 회독" });
  return missing;
}

// 그 트랙을 실제로 공부하는 날인가(다른 트랙 집중 기간은 제외)
export function studiesTrackOn(data, track, dateStr, today) {
  return !hasFocusPlan(data) || plannedTrackOn(data, dateStr, today) === track;
}

// 권장량: 시험일 `bufferDays`일 전(모의고사·복습 기간)까지 목표 회독을 끝내는 페이스.
// 남은 분량을 공부일수로 나누되 주말은 공부 가능 시간 비율(예: 7h/4h)만큼 더 배정한다.
// 휴식·복습일, 이 목표의 쉬는 요일, 다른 트랙 집중 기간은 공부일에서 뺀다.
// 다른 트랙 집중 기간에 유지 모드로 하기로 한 양은 진도로 인정해 남은 분량에서 뺀다.
export function paceFor(data, goal, today) {
  const info = data.tracks[goal.track];
  if (!info.examDate || goal.total <= 0 || goal.targetRounds <= 0) return null;
  const from = goal.track === 1 && info.activeFrom && info.activeFrom > today ? info.activeFrom : today;
  const endDate = addDays(info.examDate, -data.settings.bufferDays);
  let weekdayDays = 0;
  let weekendDays = 0;
  let maintCredit = 0;
  for (let d = from; d < endDate; d = addDays(d, 1)) {
    if (effectiveKind(data, d) || !goal.weekdays.includes(weekdayOf(d))) continue;
    if (!studiesTrackOn(data, goal.track, d, today)) {
      if (info.maintain) maintCredit += isWeekendLike(d) ? goal.maintWeekendTarget : goal.maintWeekdayTarget;
    } else if (isWeekendLike(d)) weekendDays++;
    else weekdayDays++;
  }
  const rawLeft = workLeft(goal);
  const left = Math.max(0, rawLeft - maintCredit);
  const result = { left, rawLeft, maintCredit, weekdayDays, weekendDays, endDate, perWeekday: null, perWeekend: null };
  if (left <= 0) return { ...result, perWeekday: 0, perWeekend: 0 };
  if (!weekdayDays && !weekendDays) return result;
  if (!weekendDays) return { ...result, perWeekday: Math.ceil(left / weekdayDays), perWeekend: 0 };
  if (!weekdayDays) return { ...result, perWeekday: 0, perWeekend: Math.ceil(left / weekendDays) };
  const { weekdayHours, weekendHours } = data.settings;
  const ratio = weekdayHours > 0 && weekendHours > 0 ? weekendHours / weekdayHours : 1;
  const perWeekday = Math.ceil(left / (weekdayDays + ratio * weekendDays));
  return { ...result, perWeekday, perWeekend: Math.ceil(perWeekday * ratio) };
}

// 그 트랙을 집중할 때 권장량을 그대로 따른 요일별(월~일) 예상 공부 시간과 공부 가능 시간.
// 다른 트랙의 유지 목표도 시간에 포함한다.
export function weeklyLoad(data, track, today) {
  const goals = data.goals.filter((g) => !g.archived && g.track === track);
  const paces = goals.map((goal) => ({ goal, pace: paceFor(data, goal, today) })).filter((p) => p.pace);
  const other = track === 1 ? 2 : 1;
  const maintenance = data.tracks[other].maintain ? data.goals.filter((g) => !g.archived && g.track === other) : [];
  const rows = [1, 2, 3, 4, 5, 6, 0].map((dow) => {
    const weekend = dow === 0 || dow === 6;
    let minutes = paces.reduce((sum, { goal, pace }) => {
      if (!goal.weekdays.includes(dow)) return sum;
      return sum + (weekend ? pace.perWeekend : pace.perWeekday) * goal.minutesPerUnit;
    }, 0);
    minutes += maintenance.reduce((sum, g) => {
      if (!g.weekdays.includes(dow)) return sum;
      return sum + (weekend ? g.maintWeekendTarget : g.maintWeekdayTarget) * g.minutesPerUnit;
    }, 0);
    const hours = weekend ? data.settings.weekendHours : data.settings.weekdayHours;
    return { dow, minutes, limit: Math.round(hours * 60) };
  });
  return { rows, paced: paces.length, total: goals.length, maintenance: maintenance.length };
}

export function focusRows(data, track, today) {
  const info = data.tracks[track];
  const from = info.activeFrom && info.activeFrom > today ? info.activeFrom : today;
  let days = null;
  if (info.examDate) {
    days = 0;
    for (let d = from; d < info.examDate; d = addDays(d, 1)) {
      if (!effectiveKind(data, d) && studiesTrackOn(data, track, d, today)) days++;
    }
    days = Math.max(1, days);
  }
  const rows = data.goals
    .filter((g) => !g.archived && g.track === track)
    .map((goal) => {
      const remaining = workLeft(goal);
      return { goal, remaining, perDay: remaining !== null && days ? remaining / days : null };
    });
  return { rows, days, from };
}
