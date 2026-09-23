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

// 새로 시작하는 기본 목표의 주 N일은 예전 추천 조합 요일의 개수를 따른다(요일 자체는 매주 랜덤 배치가 정한다).
// 요일 번호는 Date.getDay() 기준(0=일 … 6=토). weekdays 필드는 옛 버전 호환용으로 함께 채운다.
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

export const DEFAULT_DAYS_PER_WEEK = 3;

// 하루 구성 모드. basic: 과목별 주 N일 / deep(진득): 매일 회계 하나 + 세무회계 하나를 묵직하게 / spread(물붓기): 자동 과목을 매일 조금씩
export const LAYOUT_MODES = [
  { key: "basic", label: "기본", desc: "과목마다 주 N일, 요일은 매주 랜덤" },
  { key: "deep", label: "진득", desc: "매일 회계(재무·원가) 하나 + 세무회계(법인·소득·부가) 하나를 묵직하게. 세법학 등 나머지는 주 N일 그대로" },
  { key: "spread", label: "물붓기", desc: "자동 과목을 모든 공부일에 조금씩(시험 직전 감 유지용). 고정·채우기 과목은 그대로" }
];
export const DEFAULT_AUTO_SPREAD_DAYS = 60;

// 진득 모드에서 하루에 하나씩 고르는 과목 묶음(과목 이름 기준). 여기 없는 과목은 주 N일 그대로 따로 배치한다.
export const DEEP_GROUPS = {
  acc: ["재무회계", "원가관리회계"],
  tax: ["법인세", "소득세", "부가세"]
};

export function deepGroupOf(subject) {
  return Object.keys(DEEP_GROUPS).find((key) => DEEP_GROUPS[key].includes(subject)) || null;
}

// 기본 목표가 아닌 과목(사용자가 직접 추가한 것)은 null
export function recommendedWeekdays(track, subject, unit = "") {
  const override = !unit.includes("강") && UNIT_OVERRIDE_DAYS[track][`${subject}|문제`];
  if (override) return [...override];
  const days = RECOMMENDED_DAYS[track][subject];
  return days ? [...days] : null;
}
