import { weekdaysForPreset } from "./presets.js";
import { getData, persist, uid, ensureColor, newGoal, refreshToday, findGoal, markReplan, appToday } from "./store.js";

// 이 필드가 바뀌면 자동 목표의 이번 주 계획을 오늘부터 새로 나눈다
const PLAN_FIELDS = ["total", "targetRounds", "weekdays", "maintWeekdayTarget", "maintWeekendTarget"];

function rollRounds(goal) {
  let rolled = 0;
  while (goal.total > 0 && goal.progress >= goal.total) {
    goal.progress -= goal.total;
    goal.round++;
    rolled++;
  }
  return rolled;
}

export function addGoal(track, subject, unit) {
  const data = getData();
  const goal = newGoal(track, subject, unit);
  data.goals.push(goal);
  ensureColor(data, subject);
  refreshToday();
  persist();
  return goal;
}

export function updateGoal(goalId, patch) {
  const data = getData();
  const goal = findGoal(goalId);
  if (!goal) return { rolled: 0 };
  const oldName = goal.subject;
  Object.assign(goal, patch);
  if (PLAN_FIELDS.some((k) => k in patch)) markReplan([goal]);
  if (patch.subject) {
    ensureColor(data, goal.subject);
    if (!data.goals.some((g) => g.subject === oldName)) delete data.subjectColors[oldName];
  }
  const rolled = rollRounds(goal);
  refreshToday();
  persist();
  return { rolled };
}

// 앱을 쓰기 전에 푼 누적량을 회독/진행량으로 환산해 넣는다. entries를 만들지 않으므로 주간 통계에는 잡히지 않는다.
export function setCumulative(goalId, amount) {
  const goal = findGoal(goalId);
  if (!goal) return null;
  const value = Math.max(0, Math.round(amount) || 0);
  if (goal.total > 0) {
    goal.round = Math.floor(value / goal.total) + 1;
    goal.progress = value % goal.total;
  } else {
    goal.round = 1;
    goal.progress = value;
  }
  markReplan([goal]);
  refreshToday();
  persist();
  return { round: goal.round, progress: goal.progress, total: goal.total };
}

export function applyWeekdayPreset(track, presetKey) {
  const data = getData();
  data.goals.forEach((g) => {
    if (g.archived || g.track !== track) return;
    const days = weekdaysForPreset(presetKey, track, g.subject, g.unit);
    if (days) g.weekdays = days;
  });
  markReplan(data.goals.filter((g) => g.track === track));
  refreshToday();
  persist();
}

// 삭제 대신 보관 처리해 지난 기록은 그대로 남긴다.
export function archiveGoal(goalId) {
  const goal = findGoal(goalId);
  if (!goal) return;
  goal.archived = true;
  refreshToday();
  persist();
}

export function addEntry(goalId, amount, date = appToday()) {
  const data = getData();
  const goal = findGoal(goalId);
  if (!goal || !(amount > 0)) return null;
  const entry = { id: uid(), goalId, date, amount, at: new Date().toISOString() };
  data.entries.push(entry);
  goal.progress += amount;
  const rolled = rollRounds(goal);
  persist();
  return { entry, rolled };
}

// 그날 입력한 기록을 최신 것부터 하나씩 취소한다(실수로 여러 번 눌렀을 때).
export function removeLastEntryOn(date) {
  const entries = getData().entries.filter((e) => e.date === date);
  if (!entries.length) return null;
  const last = entries.reduce((a, b) => (b.at >= a.at ? b : a));
  removeEntry(last.id);
  return last;
}

export function removeEntry(entryId) {
  const data = getData();
  const entry = data.entries.find((e) => e.id === entryId);
  if (!entry) return;
  data.entries = data.entries.filter((e) => e.id !== entryId);
  const goal = findGoal(entry.goalId);
  if (goal) {
    goal.progress -= entry.amount;
    while (goal.progress < 0 && goal.round > 1 && goal.total > 0) {
      goal.progress += goal.total;
      goal.round--;
    }
    goal.progress = Math.max(0, goal.progress);
  }
  persist();
}
