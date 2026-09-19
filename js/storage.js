import { addDays, todayStr } from "./dates.js";
import { computeTargets } from "./stats.js";
import {
  DEFAULT_START_DATE,
  DEFAULT_FIRST_TRACK_START,
  GOAL_PRESETS,
  SUBJECT_COLOR_SLOTS,
  SERIES_SLOTS,
  UNSET_CUSTOM_COLOR
} from "./presets.js";

// v2는 목표 단위를 시간(분)에서 수량으로 바꾼 개편판이라 저장 키를 새로 쓴다.
// 이전 버전 키는 건드리지 않고 그대로 남겨둔다(설정에서 JSON으로 내보낼 수 있음).
const STORAGE_KEY = "cta-data-v2";
const LEGACY_KEY = "cta-study-tracker-data";
const SCHEMA_VERSION = 2;
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

let cache = null;

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

function ensureColor(data, name) {
  if (data.subjectColors[name] !== undefined) return;
  const used = new Set(Object.values(data.subjectColors).filter((v) => typeof v === "number"));
  for (let slot = 1; slot <= SERIES_SLOTS; slot++) {
    if (!used.has(slot)) {
      data.subjectColors[name] = slot;
      return;
    }
  }
  data.subjectColors[name] = UNSET_CUSTOM_COLOR;
}

function defaultDailyTarget(unit) {
  return unit.includes("강") ? 1 : 5;
}

function newGoal(track, subject, unit) {
  return {
    id: uid(),
    track,
    subject,
    unit,
    dailyTarget: defaultDailyTarget(unit),
    weekdays: [...ALL_WEEKDAYS],
    total: 0,
    round: 1,
    progress: 0,
    targetRounds: 0,
    archived: false
  };
}

function emptyData() {
  const data = {
    schemaVersion: SCHEMA_VERSION,
    startDate: DEFAULT_START_DATE,
    trackSwitches: [{ from: DEFAULT_START_DATE, track: 2 }],
    tracks: {
      1: { examDate: null, examEstimated: true, activeFrom: DEFAULT_FIRST_TRACK_START },
      2: { examDate: null, examEstimated: true, activeFrom: null }
    },
    goals: [],
    entries: [],
    dayKinds: {},
    dayTargets: {},
    settlements: {},
    carries: [],
    exams: { 1: [], 2: [] },
    subjectColors: {},
    settings: { focusMode: false, holidayAutoRest: false },
    meta: { lastBackupAt: null }
  };
  Object.assign(data.subjectColors, SUBJECT_COLOR_SLOTS);
  [2, 1].forEach((track) => GOAL_PRESETS[track].forEach(([subject, unit]) => data.goals.push(newGoal(track, subject, unit))));
  return data;
}

// 누락된 필드는 기본값으로 채우고 기존 기록은 살린다. 읽을 수 없는 데이터일 때만 새로 시작.
function normalize(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.goals) || !Array.isArray(data.entries)) {
    return emptyData();
  }
  const base = emptyData();
  data.schemaVersion = SCHEMA_VERSION;
  data.startDate = data.startDate || base.startDate;
  data.trackSwitches = Array.isArray(data.trackSwitches) && data.trackSwitches.length ? data.trackSwitches : base.trackSwitches;
  data.tracks = data.tracks || {};
  [1, 2].forEach((t) => {
    data.tracks[t] = { ...base.tracks[t], ...(data.tracks[t] || {}) };
  });
  ["dayKinds", "dayTargets", "settlements", "subjectColors"].forEach((k) => {
    data[k] = data[k] && typeof data[k] === "object" ? data[k] : {};
  });
  data.carries = Array.isArray(data.carries) ? data.carries : [];
  data.exams = data.exams || {};
  [1, 2].forEach((t) => {
    data.exams[t] = Array.isArray(data.exams[t]) ? data.exams[t] : [];
  });
  data.settings = { ...base.settings, ...(data.settings || {}) };
  data.meta = { lastBackupAt: null, ...(data.meta || {}) };
  data.goals.forEach((g) => {
    g.weekdays = Array.isArray(g.weekdays) ? g.weekdays : [...ALL_WEEKDAYS];
    g.total = g.total || 0;
    g.round = g.round || 1;
    g.progress = g.progress || 0;
    g.targetRounds = g.targetRounds || 0;
    g.dailyTarget = g.dailyTarget || 0;
    g.archived = !!g.archived;
    ensureColor(data, g.subject);
  });
  return data;
}

export function getData() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = normalize(raw ? JSON.parse(raw) : null);
  } catch (e) {
    console.error("CTA: failed to load saved data, starting fresh", e);
    cache = emptyData();
  }
  return cache;
}

// 시작일부터 오늘까지 그날 목표를 고정(스냅샷)해둔다. 이후 목표를 바꿔도 지난 날 판정이 흔들리지 않게 하기 위함.
export function freezeDayTargets(today = todayStr()) {
  const data = getData();
  let changed = false;
  for (let d = data.startDate; d <= today; d = addDays(d, 1)) {
    if (!data.dayTargets[d]) {
      data.dayTargets[d] = computeTargets(data, d);
      changed = true;
    }
  }
  if (changed) persist();
}

function refreshToday() {
  const data = getData();
  const today = todayStr();
  data.dayTargets[today] = computeTargets(data, today);
}

function findGoal(goalId) {
  return getData().goals.find((g) => g.id === goalId);
}

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
  persist();
  return { round: goal.round, progress: goal.progress, total: goal.total };
}

// 삭제 대신 보관 처리해 지난 기록은 그대로 남긴다.
export function archiveGoal(goalId) {
  const goal = findGoal(goalId);
  if (!goal) return;
  goal.archived = true;
  refreshToday();
  persist();
}

export function addEntry(goalId, amount, date = todayStr()) {
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
  if (dateStr <= todayStr()) refreshToday();
  persist();
  return { next, blockedReview: current === "rest" && next === null };
}

function hasReviewInWeek(data, dateStr) {
  const index = Math.floor((new Date(dateStr) - new Date(data.startDate)) / 86400000 / 7);
  const start = addDays(data.startDate, index * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i)).some((d) => data.dayKinds[d] === "review");
}

export function settleDay(dateStr, decision, shortfalls) {
  const data = getData();
  data.settlements[dateStr] = decision;
  if (decision === "carried") {
    shortfalls.forEach((s) => data.carries.push({ id: uid(), goalId: s.goalId, fromDate: dateStr, amount: s.amount }));
  }
  persist();
}

export function setTrackInfo(track, patch) {
  const data = getData();
  Object.assign(data.tracks[track], patch);
  persist();
}

export function setActiveTrack(track) {
  const data = getData();
  const today = todayStr();
  data.trackSwitches = data.trackSwitches.filter((s) => s.from !== today);
  data.trackSwitches.push({ from: today, track });
  refreshToday();
  persist();
}

export function setSetting(key, value) {
  const data = getData();
  data.settings[key] = value;
  if (key === "holidayAutoRest") refreshToday();
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
  cache = normalize(parsed);
  persist();
}

export function markBackup() {
  const data = getData();
  data.meta.lastBackupAt = new Date().toISOString();
  persist();
}

export function legacyDataJson() {
  return localStorage.getItem(LEGACY_KEY);
}
