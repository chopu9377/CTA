// 자동 과목 주간 소급 검증(개발용). 실행: node tests/carry-check.mjs
// 그 주 안에서 목표를 넘겨 푼 양(휴식일 포함)이 먼저 생긴 부족분부터 갚고, 주가 끝나면 남은 부족분은 소급되지 않는지 확인한다.
import { buildContext, dayReport } from "../js/stats.js";
import { bonusSavings } from "../js/bonus.js";
import { bumpVersion } from "../js/version.js";

const failures = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

// 2026-09-27(일) ~ 10-03(토) 주. 지난 날 목표는 스냅샷으로 고정해 배치와 무관하게 만든다.
const data = {
  startDate: "2026-09-20", trackSwitches: [{ from: "2026-09-20", track: 2 }], layoutFrom: null,
  tracks: { 1: { examDate: null, activeFrom: null, maintain: false }, 2: { examDate: "2027-07-24", activeFrom: null, maintain: false } },
  settings: { weekdayHours: 4, weekendHours: 7, bufferDays: 30, holidayAutoRest: false },
  dayKinds: { "2026-09-30": "rest" }, carries: [], bonusRest: {}, settlements: {},
  goals: [{ id: "a", track: 2, subject: "소득세", unit: "연습서 문제", weekdays: [0, 1, 2, 3, 4, 5, 6], daysPerWeek: 3, archived: false,
    weekdayTarget: 2, weekendTarget: 4, maintWeekdayTarget: 0, maintWeekendTarget: 0, minutesPerUnit: 20, total: 76, targetRounds: 3,
    round: 1, progress: 0, planMode: "auto", autoFrom: "2026-09-20", replanFrom: null }],
  dayTargets: { "2026-09-27": { a: 4 }, "2026-09-28": {}, "2026-09-29": { a: 4 }, "2026-09-30": {}, "2026-10-01": {} },
  entries: [
    { id: "1", goalId: "a", date: "2026-09-27", amount: 1, at: "1" }, // 부족 3
    { id: "2", goalId: "a", date: "2026-09-29", amount: 2, at: "2" }, // 부족 2
    { id: "3", goalId: "a", date: "2026-09-30", amount: 4, at: "3" } // 휴식일에 4 → 9/27의 3을 먼저, 9/29의 1을 갚음
  ]
};

let today = "2026-10-01";
let ctx = buildContext(data, today);
const debt = (d) => ctx.autoDebts.get(`a|${d}`);
check(debt("2026-09-27")?.left === 0, "휴식일 초과분이 가장 먼저 생긴 부족분(9/27)을 먼저 갚음", JSON.stringify(debt("2026-09-27")));
check(debt("2026-09-29")?.left === 1, "남은 초과분은 다음 부족분(9/29)으로", JSON.stringify(debt("2026-09-29")));
check(dayReport(data, ctx, "2026-09-27", today).status === "carried", "9/27 칸: 이월 후 완료");
check(dayReport(data, ctx, "2026-09-29", today).status === "pending", "9/29 칸: 이월 대기(주가 안 끝남)");
check(!dayReport(data, ctx, "2026-09-29", today).undecided, "자동 과목은 이월/버림을 묻지 않음");
check(bonusSavings(data, ctx, today).rawMin === 0, "소급에 쓴 초과분은 휴식 저축에 안 쌓임", `${bonusSavings(data, ctx, today).rawMin}분`);

// 오늘(목표 0) 1개 더 → 9/29도 다 갚음
data.entries.push({ id: "4", goalId: "a", date: "2026-10-01", amount: 1, at: "4" });
bumpVersion();
ctx = buildContext(data, today);
check(dayReport(data, ctx, "2026-09-29", today).status === "carried", "오늘 더 풀면 9/29도 이월 후 완료");

// 주 중간에 다시 나눠도(오늘 휴식 지정 등 → replanFrom = 오늘) 그 전 날 부족분은 이월 대기로 남는다
data.goals[0].replanFrom = today;
bumpVersion();
ctx = buildContext(data, today);
check(debt("2026-09-29")?.amount === 2 && debt("2026-09-29")?.open, "다시 나눈 뒤에도 9/29 부족분이 소급 대상에 남음", JSON.stringify(debt("2026-09-29")));
check(dayReport(data, ctx, "2026-09-29", today).status === "carried", "다시 나눈 뒤에도 9/29는 이월 후 완료 유지");
data.goals[0].replanFrom = null;

// 주가 끝난 뒤: 남은 부족분은 소급되지 않고 미달로 굳는다
data.entries = data.entries.filter((e) => e.id !== "4");
data.entries.push({ id: "5", goalId: "a", date: "2026-10-05", amount: 9, at: "5" });
data.dayTargets["2026-10-02"] = {};
data.dayTargets["2026-10-03"] = {};
data.dayTargets["2026-10-04"] = {};
data.dayTargets["2026-10-05"] = {};
today = "2026-10-05";
bumpVersion();
ctx = buildContext(data, today);
check(debt("2026-09-29")?.left === 1 && debt("2026-09-29")?.open === false, "다음 주 초과분으로는 지난주 부족분을 안 갚음");
check(dayReport(data, ctx, "2026-09-29", today).status === "partial", "주가 끝나면 9/29 칸은 부분(다음 주 역산에 흡수)");

// 과목별 저축: 10/5 목표 0인 날 9개 → 그 과목 저축 9개(상한 7시간 = 21개). 그 과목에 4개 쓰면 5개 남음
const saved = () => bonusSavings(data, ctx, today).byGoal.get("a")?.saved || 0;
check(saved() === 9, "목표 없는 날 초과분이 그 과목 저축으로", `${saved()}개`);
data.bonusRest["2026-10-06"] = { a: 4 };
bumpVersion();
ctx = buildContext(data, today);
check(saved() === 5, "그 과목에 쓴 만큼만 그 과목 저축에서 빠짐", `${saved()}개`);
data.bonusRest["2026-10-06"] = { other: 3 };
bumpVersion();
ctx = buildContext(data, today);
check(saved() === 9, "다른 과목 사용 기록은 이 과목 저축에 영향 없음", `${saved()}개`);

console.log(failures.length ? `\n실패 ${failures.length}개` : "\n모두 통과");
process.exit(failures.length ? 1 : 0);
