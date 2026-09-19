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

export function defaultTarget(unit) {
  return unit.includes("강") ? 1 : 5;
}

export function defaultMinutesPerUnit(unit) {
  return unit.includes("강") ? 60 : 20;
}

// 요일 번호는 Date.getDay() 기준(0=일 … 6=토)
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const GROUP_A_DAYS = [1, 3, 5, 0];
const GROUP_B_DAYS = [2, 4, 6];

const ALTERNATE_GROUP = {
  2: { 재무회계: "A", 법인세: "A", 원가관리회계: "B", 소득세: "B", 부가세: "B" },
  1: { 재무회계: "A", 법인세: "A", 재정학: "A", 원가관리회계: "B", 소득세: "B", 부가세: "B", 행정소송법: "B" }
};

const RECOMMENDED_DAYS = {
  2: { 재무회계: [1, 3, 6], 원가관리회계: [2, 4, 6], 법인세: [2, 6], 소득세: [4, 0], 부가세: [5, 0], 세법학: [1, 3, 5, 0] },
  1: { 재무회계: [1, 3, 6], 원가관리회계: [2, 4, 6], 국세기본법: [1, 3, 5, 0], 법인세: [2, 6], 소득세: [4, 0], 부가세: [5, 0], 재정학: [1, 3, 5], 행정소송법: [2, 4, 0] }
};

export const WEEKDAY_PRESETS = [
  { key: "daily", label: "매일 전 과목", desc: "시험이 임박했을 때처럼 모든 과목을 매일 봐요." },
  { key: "alternate", label: "격일 묶음", desc: "과목을 A/B 두 묶음으로 나눠 번갈아 해요(세법학 등은 매일)." },
  { key: "recommended", label: "추천 조합", desc: "하루 2과목 안팎 + 세법학을 자주. 주말엔 3과목 이상." }
];

// 프리셋이 모르는 과목(사용자가 직접 추가한 것)은 null → 요일을 건드리지 않는다.
export function weekdaysForPreset(key, track, subject) {
  if (key === "daily") return [...ALL_DAYS];
  if (key === "alternate") {
    const group = ALTERNATE_GROUP[track][subject];
    if (group === "A") return [...GROUP_A_DAYS];
    if (group === "B") return [...GROUP_B_DAYS];
    return subject in RECOMMENDED_DAYS[track] ? [...ALL_DAYS] : null;
  }
  const days = RECOMMENDED_DAYS[track][subject];
  return days ? [...days] : null;
}
