// 운동일 빼기(v71) 검증. 실행: node tests/workout-skip-check.mjs
// 운동일(화·목)을 뺀 과목은 여러 주 동안 화·목에 놓이지 않고, 고정 과목은 주 N일을 그대로 채우며, 자동 과목은 주간 양이 그대로다.
import assert from "node:assert/strict";
import { weekLayout } from "../js/layout.js";
import { autoWeekTotal, isAutoGoal } from "../js/weekplan.js";
import { addDays, todayStr, weekdayOf } from "../js/dates.js";

const today = todayStr();
const goal = (id, subject, unit, extra) => ({
  id, track: 2, subject, unit, weekdays: [0, 1, 2, 3, 4, 5, 6], daysPerWeek: 3, archived: false,
  weekdayTarget: 1, weekendTarget: 1, maintWeekdayTarget: 0, maintWeekendTarget: 0,
  minutesPerUnit: unit.includes("강") ? 60 : 20, total: 400, targetRounds: 2, round: 1, progress: 0,
  planMode: "auto", autoFrom: "2026-09-20", replanFrom: null, skipWorkout: false, ...extra
});
const data = {
  startDate: "2026-09-20", trackSwitches: [{ from: "2026-09-20", track: 2 }], layoutFrom: null,
  tracks: { 1: { examDate: null, activeFrom: null, maintain: false }, 2: { examDate: "2027-08-29", activeFrom: null, maintain: false } },
  settings: { weekdayHours: 4, weekendHours: 7, bufferDays: 30, holidayAutoRest: false, workouts: [{ from: "2026-09-20", days: [2, 4], hours: 1 }] },
  dayKinds: {}, dayTargets: {}, entries: [], carries: [], bonusRest: {}, settlements: {},
  goals: [
    goal("a", "재무회계", "연습서 문제", { total: 500, daysPerWeek: 4 }),
    goal("c", "법인세", "연습서 문제", { daysPerWeek: 4, skipWorkout: true }),
    goal("d", "소득세", "연습서 문제", { total: 300 }),
    goal("s", "세법학", "인강(강)", { planMode: "fixed", autoFrom: null, daysPerWeek: 5, skipWorkout: true })
  ]
};

let checks = 0;
const check = (label, fn) => { fn(); checks++; console.log(`✓ ${label}`); };
const weeks = Array.from({ length: 12 }, (_, w) => addDays(data.startDate, w * 7));
const daysOf = (layout, id) => [...layout.byDate.entries()].filter(([, t]) => (t[id] || 0) > 0).map(([d]) => d);

check("운동일 빼기 과목(고정 인강·자동 법인세)은 화·목에 놓이지 않음", () => {
  weeks.forEach((ws) => {
    const layout = weekLayout(data, 2, ws, today);
    ["s", "c"].forEach((id) => daysOf(layout, id).forEach((d) => assert.ok(![2, 4].includes(weekdayOf(d)), `${id} ${d}`)));
  });
});
check("고정 인강은 매주 운동일 아닌 5일(일·월·수·금·토)에 1강씩", () => {
  weeks.forEach((ws) => {
    const days = daysOf(weekLayout(data, 2, ws, today), "s").map(weekdayOf).sort();
    assert.deepEqual(days, [0, 1, 3, 5, 6], ws);
  });
});
check("자동 과목은 운동일을 빼도 주간 양이 그대로", () => {
  weeks.forEach((ws) => {
    const layout = weekLayout(data, 2, ws, today);
    data.goals.filter((g) => isAutoGoal(data, g)).forEach((g) => {
      const sum = [...layout.byDate.values()].reduce((s, t) => s + (t[g.id] || 0), 0);
      assert.equal(sum, autoWeekTotal(data, g, ws, today).total, `${g.subject} ${ws}`);
    });
  });
});
check("빼지 않은 과목은 운동일에도 놓일 수 있음", () => {
  const any = weeks.some((ws) => daysOf(weekLayout(data, 2, ws, today), "a").some((d) => [2, 4].includes(weekdayOf(d))) ||
    daysOf(weekLayout(data, 2, ws, today), "d").some((d) => [2, 4].includes(weekdayOf(d))));
  assert.ok(any);
});
console.log(`\n${checks}개 통과`);
