import { addDays } from "./dates.js";
import { getData, persist, uid, refreshToday, replaceData, findGoal, markReplan, appToday } from "./store.js";
import { isAutoGoal, canRedistribute } from "./weekplan.js";

// app.js는 저장 관련 함수를 모두 이 파일에서 가져온다(핵심은 store.js, 목표·기록 변경은 goals.js).
export { getData, freezeDayTargets, legacyDataJson, appToday, dawnInfo, setDawnChoice } from "./store.js";
export * from "./goals.js";
export * from "./chapters.js";

// null → 휴식 → 복습 → null 순환. 복습일은 한 주(startDate 기준 7일)에 하루만 허용.
export function cycleDayKind(dateStr) {
  const data = getData();
  const current = data.dayKinds[dateStr] || null;
  let next;
  if (current === null) next = "rest";
  else if (current === "rest") next = hasReviewInWeek(data, dateStr) ? null : "review";
  else next = null;
  if (next) data.dayKinds[dateStr] = next;
  else delete data.dayKinds[dateStr];
  // 이번 주 안의 휴식/복습 변경만 이번 주 계획을 다시 나눈다(다른 주는 그 주가 시작될 때 반영된다)
  if (weekOf(data, dateStr) === weekOf(data, appToday())) markReplan();
  if (dateStr <= appToday() || weekOf(data, dateStr) === weekOf(data, appToday())) refreshToday();
  persist();
  return { next, blockedReview: current === "rest" && next === null };
}

function weekOf(data, dateStr) {
  return Math.floor((new Date(dateStr) - new Date(data.startDate)) / 86400000 / 7);
}

function hasReviewInWeek(data, dateStr) {
  const index = Math.floor((new Date(dateStr) - new Date(data.startDate)) / 86400000 / 7);
  const start = addDays(data.startDate, index * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i)).some((d) => data.dayKinds[d] === "review");
}

// 보상 휴식: 그날 목표에서 minutes(분)만큼을 쉰다. 0이면 취소. 오늘이면 오늘 목표 스냅샷도 다시 만든다.
export function setBonusRest(dateStr, minutes) {
  const data = getData();
  if (minutes > 0) data.bonusRest[dateStr] = minutes;
  else delete data.bonusRest[dateStr];
  if (dateStr <= appToday()) refreshToday();
  persist();
}

// 고정 목표의 이월은 이후 초과분으로 갚는다. 자동 계획 목표의 이월은 같은 주 남은 공부일에 나눠 얹고(redistribute),
// 다시 나눌 날이 없으면 아무것도 만들지 않는다(다음 주 계획에 자동 반영).
export function settleDay(dateStr, decision, shortfalls) {
  const data = getData();
  const today = appToday();
  data.settlements[dateStr] = decision;
  if (decision === "carried") {
    shortfalls.forEach((s) => {
      const goal = findGoal(s.goalId);
      if (goal && isAutoGoal(data, goal)) {
        if (canRedistribute(data, goal, dateStr, today)) {
          data.carries.push({ id: uid(), goalId: s.goalId, fromDate: dateStr, atDate: today, amount: s.amount, redistribute: true });
        }
      } else {
        data.carries.push({ id: uid(), goalId: s.goalId, fromDate: dateStr, amount: s.amount });
      }
    });
  }
  refreshToday();
  persist();
}

export function setTrackInfo(track, patch) {
  const data = getData();
  Object.assign(data.tracks[track], patch);
  if (["examDate", "activeFrom", "maintain"].some((k) => k in patch)) {
    markReplan();
    refreshToday();
  }
  persist();
}

export function setActiveTrack(track) {
  const data = getData();
  const today = appToday();
  data.trackSwitches = data.trackSwitches.filter((s) => s.from !== today);
  data.trackSwitches.push({ from: today, track });
  markReplan();
  refreshToday();
  persist();
}

export function setSetting(key, value) {
  const data = getData();
  data.settings[key] = value;
  if (["weekdayHours", "weekendHours", "bufferDays", "holidayAutoRest"].includes(key)) {
    markReplan();
    refreshToday();
  }
  persist();
}

export function setSubjectColor(name, color) {
  const data = getData();
  data.subjectColors[name] = color;
  persist();
}

export function addExamRecord(track, { date, label, scores }) {
  const data = getData();
  data.exams[track].push({ id: uid(), date, label: label || "", scores });
  data.exams[track].sort((a, b) => a.date.localeCompare(b.date));
  persist();
}

export function deleteExamRecord(track, recordId) {
  const data = getData();
  data.exams[track] = data.exams[track].filter((r) => r.id !== recordId);
  persist();
}

export function exportData() {
  return JSON.stringify(getData(), null, 2);
}

export function importData(json) {
  const parsed = JSON.parse(json);
  if (!parsed || !Array.isArray(parsed.goals) || !Array.isArray(parsed.entries)) {
    throw new Error("이 버전의 백업 파일이 아니에요. (이전 버전 백업은 불러올 수 없어요)");
  }
  replaceData(parsed);
}

export function markBackup() {
  const data = getData();
  data.meta.lastBackupAt = new Date().toISOString();
  persist();
}
