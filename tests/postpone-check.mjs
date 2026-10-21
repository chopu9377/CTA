// 실행: node tests/postpone-check.mjs — 내일로 넘기기(postpones)의 회귀 검사.
// 넘긴 날은 줄고 받는 날은 늘며, 주간 양은 그대로이고, 휴식을 바꿔도 두 번 세지 않는다.
import assert from "node:assert/strict";
import { addDays } from "../js/dates.js";

const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) };
const RealDate = Date;
const clock = new RealDate(2026, 9, 7, 12).getTime(); // 2026-10-07 수
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
};
const { buildContext, targetsFor, dayReport } = await import("../js/stats.js");
const { weekProgress } = await import("../js/weekplan.js");
const { postponeDest, postponeLimits } = await import("../js/postpone.js");
const { bumpVersion } = await import("../js/version.js");

const TODAY = "2026-10-07";
function fixture() {
  const goal = (id, subject) => ({ id, track: 2, subject, unit: "연습서 문제", weekdays: [0, 1, 2, 3, 4, 5, 6], daysPerWeek: 7,
    total: 300, targetRounds: 3, round: 1, progress: 0, archived: false, planMode: "auto", autoFrom: "2026-09-20", replanFrom: null,
    weekdayTarget: 1, weekendTarget: 2, minutesPerUnit: 20, maintWeekdayTarget: 0, maintWeekendTarget: 0 });
  return {
    schemaVersion: 2, startDate: "2026-09-20", trackSwitches: [{ from: "2026-09-20", track: 2 }],
    tracks: { 1: { examDate: null, activeFrom: null, maintain: false }, 2: { examDate: "2027-07-24", activeFrom: null, maintain: false } },
    settings: { weekdayHours: 4, weekendHours: 7, bufferDays: 30, holidayAutoRest: false, layoutMode: "basic", autoSpreadDays: 0 },
    goals: [goal("a", "법인세"), goal("b", "소득세")], layoutFrom: "2026-10-04", layoutAt: "2026-10-04",
    dayKinds: {}, dayTargets: {}, bonusRest: {}, postpones: {}, entries: [], carries: [], settlements: {},
    subjectColors: { 법인세: 1, 소득세: 2 }, exams: { 1: [], 2: [] }, meta: { updatedAt: null }
  };
}

const storage = await import("../js/storage.js");
const { replaceData } = await import("../js/store.js");

// 시나리오마다 같은 처음 데이터에서 시작한다(store.js 캐시를 통째로 교체).
async function scenario(steps) {
  replaceData(fixture(), { quiet: true });
  storage.freezeDayTargets(TODAY);
  const data = storage.getData();
  steps(storage, data);
  bumpVersion();
  return JSON.parse(JSON.stringify(data));
}
const week = Array.from({ length: 7 }, (_, i) => addDays("2026-10-04", i));
const quotas = (data) => {
  bumpVersion();
  const ctx = buildContext(data, TODAY);
  return data.goals.map((g) => weekProgress(data, ctx, g, TODAY).quota);
};
// 배치 캐시는 데이터 버전만 보므로 다른 시나리오 데이터를 읽기 전에 버전을 올린다
const tf = (data, d) => { bumpVersion(); return targetsFor(data, d); };
let checks = 0;
const check = (label, fn) => { fn(); checks++; console.log(`✓ ${label}`); };

const base = await scenario(() => {});
const t0 = tf(base, TODAY);
const goalId = Object.keys(t0).find((id) => t0[id] >= 1);
const n = Math.min(1, t0[goalId]);
const dest = postponeDest(base, TODAY);

const moved = await scenario((s, data) => {
  s.setPostpone(TODAY, { [goalId]: n });
  Object.entries(tf(data, TODAY)).forEach(([id, amt]) => s.addEntry(id, amt, TODAY));
});
check("넘긴 날은 그만큼 목표가 줄고, 남은 걸 다 하면 달성", () => {
  assert.equal((tf(moved, TODAY)[goalId] || 0), t0[goalId] - n);
  bumpVersion();
  assert.equal(dayReport(moved, buildContext(moved, TODAY), TODAY, TODAY).status, "full");
});
check("받는 날(같은 주 다음 공부일)은 그만큼 목표가 늘어남", () => {
  assert.equal(postponeDest(moved, TODAY), dest);
  assert.equal(tf(moved, dest)[goalId] || 0, (tf(base, dest)[goalId] || 0) + n);
});
check("주간 목표량은 그대로", () => assert.deepEqual(quotas(moved), quotas(base)));

const restBase = await scenario((s) => s.cycleDayKind(dest));
const restMoved = await scenario((s) => { s.setPostpone(TODAY, { [goalId]: n }); s.cycleDayKind(dest); });
check("받을 날을 휴식으로 바꾸면 그다음 공부일로 가고, 주간 양을 두 번 세지 않음", () => {
  const next = postponeDest(restMoved, TODAY);
  assert.ok(next > dest);
  assert.deepEqual(quotas(restMoved), quotas(restBase));
  assert.equal(tf(restMoved, next)[goalId] || 0, (tf(restBase, next)[goalId] || 0) + n);
});

const allRest = await scenario((s) => {
  s.setPostpone(TODAY, { [goalId]: n });
  week.filter((d) => d > TODAY).forEach((d) => s.cycleDayKind(d));
});
check("남은 날이 다 휴식이 되면 넘기기가 취소되고 오늘 목표가 돌아옴", () => {
  assert.equal(allRest.postpones[TODAY], undefined);
  assert.equal(tf(allRest, TODAY)[goalId], t0[goalId]);
});

check("넘겨받은 양은 다시 못 넘김(한 번만)", () => {
  const incoming = 2;
  const limits = postponeLimits({ ...moved, postpones: {} }, dest, { [goalId]: 5 }, {});
  assert.equal(limits[goalId].max, 5);
  const withIn = { ...moved, postpones: { [TODAY]: { [goalId]: incoming } } };
  const lim = postponeLimits(withIn, dest, { [goalId]: 5 }, {});
  assert.equal(lim[goalId].incoming, incoming);
  assert.equal(lim[goalId].max, 5 - incoming);
});

check("휴식일 지정한 날은 넘기기가 없음(오늘 휴식이면 취소)", () => {
  const data = { ...moved, dayKinds: { [TODAY]: "rest" } };
  assert.deepEqual(tf({ ...data, dayTargets: {} }, TODAY), {});
});
console.log(`postpone-check: ${checks} checks passed`);
