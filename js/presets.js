export const DEFAULT_START_DATE = "2026-09-20";
export const DEFAULT_FIRST_TRACK_START = "2026-12-15";

export const TRACK_LABEL = { 1: "1차", 2: "2차" };

export const UNIT_SUGGESTIONS = ["연습서 문제", "객관식 문제", "인강(강)", "모의고사(회)"];

// 시험 점수 기록용 시험 과목 (학습 과목과 별개)
export const EXAM_SUBJECTS = {
  1: ["회계학", "세법학", "재정학", "행정소송법"],
  2: ["재무회계", "원가관리회계", "세무회계", "세법학"]
};

// [학습 과목, 단위]. 세부 과목 단위로 목표를 잡는다.
export const GOAL_PRESETS = {
  2: [
    ["재무회계", "연습서 문제"],
    ["원가관리회계", "연습서 문제"],
    ["법인세", "연습서 문제"],
    ["소득세", "연습서 문제"],
    ["부가세", "연습서 문제"],
    ["세법학", "인강(강)"],
    ["세법학", "연습서 문제"]
  ],
  1: [
    ["재무회계", "객관식 문제"],
    ["원가관리회계", "객관식 문제"],
    ["국세기본법", "인강(강)"],
    ["국세기본법", "객관식 문제"],
    ["법인세", "객관식 문제"],
    ["소득세", "객관식 문제"],
    ["부가세", "객관식 문제"],
    ["재정학", "객관식 문제"],
    ["행정소송법", "객관식 문제"]
  ]
};

// 과목 색은 이름 기준(같은 과목은 트랙과 상관없이 같은 색). 앞에서부터 series 슬롯 1..12를 배정.
export const SERIES_SLOTS = 12;
// 비슷한 색상(초록 계열 등)이 서로 붙지 않도록 슬롯을 직접 지정. 6·11·12번은 새 과목용 여유분.
export const SUBJECT_COLOR_SLOTS = {
  재무회계: 1,
  원가관리회계: 2,
  법인세: 3,
  소득세: 4,
  부가세: 5,
  세법학: 7,
  재정학: 8,
  행정소송법: 9,
  국세기본법: 10
};

export const UNSET_CUSTOM_COLOR = "#8a8a8a";

// 직장 병행: 평일/주말 공부 가능 시간은 권장량의 평일:주말 비율과 과부하 경고에 쓴다.
export const DEFAULT_WEEKDAY_HOURS = 4;
export const DEFAULT_WEEKEND_HOURS = 7;
export const DEFAULT_BUFFER_DAYS = 30;

// 하루 목표 기본값. 평일 4시간/주말 7시간(1:1.75)에 맞춰 문제는 평일 4·주말 6, 인강은 1강.
// 추천 조합 요일대로 하면 어느 날도 공부 가능 시간을 넘지 않는다(문제 20분, 인강 60분 기준).
export function defaultTargets(unit) {
  return unit.includes("강") ? { weekday: 1, weekend: 1 } : { weekday: 4, weekend: 6 };
}

// 유지 모드(다른 트랙 집중 중 가볍게 이어 가는 양) 기본값. 인강은 주말에 1강, 문제는 평일 1개/주말 2개.
// 유지 요일은 그 과목의 적용 요일을 따른다(요일 프리셋을 쓰면 하루 1~2과목만 닿는다).
export function defaultMaintenance(unit) {
  return unit.includes("강") ? { weekday: 0, weekend: 1 } : { weekday: 1, weekend: 2 };
}

// 숫자 뒤에 붙이는 단위 이름: 인강(강) → 강, 연습서/객관식 문제 → 문제, 모의고사(회) → 회
export function countUnit(unit) {
  if (unit.includes("강")) return "강";
  if (unit.includes("문제")) return "문제";
  const inParens = unit.match(/\(([^)]+)\)/);
  return inParens ? inParens[1] : unit;
}

export function defaultMinutesPerUnit(unit) {
  return unit.includes("강") ? 60 : 20;
}

// 요일 번호는 Date.getDay() 기준(0=일 … 6=토)
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const GROUP_A_DAYS = [1, 3, 5, 0];
const GROUP_B_DAYS = [2, 4, 6];

// 회계(재무·원가)끼리, 세무회계(법인·소득·부가)끼리 묶어서 번갈아 한다.
const ALTERNATE_GROUP = {
  2: { 재무회계: "A", 원가관리회계: "A", 법인세: "B", 소득세: "B", 부가세: "B" },
  1: { 재무회계: "A", 원가관리회계: "A", 법인세: "B", 소득세: "B", 부가세: "B", 세법학개론: "B" }
};

// 2차: 월·수·토 회계 / 화·목·일 세무회계 / 금은 세법학(가벼운 날). 세법학 인강은 회계·세무 날에 끼워 넣는다.
// 1차: 같은 골격에 금요일에 재정학·행정소송법·국세기본법 문제를 몰아서 한다.
const RECOMMENDED_DAYS = {
  2: {
    재무회계: [1, 3, 6],
    원가관리회계: [1, 3, 6],
    법인세: [2, 4, 0],
    소득세: [2, 4, 0],
    부가세: [2, 4, 0],
    세법학: [1, 3, 5, 6, 0]
  },
  1: {
    재무회계: [1, 3, 6],
    원가관리회계: [1, 3, 6],
    법인세: [2, 4, 0],
    소득세: [2, 4, 0],
    부가세: [2, 4, 0],
    세법학개론: [2, 4, 0],
    국세기본법: [1, 3],
    재정학: [5],
    행정소송법: [5, 6]
  }
};

// 세법학은 인강(매일 끼워 넣기)과 문제(금요일만)의 요일이 다르다.
const UNIT_OVERRIDE_DAYS = {
  2: { "세법학|문제": [5] },
  1: { "국세기본법|문제": [5] }
};

export const WEEKDAY_PRESETS = [
  { key: "daily", label: "매일 전 과목", desc: "시험이 임박했을 때처럼 모든 과목을 매일 봐요." },
  { key: "alternate", label: "격일 묶음", desc: "회계(재무·원가)와 세무회계(법인·소득·부가)를 A/B로 나눠 번갈아 해요(세법학 등은 매일)." },
  { key: "recommended", label: "추천 조합", desc: "회계 묶음(월·수·토)과 세무회계 묶음(화·목·일)을 번갈아, 금요일은 세법학. 주말엔 3과목 이상." }
];

// 프리셋이 모르는 과목(사용자가 직접 추가한 것)은 null → 요일을 건드리지 않는다.
export function weekdaysForPreset(key, track, subject, unit = "") {
  if (key === "daily") return [...ALL_DAYS];
  if (key === "alternate") {
    const group = ALTERNATE_GROUP[track][subject];
    if (group === "A") return [...GROUP_A_DAYS];
    if (group === "B") return [...GROUP_B_DAYS];
    return subject in RECOMMENDED_DAYS[track] ? [...ALL_DAYS] : null;
  }
  const override = !unit.includes("강") && UNIT_OVERRIDE_DAYS[track][`${subject}|문제`];
  if (override) return [...override];
  const days = RECOMMENDED_DAYS[track][subject];
  return days ? [...days] : null;
}
