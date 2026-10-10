import { addDays } from "./dates.js";
import { getData, persist, uid, refreshToday, replaceData, markReplan, appToday } from "./store.js";

// app.js는 저장 관련 함수를 모두 이 파일에서 가져온다(핵심은 store.js, 목표·기록 변경은 goals.js).
export { getData, freezeDayTargets, legacyDataJson, appToday, dawnInfo, setDawnChoice, isLightDay, setLightDay } from "./store.js";
export * from "./goals.js";

// 휴식일 변경의 공통 경로(dates: 바뀌는 날짜들, apply: dayKinds를 실제로 바꾸는 함수).
function changeDayKinds(dates, apply) {
  const data = getData();
  const today = appToday();
  const inWeek = dates.filter((d) => weekOf(data, d) === weekOf(data, today)).sort();
  const weekKinds = () => Object.fromEntries(Object.entries(data.dayKinds)
    .filter(([d]) => weekOf(data, d) === weekOf(data, today)).sort(([a], [b]) => a.localeCompare(b)));
  // 같은 날 휴식을 넣었다 취소하면 변경 전 시드로 돌아간다.
  // 데이터에 남겨 재실행·다른 기기에서도 같은 복구가 되게 한다.
  if (inWeek.length && data.dayKindLayout?.today !== today) {
    data.dayKindLayout = { today, kinds: weekKinds(), from: data.layoutFrom, at: data.layoutAt };
  }
  apply(data);
  // 이번 주 안의 휴식 변경만 이번 주 계획을 다시 나눈다(다른 주는 그 주가 시작될 때 반영된다).
  // 내일 이후 날을 바꾸면 오늘 과목은 그대로 두고 내일부터만 다시 섞는다
  if (inWeek.length) {
    const saved = data.dayKindLayout;
    if (JSON.stringify(weekKinds()) === JSON.stringify(saved.kinds)) {
      data.layoutFrom = saved.from;
      data.layoutAt = saved.at;
      delete data.dayKindLayout;
    } else markReplan(inWeek[0] > today ? addDays(today, 1) : today, { amounts: false });
  }
  if (inWeek.length || dates.some((d) => d <= today)) refreshToday();
  persist();
}

// null → 휴식 → null. 직접 지정하는 복습일은 없앴다(v58) — 예전에 지정해 둔 복습일은 탭하면 해제된다.
export function cycleDayKind(dateStr) {
  let next = null;
  changeDayKinds([dateStr], (data) => {
    next = data.dayKinds[dateStr] ? null : "rest";
    if (next) data.dayKinds[dateStr] = next;
    else delete data.dayKinds[dateStr];
  });
  return { next };
}

// 휴식을 하루 더 넣는 대신 자리를 옮긴다. 같은 주 평일끼리 옮기면 주간 목표는 그대로다(공부일 가중치가 같다).
export function moveRestDay(fromDate, toDate) {
  changeDayKinds([fromDate, toDate], (data) => {
    delete data.dayKinds[fromDate];
    data.dayKinds[toDate] = "rest";
  });
}

// 그 날과 같은 주에 있고 아직 지나지 않은 휴식일(옮길 수 있는 것)
export function movableRestDays(dateStr) {
  const data = getData();
  const today = appToday();
  return Object.keys(data.dayKinds)
    .filter((d) => data.dayKinds[d] === "rest" && d !== dateStr && d >= today && weekOf(data, d) === weekOf(data, dateStr))
    .sort();
}

function weekOf(data, dateStr) {
  return Math.floor((new Date(dateStr) - new Date(data.startDate)) / 86400000 / 7);
}

// 보상 휴식: 그날 목표 중 고른 과목({ 목표id: 줄인 양 })만큼을 쉰다. 빈 값이면 취소. 오늘이면 오늘 목표 스냅샷도 다시 만든다.
export function setBonusRest(dateStr, amounts) {
  const data = getData();
  const cleaned = Object.fromEntries(Object.entries(amounts || {}).filter(([, n]) => Number.isFinite(n) && n > 0));
  if (Object.keys(cleaned).length) data.bonusRest[dateStr] = cleaned;
  else delete data.bonusRest[dateStr];
  if (dateStr <= appToday()) refreshToday();
  persist();
}

// 고정 목표의 이월은 이후 초과분으로 갚는다. 자동 계획·채우기 목표는 묻지 않는다(자동은 그 주 안에서 자동 소급, 채우기는 이월 없음).
export function settleDay(dateStr, decision, shortfalls) {
  const data = getData();
  data.settlements[dateStr] = decision;
  if (decision === "carried") {
    shortfalls
      .filter((s) => s.canCarry)
      .forEach((s) => data.carries.push({ id: uid(), goalId: s.goalId, fromDate: dateStr, amount: s.amount }));
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
  if (["weekdayHours", "weekendHours", "bufferDays", "holidayAutoRest", "layoutMode", "autoSpreadDays"].includes(key)) {
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
