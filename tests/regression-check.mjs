// 실행: node tests/regression-check.mjs — 저축 사용의 달성 인정과 실제 휴일 변경 경로의 회귀 검사.
import assert from "node:assert/strict";
import { buildContext, weekQuotas, computeTargets, targetsFor, dayReport } from "../js/stats.js";
import { applyBonus, bonusSavings, weekShip } from "../js/bonus.js";
import { weekProgress } from "../js/weekplan.js";
import { weekLayout } from "../js/layout.js";
import { bumpVersion } from "../js/version.js";
import { addDays } from "../js/dates.js";
import { renderWeek } from "../js/ui/week.js";
import { renderHistory } from "../js/ui/history.js";

const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => memory.set(k, v)
};
const RealDate = Date;
const clock = new RealDate(2026, 9, 7, 12).getTime();
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
};
const store = await import("../js/store.js");
const storage = await import("../js/storage.js");

function fixture() {
  const dayTargets = {};
  for (let d = "2026-09-20"; d <= "2026-10-17"; d = addDays(d, 1)) dayTargets[d] = {};
  return {
    schemaVersion: 2, startDate: "2026-09-20",
    trackSwitches: [{ from: "2026-09-20", track: 2 }],
    tracks: { 1: { examDate: null, activeFrom: null, maintain: false }, 2: { examDate: "2027-07-24", activeFrom: null, maintain: false } },
    settings: { weekdayHours: 4, weekendHours: 7, bufferDays: 30, holidayAutoRest: false, layoutMode: "basic", autoSpreadDays: 60 },
    goals: [{ id: "a", track: 2, subject: "부가세", unit: "연습서 문제", weekdays: [0, 1, 2], daysPerWeek: 3,
      total: 200, targetRounds: 3, round: 1, progress: 4, archived: false, planMode: "auto",
      autoFrom: "2026-09-20", replanFrom: "2026-10-04", weekdayTarget: 1, weekendTarget: 2,
      minutesPerUnit: 20, maintWeekdayTarget: 0, maintWeekendTarget: 0 }],
    layoutFrom: "2026-10-04", layoutAt: "2026-10-04",
    dayKinds: { "2026-10-06": "rest" }, dayTargets, bonusRest: { "2026-10-07": { a: 4 } },
    entries: [{ id: "e", goalId: "a", date: "2026-10-06", amount: 4, at: "2026-10-06T12:00:00Z" }],
    carries: [], settlements: {}, subjectColors: { 부가세: 5 }, exams: { 1: [], 2: [] }, meta: { updatedAt: null }
  };
}
let checks = 0;
function check(label, fn) { fn(); checks++; console.log(`✓ ${label}`); }
function accounting(data, date = "2026-10-09") {
  bumpVersion();
  const ctx = buildContext(data, date);
  return { ctx, progress: weekProgress(data, ctx, data.goals[0], date) };
}

const vat = fixture();
vat.dayTargets["2026-10-07"] = { a: 2 };
vat.dayTargets["2026-10-09"] = { a: 2 };
const originalEntries = JSON.stringify(vat.entries);
let { ctx, progress } = accounting(vat);
check("저축을 써도 실제로 푼 4문제는 주간 실적에 그대로 남음", () => {
  assert.deepEqual(progress, { quota: 4, done: 4 });
  assert.equal(JSON.stringify(vat.entries), originalEntries);
  assert.equal(weekShip(vat, ctx, "2026-10-09").level, "cruise");
});
check("주간·공부기록 화면에서 실제 실적을 차감하지 않음", () => {
  assert.equal(weekQuotas(vat, ctx, 2, 2).rings[0].done, 4);
  assert.doesNotMatch(renderWeek(vat, ctx, "2026-10-09", { bonusPick: false, sec: {} }), /저축 사용|중복으로 세지/);
  assert.match(renderHistory(vat, ctx, "2026-10-09", { sec: {} }), /4 \/ 4/);
});
check("저축 사용은 목표를 채운 것으로 인정하되 누적 진도를 재가산하지 않음", () => {
  assert.deepEqual(applyBonus(vat, "2026-10-07", { a: 6 }), { a: 2 });
  assert.equal(vat.goals[0].progress, 4);
});
vat.entries.push({ id: "more", goalId: "a", date: "2026-10-09", amount: 4 });
({ ctx, progress } = accounting(vat));
check("추가로 푼 양도 전부 실제 실적에 포함", () => {
  assert.deepEqual(progress, { quota: 4, done: 8 });
  assert.equal(ctx.autoDebts.get("a|2026-10-07").left, 0);
});

const older = fixture();
older.entries = [{ id: "old", goalId: "a", date: "2026-09-26", amount: 4 }, { id: "now", goalId: "a", date: "2026-10-09", amount: 2 }];
older.dayTargets["2026-10-09"] = { a: 2 };
({ ctx, progress } = accounting(older));
check("지난주 미리 푼 저축으로 이번 주 목표를 채울 수 있음", () => {
  assert.deepEqual(progress, { quota: 2, done: 2 });
  assert.equal(dayReport(older, ctx, "2026-10-07", "2026-10-09").status, "bonus");
  assert.equal(weekProgress(older, ctx, older.goals[0], "2026-09-26").done, 4);
  assert.equal(older.entries[0].amount, 4);
});
const repay = fixture();
repay.entries.unshift({ id: "old", goalId: "a", date: "2026-09-26", amount: 4 });
repay.dayTargets["2026-09-25"] = { a: 4 };
repay.bonusRest["2026-10-07"] = { a: 2 };
({ ctx } = accounting(repay));
check("자동 이월을 갚고 남은 저축에서 사용량만 차감", () => {
  assert.equal(ctx.autoDebts.get("a|2026-09-25").left, 0);
  assert.equal(bonusSavings(repay, ctx, "2026-10-09").byGoal.get("a").saved, 2);
});
repay.goals[0].planMode = "fixed";
repay.carries = [{ id: "carry", goalId: "a", fromDate: "2026-09-25", amount: 4 }];
({ ctx } = accounting(repay));
check("고정 이월 상환과 저축 사용도 실제 실적을 삭제하지 않음", () => {
  assert.equal(ctx.remaining.get("carry"), 0);
  assert.equal(bonusSavings(repay, ctx, "2026-10-09").byGoal.get("a").saved, 2);
  assert.equal(weekProgress(repay, ctx, repay.goals[0], "2026-10-09").done, 4);
});

const planned = fixture();
planned.dayKinds = {}; planned.bonusRest = {}; planned.entries = [];
planned.goals = ["재무회계", "원가관리회계", "법인세", "소득세", "부가세", "세법학"].map((subject, i) => ({
  ...planned.goals[0], id: String(i), subject, progress: 0, total: 120 + i * 40
}));
planned.dayTargets = {};
bumpVersion();
for (let d = planned.startDate; d <= "2026-10-07"; d = addDays(d, 1)) planned.dayTargets[d] = computeTargets(planned, d);
store.replaceData(structuredClone(planned), { quiet: true });
const key = () => JSON.stringify([...weekLayout(storage.getData(), 2, "2026-10-04", "2026-10-07").byDate].sort());
const before = key();
const past = JSON.stringify(storage.getData().dayTargets);
storage.cycleDayKind("2026-10-09");
check("미래 휴일 변경은 오늘과 과거 목표를 보존", () => assert.equal(JSON.stringify(storage.getData().dayTargets), past));
// 백업/동기화로 데이터를 다시 불러와도 복구 기준이 남는지 확인.
store.replaceData(JSON.parse(storage.exportData()), { quiet: true });
storage.cycleDayKind("2026-10-09");
storage.cycleDayKind("2026-10-09");
check("실제 cycleDayKind 경로: 재실행 후 취소해도 원래 배치 복구", () => {
  assert.equal(key(), before);
  assert.equal(storage.getData().dayKindLayout, undefined);
});
storage.cycleDayKind("2026-10-07");
storage.cycleDayKind("2026-10-08");
storage.cycleDayKind("2026-10-07");
storage.cycleDayKind("2026-10-07");
check("여러 휴일 중 하나만 취소해도 다른 휴일은 보존", () => assert.equal(storage.getData().dayKinds["2026-10-08"], "rest"));
storage.cycleDayKind("2026-10-08");
storage.cycleDayKind("2026-10-08");
check("여러 휴일을 모두 취소하면 원래 배치 복구", () => assert.equal(key(), before));
storage.addEntry("0", 3);
const recorded = JSON.stringify(storage.getData().entries);
const cumulative = storage.getData().goals[0].progress;
storage.cycleDayKind("2026-10-07");
storage.cycleDayKind("2026-10-07");
storage.cycleDayKind("2026-10-07");
check("오늘 공부한 뒤 휴일을 지정·취소해도 입력과 진도 보존", () => {
  assert.equal(JSON.stringify(storage.getData().entries), recorded);
  assert.equal(storage.getData().goals[0].progress, cumulative);
  assert.equal(key(), before);
});
storage.cycleDayKind("2026-10-09");
storage.updateGoal("0", { total: 999 });
check("중간에 목표량을 수정하면 예전 복구 기준 폐기", () => assert.equal(storage.getData().dayKindLayout, undefined));
storage.cycleDayKind("2026-10-09");
storage.cycleDayKind("2026-10-09");
check("휴일 취소가 새 목표 설정을 덮어쓰지 않음", () => assert.equal(storage.getData().goals[0].total, 999));
check("예전 형식 백업의 입력 기록도 보존", () => {
  store.replaceData(structuredClone(vat), { quiet: true });
  assert.deepEqual(storage.getData().entries, vat.entries);
  assert.equal(targetsFor(storage.getData(), "2026-10-07").a, 2);
});
// 주 중간에 계획 설정을 바꿔도 보상 휴식으로 줄여 둔 양은 그대로 인정한다.
store.replaceData(structuredClone(planned), { quiet: true });
const weekDays = Array.from({ length: 7 }, (_, i) => addDays("2026-10-04", i));
const layoutOf = () => weekLayout(storage.getData(), 2, "2026-10-04", "2026-10-07").byDate;
const weekSums = () => Object.fromEntries(storage.getData().goals.map((g) => [g.id, weekDays.reduce((s, d) => s + ((layoutOf().get(d) || {})[g.id] || 0), 0)]));
const sumsBefore = weekSums();
const spent = { ...layoutOf().get("2026-10-08") };
storage.setBonusRest("2026-10-08", spent);
storage.setSetting("holidayAutoRest", true);
storage.setSetting("holidayAutoRest", false);
check("설정을 건드려도 이번 주 양은 그대로이고 저축으로 줄인 양이 다른 날에 다시 생기지 않음", () => {
  assert.ok(Object.keys(spent).length > 0);
  assert.deepEqual(weekSums(), sumsBefore);
  Object.entries(spent).forEach(([id, n]) => assert.ok((layoutOf().get("2026-10-08")[id] || 0) >= n));
});
storage.setSetting("layoutMode", "deep");
storage.setSetting("weekendHours", 8);
check("다시 섞여도 보상 휴식일의 양이 줄여 둔 양보다 적어지지 않음", () => {
  const day = layoutOf().get("2026-10-08");
  Object.entries(spent).forEach(([id, n]) => assert.ok((day[id] || 0) >= n, `${id}: ${day[id] || 0} < ${n}`));
});
console.log(`\n${checks}개 모두 통과`);
