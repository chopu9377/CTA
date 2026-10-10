import { formatKoreanDate } from "../dates.js";
import { dayReport } from "../stats.js";
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
