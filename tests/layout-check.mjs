// 주간 랜덤 배치 검증(개발용, 앱에서는 불러오지 않는다). 실행: node tests/layout-check.mjs
// 가상의 2차 데이터로 여러 주를 돌려 규칙(주간 합계·3일 공백·연속 겹침·채우기 상한·결정성·휴식 재배치·보상 휴식 고정)을 확인한다.
import { weekLayout, layoutOn, LAYOUT_RULES } from "../js/layout.js";
import { autoWeekTotal, weekStartOf, isAutoGoal } from "../js/weekplan.js";
import { computeTargets } from "../js/stats.js";
import { limitMinutes } from "../js/plan.js";
import { bumpVersion } from "../js/version.js";
import { addDays, diffDays, todayStr } from "../js/dates.js";

const WEEKS = 44;
const failures = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
};
const sorted = (o) => JSON.stringify(Object.fromEntries(Object.entries(o || {}).sort()));
const fmt = (m) => `${Math.floor(m / 60)}시간 ${String(Math.round(m % 60)).padStart(2, "0")}분`;

const today = todayStr();
const goal = (id, subject, unit, extra) => ({
  id, track: 2, subject, unit, weekdays: [0, 1, 2, 3, 4, 5, 6], daysPerWeek: 3, archived: false,
  weekdayTarget: 4, weekendTarget: 6, maintWeekdayTarget: 1, maintWeekendTarget: 2,
  minutesPerUnit: unit.includes("강") ? 60 : 20, total: 400, targetRounds: 2, round: 1, progress: 0,
  planMode: "auto", autoFrom: "2026-09-20", replanFrom: null, ...extra
});
const data = {
  startDate: "2026-09-20", trackSwitches: [{ from: "2026-09-20", track: 2 }], layoutFrom: null,
  tracks: { 1: { examDate: null, activeFrom: null, maintain: false }, 2: { examDate: "2027-08-29", activeFrom: null, maintain: true } },
  settings: { weekdayHours: 4, weekendHours: 7, bufferDays: 30, holidayAutoRest: false },
  dayKinds: {}, dayTargets: {}, entries: [], carries: [], bonusRest: {}, settlements: {},
  goals: [
    goal("a", "재무회계", "연습서 문제", { total: 500 }),
    goal("b", "원가관리회계", "연습서 문제", { total: 250 }),
    goal("c", "법인세", "연습서 문제"),
    goal("d", "소득세", "연습서 문제", { total: 300 }),
    goal("e", "부가세", "연습서 문제", { total: 150, daysPerWeek: 2 }),
    goal("f", "세법학", "인강(강)", { planMode: "fill", total: 60, targetRounds: 1, autoFrom: null }),
    goal("h", "세법학", "연습서 문제", { total: 200, daysPerWeek: 1 })
  ]
};
const byId = new Map(data.goals.map((g) => [g.id, g]));
const fillIds = new Set(data.goals.filter((g) => g.planMode === "fill").map((g) => g.id));

// 1) 여러 주 배치 통계
const t0 = performance.now();
let mismatch = 0, fillOver = 0, fillOverLimit = 0, pairs = 0, overlapHigh = 0;
const gaps = [];
const lastStudy = {};
let prevSet = null, devSum = 0, devN = 0, maxDev = 0;
for (let w = 0; w < WEEKS; w++) {
  const ws = addDays(data.startDate, w * 7);
  const layout = weekLayout(data, 2, ws, today);
  data.goals.filter((g) => isAutoGoal(data, g)).forEach((g) => {
    const sum = [...layout.byDate.values()].reduce((s, t) => s + (t[g.id] || 0), 0);
    if (sum !== autoWeekTotal(data, g, ws, today).total) mismatch++;
  });
  const loads = [];
  const limits = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const t = layout.byDate.get(d) || {};
    let minutes = 0;
    let fillMinutes = 0;
    Object.entries(t).forEach(([id, n]) => {
      const m = n * byId.get(id).minutesPerUnit;
      minutes += m;
      if (fillIds.has(id)) {
        fillMinutes += m;
        if (n > LAYOUT_RULES.fillPerDay) fillOver++;
      }
    });
    if (fillMinutes && minutes > limitMinutes(data, d)) fillOverLimit++;
    loads.push(minutes - fillMinutes);
    limits.push(limitMinutes(data, d));
    const set = Object.keys(t).filter((id) => !fillIds.has(id) && t[id] > 0);
    set.forEach((id) => {
      if (lastStudy[id] && byId.get(id).daysPerWeek >= 2 && diffDays(lastStudy[id], d) - 1 > LAYOUT_RULES.maxGap) gaps.push(`${id} ${lastStudy[id]}→${d}`);
      lastStudy[id] = d;
    });
    if (prevSet && prevSet.length && set.length) {
      pairs++;
      const inter = set.filter((id) => prevSet.includes(id)).length;
      if (inter / Math.max(set.length, prevSet.length) >= LAYOUT_RULES.overlapLimit) overlapHigh++;
    }
    prevSet = set;
  }
  // 막판 주는 "앞으로 진도 0" 가정 때문에 양이 몰리므로 균형 통계는 앞 16주만 본다
  if (w < 16) {
    const total = loads.reduce((a, b) => a + b, 0);
    const sumLimit = limits.reduce((a, b) => a + b, 0);
    loads.forEach((l, i) => {
      const dev = Math.abs(l - (total * limits[i]) / sumLimit);
      devSum += dev;
      devN++;
      maxDev = Math.max(maxDev, dev);
    });
  }
}
const elapsed = performance.now() - t0;
check(mismatch === 0, "자동 과목 주간 합계 = 역산 필요량", `불일치 ${mismatch}건`);
check(gaps.length === 0, "과목 3일 넘게 비지 않기(주 2일 이상 과목)", gaps.slice(0, 3).join(", "));
check(overlapHigh / pairs < 0.1, "이틀 연속 2/3 이상 겹침 10% 미만", `${overlapHigh}/${pairs}`);
check(fillOver === 0 && fillOverLimit === 0, "채우기: 하루 최대 2개, 공부 가능 시간 안", `초과 ${fillOver}, 시간 넘김 ${fillOverLimit}`);
check(devSum / devN < 45, "요일 부하 편차 평균 45분 미만(앞 16주)", `평균 ${fmt(devSum / devN)}, 최대 ${fmt(maxDev)}`);
console.log(`  계산 시간 ${WEEKS}주: ${elapsed.toFixed(0)}ms`);

// 2) 결정성 · 기록 추가 후 불변
const cw = weekStartOf(data, today);
const snap = () => JSON.stringify([...weekLayout(data, 2, cw, today).byDate.entries()].map(([d, t]) => [d, sorted(t)]));
const first = snap();
bumpVersion();
check(snap() === first, "캐시를 비워도 같은 배치(결정성)");
data.entries.push({ id: "x1", goalId: "a", date: today, amount: 5, at: "t" });
byId.get("a").progress += 5;
bumpVersion();
check(snap() === first, "이번 주 기록을 추가해도 배치 불변");

// 3) 휴식 재배치: 오늘 이전 날을 스냅샷으로 굳힌 뒤 모레를 휴식으로
for (let d = cw; d <= today; d = addDays(d, 1)) data.dayTargets[d] = computeTargets(data, d);
bumpVersion();
const before = weekLayout(data, 2, cw, today);
const restDay = addDays(today, 2);
const restInWeek = restDay < addDays(cw, 7);
data.dayKinds[restDay] = "rest";
data.layoutFrom = today;
data.goals.forEach((g) => {
  if (g.planMode === "auto") g.replanFrom = today;
});
bumpVersion();
const after = weekLayout(data, 2, cw, today);
let pastSame = true;
for (let d = cw; d < today; d = addDays(d, 1)) if (sorted(before.byDate.get(d)) !== sorted(after.byDate.get(d))) pastSame = false;
check(pastSame, "휴식 지정: 지난 날 목표 불변");
check(!restInWeek || !Object.keys(after.byDate.get(restDay) || {}).length, "휴식 지정: 휴식일 목표 없음");
let remainOk = true;
data.goals.filter((g) => isAutoGoal(data, g)).forEach((g) => {
  let sum = 0;
  for (let d = today; d < addDays(cw, 7); d = addDays(d, 1)) sum += (after.byDate.get(d) || {})[g.id] || 0;
  if (sum !== autoWeekTotal(data, g, cw, today).total) remainOk = false;
});
check(remainOk, "휴식 지정: 남은 날 합계 = 새 필요량");
const layoutKey = (l) => JSON.stringify([...l.byDate.entries()].map(([d, t]) => [d, sorted(t)]));
const afterKey = layoutKey(after);
delete data.dayKinds[restDay];
bumpVersion();
const restoredKey = layoutKey(weekLayout(data, 2, cw, today));
data.dayKinds[restDay] = "rest";
bumpVersion();
check(layoutKey(weekLayout(data, 2, cw, today)) === afterKey, "휴식 풀었다 다시 지정 → 같은 재배치(결정성)");
check(!restInWeek || restoredKey !== afterKey, "휴식을 풀면 배치가 휴식 전으로 돌아감");
delete data.dayKinds[restDay];
bumpVersion();

// 4) 오늘 목표 = 배치
check(sorted(computeTargets(data, today)) === sorted(layoutOn(data, 2, today, today)), "computeTargets(오늘) = 배치");

// 5) 채우기 상한: 남은 강의가 3개면 다음 주 채우기 합계 ≤ 3
byId.get("f").progress = 57;
bumpVersion();
const next = addDays(cw, 7);
const fillSum = [...weekLayout(data, 2, next, today).byDate.values()].reduce((s, t) => s + (t.f || 0), 0);
check(fillSum <= 3, "채우기: 남은 강의 수까지만", `다음 주 합계 ${fillSum}`);

// 6) 보상 휴식 고정: 걸어 둔 과목은 그날에서 빠지지 않는다
const nextLayout = weekLayout(data, 2, next, today);
const [pinDay, pinTargets] = [...nextLayout.byDate.entries()].find(([, t]) => Object.keys(t).length);
const pinGoal = ["a", "b", "c", "d", "e"].find((id) => !(pinTargets[id] > 0)) || "a";
data.bonusRest[pinDay] = { [pinGoal]: 1 };
bumpVersion();
check((weekLayout(data, 2, next, today).byDate.get(pinDay)[pinGoal] || 0) > 0, "보상 휴식 과목 고정", `${pinGoal} @ ${pinDay}`);

// 7) 진득 모드: 매일 회계 하나 + 세무회계 하나(가끔 예외 허용), 주간 합계·3일 공백 유지
delete data.bonusRest[pinDay];
const ACC = ["a", "b"];
const TAX = ["c", "d", "e"];
function modeStats(mode) {
  data.settings.layoutMode = mode;
  bumpVersion();
  let days = 0, exact = 0, mism = 0, everyDay = 0, autoWeeks = 0;
  const gapsMode = [];
  const last = {};
  for (let w = 0; w < 16; w++) {
    const ws = addDays(data.startDate, w * 7);
    const layout = weekLayout(data, 2, ws, today);
    // 앞선 검증이 이번 주를 중간부터 다시 섞어 두었으므로 다시 섞인 날(anchor 이후)만 본다
    const seg = [...layout.byDate.entries()].filter(([d]) => d >= layout.anchor).sort();
    data.goals.filter((g) => isAutoGoal(data, g)).forEach((g) => {
      const placed = seg.filter(([, t]) => t[g.id] > 0).length;
      const total = autoWeekTotal(data, g, ws, today).total;
      const sum = seg.reduce((s, [, t]) => s + (t[g.id] || 0), 0);
      if (sum !== total) mism++;
      if (total > 0) {
        autoWeeks++;
        if (placed >= Math.min(total, seg.length)) everyDay++;
      }
    });
    if (process.env.SHOW && w < 3) console.log(mode, seg.map(([d, t]) => `${d.slice(5)}[${Object.entries(t).map(([id, n]) => id + n).join(",")}]`).join(" "));
    for (const [d, t] of seg) {
      const acc = ACC.filter((id) => t[id] > 0).length;
      const tax = TAX.filter((id) => t[id] > 0).length;
      days++;
      if (acc === 1 && tax === 1) exact++;
      [...ACC, ...TAX].forEach((id) => {
        if (!(t[id] > 0)) return;
        if (last[id] && diffDays(last[id], d) - 1 > LAYOUT_RULES.maxGap) gapsMode.push(`${id} ${last[id]}→${d}`);
        last[id] = d;
      });
    }
  }
  data.settings.layoutMode = "basic";
  bumpVersion();
  return { days, exact, mism, gapsMode, everyDay, autoWeeks };
}
const deep = modeStats("deep");
check(deep.mism === 0, "진득: 자동 과목 주간 합계 유지", `불일치 ${deep.mism}`);
// 이 테스트 데이터는 공부 가능 시간을 넘길 만큼 무거워 시간 균형 때문에 예외가 많다(실제 사용량에선 90%대)
check(deep.exact / deep.days >= 0.55, "진득: 하루 회계 1 + 세무 1인 날 55% 이상(과부하 데이터)", `${deep.exact}/${deep.days}일`);
check(deep.gapsMode.length === 0, "진득: 과목 3일 넘게 비지 않기", deep.gapsMode.slice(0, 3).join(", "));
const spread = modeStats("spread");
check(spread.mism === 0, "물붓기: 자동 과목 주간 합계 유지", `불일치 ${spread.mism}`);
check(spread.everyDay === spread.autoWeeks, "물붓기: 자동 과목이 모든 공부일에(양이 공부일보다 적으면 그 양만큼의 날)", `${spread.everyDay}/${spread.autoWeeks}`);

console.log(failures.length ? `\n실패 ${failures.length}개` : "\n모두 통과");
process.exit(failures.length ? 1 : 0);
