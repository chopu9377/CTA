import { formatKoreanDate } from "../dates.js";
import { dayReport, isWeekendLike } from "../stats.js";
import { countUnit } from "../presets.js";
import { escapeHtml, subjectColor, formatDuration } from "./shared.js";

const STATUS_TEXT = {
  full: "당일 달성",
  carried: "이월 후 완료",
  partial: "부분 달성",
  pending: "이월 대기",
  miss: "미달",
  rest: "휴식일",
  review: "복습일",
  bonus: "보상 휴식",
  none: "목표 없는 날"
};

// 지난 날 칸을 탭했을 때: 그날 실제로 한 과목·양(휴식·복습일에 푼 것, 다른 트랙·지운 과목 기록도 포함)
export function dayInfoSheetHTML(data, ctx, date, today) {
  const report = dayReport(data, ctx, date, today);
  const targets = new Map(report.kind ? [] : report.rows.map((r) => [r.goal.id, r.target]));
  const rows = data.goals
    .map((goal) => ({ goal, done: ctx.sums.get(`${goal.id}|${date}`) || 0, target: targets.get(goal.id) || 0 }))
    .filter((r) => r.done > 0 || r.target > 0);
  const minutes = rows.reduce((sum, r) => sum + r.done * r.goal.minutesPerUnit, 0);
  const status = report.examTrack
    ? `${report.examTrack}차 시험일`
    : report.forcedReview
      ? `8421모드 복습일 [${report.forcedReview}]`
      : `${STATUS_TEXT[report.status] || ""}${report.half ? " · 🌗 절반 이상" : ""}`;
  const list = rows
    .map(({ goal, done, target }) => {
      const unit = escapeHtml(countUnit(goal.unit));
      const count = target > 0 ? `${done} / ${target}${unit}${done >= target ? " ✓" : ""}` : `${done}${unit}`;
      return `<div class="wk-row"><span class="wk-name"><i class="swatch" style="background:${subjectColor(data, goal.subject)}"></i>${escapeHtml(goal.subject)} <small>${escapeHtml(goal.unit)}</small></span><span class="wk-count">${count}</span></div>`;
    })
    .join("");
  const did = rows.some((r) => r.done > 0);
  return `<div class="sheet-backdrop"><div class="sheet">
    <h3 class="sheet-title">${formatKoreanDate(date)} 기록</h3>
    <p class="hint">${[status, report.holiday ? escapeHtml(report.holiday) : ""].filter(Boolean).join(" · ")}</p>
    <div class="sheet-list">
      ${list || `<p class="hint">이날은 기록이 없어요.</p>`}
      ${did ? `<div class="wk-total">공부한 시간 약 ${formatDuration(minutes)}</div>` : ""}
    </div>
    <div class="form-inline">
      <button class="btn btn-primary" data-action="close-sheet" type="button">닫기</button>
    </div>
  </div></div>`;
}

// 오늘·미래 칸을 탭했는데 그 주에 이미 휴식일이 있을 때: 그 휴식을 이 날로 옮길지, 하루 더 넣을지 고른다.
// 옮기면 그 주 공부일 수가 그대로라 주간 목표가 안 바뀌고, 더 넣으면 그날 과목이 뒤로 밀린다.
export function restSheetHTML(date, rests) {
  const mixed = rests.some((d) => isWeekendLike(d) !== isWeekendLike(date));
  return `<div class="sheet-backdrop"><div class="sheet">
    <h3 class="sheet-title">${formatKoreanDate(date)} 휴식</h3>
    <p class="hint">이 주에는 이미 휴식일이 있어요. 옮기면 주간 목표가 그대로이고, 하루 더 넣으면 그만큼이 다음 주부터 나뉘어 들어가요.${mixed ? " 평일과 주말은 공부 가능 시간이 달라서, 서로 옮기면 주간 목표가 조금 바뀌어요." : ""}</p>
    <div class="form-inline">
      ${rests.map((d) => `<button class="btn btn-primary" data-action="rest-move" data-from="${d}" data-date="${date}" type="button">${formatKoreanDate(d)} 휴식을 옮기기</button>`).join("")}
      <button class="btn btn-secondary" data-action="rest-add" data-date="${date}" type="button">하루 더 넣기</button>
      <button class="btn btn-secondary" data-action="close-sheet" type="button">닫기</button>
    </div>
  </div></div>`;
}
