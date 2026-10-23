// 실행: node tests/prepay-check.mjs — 미리 풀기(v66): 목표를 넘겨 푼 양이 부족분을 먼저 갚고, 남으면 같은 주 뒷날 목표를 채우는지.
import assert from "node:assert/strict";
import { buildContext, dayReport } from "../js/stats.js";
import { bonusSavings } from "../js/bonus.js";
import { bumpVersion } from "../js/version.js";

const TODAY = "2026-10-21";
// 그 주 목표는 스냅샷으로 고정(배치와 무관하게). 10/11 주는 규칙 적용 전 주, 10/18 주부터 적용.
function fixture(firstDay) {
  return {
    startDate: "2026-09-20", trackSwitches: [{ from: "2026-09-20", track: 2 }], layoutFrom: null,
    tracks: { 1: { examDate: null, activeFrom: null, maintain: false }, 2: { examDate: "2027-07-24", activeFrom: null, maintain: false } },
    settings: { weekdayHours: 4, weekendHours: 7, bufferDays: 30, holidayAutoRest: false },
    dayKinds: {}, carries: [], bonusRest: {}, postpones: {}, settlements: {},
    goals: [{ id: "a", track: 2, subject: "법인세", unit: "연습서 문제", weekdays: [0, 1, 2, 3, 4, 5, 6], daysPerWeek: 4, archived: false,
      weekdayTarget: 2, weekendTarget: 4, maintWeekdayTarget: 0, maintWeekendTarget: 0, minutesPerUnit: 20, total: 170, targetRounds: 3,
      round: 1, progress: 0, planMode: "auto", autoFrom: "2026-10-11", replanFrom: null }],
    dayTargets: {
      "2026-10-11": {}, "2026-10-12": { a: 2 }, "2026-10-13": { a: 3 }, "2026-10-14": {}, "2026-10-15": {}, "2026-10-16": {}, "2026-10-17": { a: 2 },
      "2026-10-18": {}, "2026-10-19": { a: 3 }, "2026-10-20": { a: 2 }, "2026-10-21": { a: 4 }, "2026-10-22": {}, "2026-10-23": { a: 1 }, "2026-10-24": {}
    },
    entries: [
      { id: "1", goalId: "a", date: "2026-10-12", amount: 5, at: "1" }, // 규칙 전 주: 3 초과
      { id: "2", goalId: "a", date: "2026-10-17", amount: 1, at: "2" }, // 부족 1
      { id: "3", goalId: "a", date: "2026-10-18", amount: firstDay, at: "3" } // 이번 주 첫날(목표 없음)에 푼 양
    ]
  };
}
const run = (firstDay) => {
  const data = fixture(firstDay);
  bumpVersion();
  const ctx = buildContext(data, TODAY);
  return { data, ctx, saved: bonusSavings(data, ctx, TODAY).byGoal.get("a")?.saved || 0 };
};
let checks = 0;
const check = (label, fn) => { fn(); checks++; console.log(`✓ ${label}`); };

// 첫날 7문제: 지난 부족분(10/13의 3, 10/17의 1)을 먼저 갚고 남은 3문제가 10/19를 채운다
let { data, ctx, saved } = run(7);
check("초과분은 지난 부족분을 먼저 갚고 남은 만큼 뒷날을 채움", () => {
  assert.equal(ctx.autoDebts.get("a|2026-10-13").left, 0);
  assert.equal(ctx.autoDebts.get("a|2026-10-17").left, 0);
  assert.equal(ctx.prepaid.get("a|2026-10-19"), 3);
  assert.equal(dayReport(data, ctx, "2026-10-19", TODAY).status, "full");
});
check("미리 푼 양이 바닥나면 그 뒤로는 평소처럼 부족분", () => {
  assert.equal(ctx.prepaid.get("a|2026-10-20"), undefined);
  assert.equal(ctx.autoDebts.get("a|2026-10-20").left, 2);
});
// 저축 = 초과분(10/12의 3 + 첫날 7) − 부족분 상환(4) − 뒷날 미리 채움(3). 10/12의 3은 규칙 전 주라 저축에 남는다
check("뒷날을 채운 양은 저축에 안 쌓임", () => assert.equal(saved, 3 + 7 - 4 - 3));

({ data, ctx, saved } = run(15));
check("오늘 목표도 미리 푼 양으로 채우면 달성", () => {
  assert.equal(ctx.prepaid.get("a|2026-10-21"), 4);
  assert.equal(dayReport(data, ctx, TODAY, TODAY).status, "full");
});
check("미래 날도 미리 채움(이번 주 안)", () => assert.equal(ctx.prepaid.get("a|2026-10-23"), 1));
check("이번 주를 다 채우고 남은 양만 저축", () => assert.equal(saved, 3 + 15 - 4 - (3 + 2 + 4 + 1)));

check("규칙 적용 전 주는 그대로(초과가 뒷날을 채우지 않음)", () => {
  assert.equal(ctx.prepaid.get("a|2026-10-13"), undefined);
  const old = fixture(0);
  old.entries.pop();
  bumpVersion();
  const c = buildContext(old, TODAY);
  assert.equal(c.prepaid.get("a|2026-10-13"), undefined);
  assert.equal(c.autoDebts.get("a|2026-10-13").left, 3);
});
console.log(`prepay-check: ${checks} checks passed`);
