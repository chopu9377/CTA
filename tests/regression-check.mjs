// 실행: node tests/regression-check.mjs — 저축 중복 집계와 실제 휴일 변경 경로의 회귀 검사.
import assert from "node:assert/strict";
import { buildContext, weekQuotas, computeTargets, targetsFor } from "../js/stats.js";
import { bonusSpentSources, weekShip } from "../js/bonus.js";
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
check("부가세: 저축에 쓴 4문제를 다시 완료로 세지 않음", () => {
  assert.deepEqual(progress, { quota: 4, done: 0, rawDone: 4 });
  assert.equal(ctx.autoDebts.get("a|2026-10-07").left, 2);
  assert.equal(weekShip(vat, ctx, "2026-10-09").level, "behind");
  assert.equal(JSON.stringify(vat.entries), originalEntries);
});
check("주간 링·공부기록은 실제 기록도 표시", () => {
  const ring = weekQuotas(vat, ctx, 2, 2).rings[0];
  assert.equal(ring.pct, 0);
  assert.equal(ring.rawDone, 4);
  assert.match(renderWeek(vat, ctx, "2026-10-09", { bonusPick: false }), /실제 기록 4/);
  assert.match(renderHistory(vat, ctx, "2026-10-09"), /실제 기록 4/);
});
vat.entries.push({ id: "more", goalId: "a", date: "2026-10-09", amount: 4 });
({ ctx, progress } = accounting(vat));
check("남은 오늘 목표 2 + 이월 2를 풀면 쿼터와 이월이 함께 완료", () => {
  assert.deepEqual(progress, { quota: 4, done: 4, rawDone: 8 });
  assert.equal(ctx.autoDebts.get("a|2026-10-07").left, 0);
});
delete vat.bonusRest["2026-10-07"];
({ progress } = accounting(vat));
check("보상 휴식을 취소하면 사용한 실적이 돌아옴", () => assert.equal(progress.done, 8));

const older = fixture();
older.entries = [{ id: "old", goalId: "a", date: "2026-09-26", amount: 4 }, { id: "now", goalId: "a", date: "2026-10-09", amount: 2 }];
older.dayTargets["2026-10-09"] = { a: 2 };
({ ctx, progress } = accounting(older));
check("지난주 저축으로 쉰 경우 이번 주 실적은 차감하지 않음", () => {
  assert.deepEqual(progress, { quota: 2, done: 2, rawDone: 2 });
  assert.equal(bonusSpentSources(older, ctx).get("a|2026-09-26"), 4);
  assert.match(renderHistory(older, ctx, "2026-10-09"), /실제 기록 4/);
});
const repay = fixture();
repay.entries.unshift({ id: "old", goalId: "a", date: "2026-09-26", amount: 4 });
repay.dayTargets["2026-09-25"] = { a: 4 };
({ ctx } = accounting(repay));
check("이월 상환에 쓴 초과분을 저축 사용분으로 재사용하지 않음", () => {
  assert.equal(bonusSpentSources(repay, ctx).get("a|2026-09-26") || 0, 0);
  assert.equal(bonusSpentSources(repay, ctx).get("a|2026-10-06"), 4);
});
repay.goals[0].planMode = "fixed";
repay.carries = [{ id: "carry", goalId: "a", fromDate: "2026-09-25", amount: 4 }];
({ ctx } = accounting(repay));
check("고정 목표 이월 상환도 저축 사용분과 분리", () => {
  assert.equal(ctx.remaining.get("carry"), 0);
  assert.equal(bonusSpentSources(repay, ctx).get("a|2026-10-06"), 4);
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
console.log(`\n${checks}개 모두 통과`);
