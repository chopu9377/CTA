import { addDays, todayStr } from "./dates.js";
import { bumpVersion } from "./version.js";
import { computeTargets, dayReport, buildContext } from "./stats.js";
import {
  DEFAULT_START_DATE,
  DEFAULT_FIRST_TRACK_START,
  GOAL_PRESETS,
  SUBJECT_COLOR_SLOTS,
  SERIES_SLOTS,
  UNSET_CUSTOM_COLOR,
  DEFAULT_WEEKDAY_HOURS,
  DEFAULT_WEEKEND_HOURS,
  DEFAULT_BUFFER_DAYS,
  defaultTargets,
  defaultMinutesPerUnit,
  defaultMaintenance,
  weekdaysForPreset
} from "./presets.js";

// v2는 목표 단위를 시간(분)에서 수량으로 바꾼 개편판이라 저장 키를 새로 쓴다.
// 이전 버전 키는 건드리지 않고 그대로 남겨둔다(설정에서 JSON으로 내보낼 수 있음).
const STORAGE_KEY = "cta-data-v2";
const LEGACY_KEY = "cta-study-tracker-data";
const SCHEMA_VERSION = 2;
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const DAWN_KEY = "cta-dawn";
const DAWN_CUTOFF_HOUR = 7; // 자정~이 시각 전까지는 새벽 공부로 보고, 어제 목표가 안 끝났으면 여전히 "어제"로 친다
const DAWN_DONE_STATUSES = ["full", "carried", "bonus", "rest", "review", "none"];

let cache = null;

export function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

let changeListener = null;

// 동기화 모듈이 "사용자가 바꾼 것"을 알 수 있게 하는 알림. 하루 스냅샷 같은 자동 저장은 quiet로 저장한다.
export function setChangeListener(fn) {
  changeListener = fn;
}

export function persist({ quiet = false } = {}) {
  bumpVersion();
  if (!quiet) cache.meta.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  if (!quiet && changeListener) changeListener();
}

export function ensureColor(data, name) {
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

export function newGoal(track, subject, unit) {
  return {
    id: uid(),
    track,
    subject,
    unit,
    weekdayTarget: defaultTargets(unit).weekday,
    weekendTarget: defaultTargets(unit).weekend,
    minutesPerUnit: defaultMinutesPerUnit(unit),
    maintWeekdayTarget: defaultMaintenance(unit).weekday,
    maintWeekendTarget: defaultMaintenance(unit).weekend,
    weekdays: [...ALL_WEEKDAYS],
    total: 0,
    round: 1,
    progress: 0,
    targetRounds: 0,
    archived: false,
    // 새 목표는 자동 계획이 기본. 시험일·총 분량·목표 회독이 비어 있는 동안에는 알아서 고정 목표를 쓴다.
    planMode: "auto",
    // newGoal은 최초 데이터 생성(getData 안) 경로에서도 호출되므로 appToday()(=getData 재진입) 대신 순수 달력 날짜를 쓴다
    autoFrom: todayStr() > DEFAULT_START_DATE ? todayStr() : DEFAULT_START_DATE,
    replanFrom: null
  };
}

function emptyData() {
  const data = {
    schemaVersion: SCHEMA_VERSION,
    startDate: DEFAULT_START_DATE,
    trackSwitches: [{ from: DEFAULT_START_DATE, track: 2 }],
    tracks: {
      1: { examDate: null, examEstimated: true, activeFrom: DEFAULT_FIRST_TRACK_START, maintain: false },
      2: { examDate: null, examEstimated: true, activeFrom: null, maintain: true }
    },
    goals: [],
    entries: [],
    dayKinds: {},
    dayTargets: {},
    bonusRest: {},
    settlements: {},
    carries: [],
    chapters: [],
    exams: { 1: [], 2: [] },
    subjectColors: {},
    settings: {
      holidayAutoRest: false,
      weekdayHours: DEFAULT_WEEKDAY_HOURS,
      weekendHours: DEFAULT_WEEKEND_HOURS,
      bufferDays: DEFAULT_BUFFER_DAYS
    },
    meta: { lastBackupAt: null, updatedAt: null }
  };
  Object.assign(data.subjectColors, SUBJECT_COLOR_SLOTS);
  [2, 1].forEach((track) =>
    GOAL_PRESETS[track].forEach(([subject, unit]) => {
      const goal = newGoal(track, subject, unit);
      goal.weekdays = weekdaysForPreset("recommended", track, subject, unit) || goal.weekdays;
      data.goals.push(goal);
    })
  );
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
  data.bonusRest = Object.fromEntries(Object.entries(data.bonusRest || {}).filter(([, m]) => Number.isFinite(m) && m > 0));
  data.carries = Array.isArray(data.carries) ? data.carries : [];
  data.chapters = (Array.isArray(data.chapters) ? data.chapters : [])
    .filter((c) => c && c.id && c.subject)
    .map((c) => ({ id: c.id, track: c.track === 1 ? 1 : 2, subject: c.subject, title: c.title || "", images: Array.isArray(c.images) ? c.images : [] }));
  data.exams = data.exams || {};
  [1, 2].forEach((t) => {
    data.exams[t] = Array.isArray(data.exams[t]) ? data.exams[t] : [];
  });
  data.settings = { ...base.settings, ...(data.settings || {}) };
  data.meta = { lastBackupAt: null, updatedAt: null, ...(data.meta || {}) };
  data.goals.forEach((g) => {
    g.weekdays = Array.isArray(g.weekdays) ? g.weekdays : [...ALL_WEEKDAYS];
    g.total = g.total || 0;
    g.round = g.round || 1;
    g.progress = g.progress || 0;
    g.targetRounds = g.targetRounds || 0;
    // 옛 필드 dailyTarget(하루 한 값)을 평일/주말 두 값으로 이어받는다
    if (g.weekdayTarget === undefined) g.weekdayTarget = g.dailyTarget || 0;
    if (g.weekendTarget === undefined) g.weekendTarget = g.dailyTarget || 0;
    delete g.dailyTarget;
    g.minutesPerUnit = g.minutesPerUnit || defaultMinutesPerUnit(g.unit);
    if (g.maintWeekdayTarget === undefined) g.maintWeekdayTarget = defaultMaintenance(g.unit).weekday;
    if (g.maintWeekendTarget === undefined) g.maintWeekendTarget = defaultMaintenance(g.unit).weekend;
    g.archived = !!g.archived;
    g.planMode = g.planMode === "auto" ? "auto" : "fixed";
    g.autoFrom = g.planMode === "auto" && g.autoFrom ? g.autoFrom : null;
    g.replanFrom = g.planMode === "auto" && g.replanFrom ? g.replanFrom : null;
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

// 백업 불러오기/동기화로 통째로 교체할 때. 변경 알림은 보내지 않는다(불러온 데이터를 다시 올릴 필요 없음).
export function replaceData(parsed, { quiet = false } = {}) {
  cache = normalize(parsed);
  persist({ quiet });
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
  if (changed) persist({ quiet: true });
}

// 계획에 영향을 주는 변경(총 분량·요일·시험일·휴식일 등)을 한 날부터 자동 목표를 "그날 진도 기준으로 남은 요일에 다시 나눈다".
// 그 주 앞날들은 이미 굳었고, 못 한 양은 새 계획의 남은 분량에 들어간다.
export function markReplan(goals = getData().goals) {
  const today = appToday();
  goals.forEach((g) => {
    if (!g.archived && g.planMode === "auto") g.replanFrom = today;
  });
}

export function refreshToday() {
  bumpVersion();
  const data = getData();
  const today = appToday();
  data.dayTargets[today] = computeTargets(data, today);
}

export function findGoal(goalId) {
  return getData().goals.find((g) => g.id === goalId);
}

export function legacyDataJson() {
  return localStorage.getItem(LEGACY_KEY);
}

function readDawnChoice() {
  try {
    return JSON.parse(localStorage.getItem(DAWN_KEY));
  } catch (e) {
    return null;
  }
}

function writeDawnChoice(real, choice) {
  localStorage.setItem(DAWN_KEY, JSON.stringify({ real, choice }));
}

// 새벽 시간대(자정~DAWN_CUTOFF_HOUR)의 "오늘": 어제 목표가 아직 안 끝났으면 어제로 본다(새벽까지 이어간 공부 대응).
// 한 번 정해지면 그 새벽 동안은 고정된다(고른 뒤 기록을 더해도 안 바뀜) — toggle-dawn으로만 바꿀 수 있다.
export function appToday() {
  const real = todayStr();
  if (new Date().getHours() >= DAWN_CUTOFF_HOUR) return real;
  const saved = readDawnChoice();
  if (saved && saved.real === real) return saved.choice;
  const prev = addDays(real, -1);
  const data = getData();
  const status = dayReport(data, buildContext(data), prev, real).status;
  const resolved = DAWN_DONE_STATUSES.includes(status) ? real : prev;
  writeDawnChoice(real, resolved);
  return resolved;
}

// 새벽 배너에 보여줄 정보: 지금 어느 날짜로 기록 중이고, 바꾸면 어느 날짜가 되는지. 새벽이 아니면 null.
export function dawnInfo() {
  if (new Date().getHours() >= DAWN_CUTOFF_HOUR) return null;
  const real = todayStr();
  const prev = addDays(real, -1);
  const resolved = appToday();
  return { resolved, other: resolved === prev ? real : prev };
}

export function setDawnChoice(date) {
  writeDawnChoice(todayStr(), date);
}
