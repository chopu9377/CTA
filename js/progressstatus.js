// 진도율 탭 과목 상태(🐢🚗🚀). 순수 계산이라 저장하는 값은 없다.
// 자동·채우기 과목은 앱이 매주 시험일 기준으로 다시 나누므로 "최근 속도가 계속되면 언제 끝나나"는 의미가 없다
// (목표가 낮았던 주가 느린 것처럼 보인다). 대신 아직 못 갚은 양이 남은 주들로 나뉘어 주간 필요량을 몇 % 늘렸는지 본다.
// 고정 과목은 다시 나눠 주지 않으니 지금 속도로 끝나는 날(planPreview의 실제 페이스)을 그대로 쓴다.
import { addDays, diffDays } from "./dates.js";
import { planPreview, weekCarries, weekQuota, weekStartOf } from "./weekplan.js";
import { studiesTrackOn, workLeft } from "./plan.js";

export const DEBT_ALERT_PCT = 10; // 밀린 양이 주간 필요량을 이만큼(%) 늘리면 🐢
const RECENT_WEEKS = 2;

// 아직 못 갚은 부족분(나중 초과분으로 갚은 만큼은 빠진다)
function unpaidOf(ctx, goal) {
  let sum = 0;
  ctx.autoDebts.forEach((x, key) => {
    if (key.startsWith(`${goal.id}|`) && x.left > 0) sum += x.left;
  });
  return sum;
}

// 끝난 최근 2주의 목표/한 양
function recentWeeks(data, ctx, goal, today) {
  const thisWeek = weekStartOf(data, today);
  let quota = 0;
  let done = 0;
  for (let i = RECENT_WEEKS; i >= 1; i--) {
    const ws = addDays(thisWeek, -7 * i);
    if (ws < data.startDate) continue;
    const dates = Array.from({ length: 7 }, (_, k) => addDays(ws, k));
    quota += weekQuota(data, ctx.sums, goal, dates);
    done += dates.reduce((sum, d) => sum + (ctx.sums.get(`${goal.id}|${d}`) || 0), 0);
  }
  return { quota, done };
}

// level: done / behind / cruise / ahead. kind: carry(자동·채우기) / fixed. 입력이 부족하면 null.
export function goalStatus(data, ctx, goal, today) {
  const preview = planPreview(data, goal, today);
  if (!preview) return null;
  if (preview.status.level === "done") return { level: "done" };

  const planLevel = ["danger", "late"].includes(preview.status.level) ? "behind" : preview.status.level === "ahead" ? "ahead" : "cruise";
  // 아직 시작 전인 트랙(1차 집중 기간 전)은 밀린 양이 있을 수 없어 계획만으로 판단하고 상자는 띄우지 않는다
  if (preview.upcoming) return { kind: "upcoming", level: planLevel };
  if (!weekCarries(data, goal)) {
    const finish = preview.actual?.state === "ok" ? preview.actual.projected : preview.plannedFinish;
    return { kind: "fixed", level: planLevel, finish, endDate: preview.endDate };
  }

  const info = data.tracks[goal.track];
  const from = preview.upcoming ? info.activeFrom : today;
  let days = 0;
  for (let d = from; d < preview.endDate; d = addDays(d, 1)) if (studiesTrackOn(data, goal.track, d, today)) days++;
  const weeks = days / 7;
  const unpaid = unpaidOf(ctx, goal);
  const recent = recentWeeks(data, ctx, goal, today);
  if (weeks <= 0) return { kind: "carry", level: unpaid > 0 ? "behind" : "cruise", unpaid, perWeek: unpaid, pct: unpaid > 0 ? 100 : 0, recent };

  const weekNeed = (workLeft(goal) || 0) / weeks;
  const perWeek = unpaid / weeks;
  const pct = weekNeed > 0 ? (perWeek / weekNeed) * 100 : 0;
  const ahead = unpaid === 0 && recent.done > recent.quota ? recent.done - recent.quota : 0;
  const level = pct >= DEBT_ALERT_PCT ? "behind" : ahead > 0 ? "ahead" : "cruise";
  return { kind: "carry", level, unpaid, perWeek, pct, recent, ahead };
}

// 고정 과목 게이지: 오늘~마감 중 완료 예상일이 어디쯤인지(%)와 여유 주 수
export function fixedTimeline(status, today) {
  const span = diffDays(today, status.endDate);
  if (!status.finish || span <= 0) return null;
  const pos = Math.max(0, Math.min(100, (diffDays(today, status.finish) / span) * 100));
  return { pos, spareWeeks: Math.round(diffDays(status.finish, status.endDate) / 7) };
}
