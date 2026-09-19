import { formatKoreanDate } from "../dates.js";
import { escapeHtml } from "./shared.js";
import { countUnit } from "../presets.js";

// 앱을 열 때 미달분이 있으면 이월/버림을 묻는 하단 시트. 밀린 날은 묶어서 한 번에 묻는다.
// 자동 계획 과목은 "이월"하면 그 주 남은 공부일에 나눠 얹고, 그 주에 다시 나눌 날이 없으면 묻지 않고
// 다음 주 계획에 자동 반영된다고만 알려 준다(자동 계획에는 "버림"이 없다).
export function renderSettleSheet(days, data) {
  const goalOf = (goalId) => data.goals.find((g) => g.id === goalId);
  const text = (s) => {
    const goal = goalOf(s.goalId);
    return goal ? `${escapeHtml(goal.subject)} ${s.amount}${escapeHtml(countUnit(goal.unit))}` : `삭제된 목표 ${s.amount}`;
  };
  const anyAuto = days.some((day) => day.shortfalls.some((s) => s.auto));

  return `<div class="sheet-backdrop">
    <form class="sheet" data-form="settle">
      <h3 class="sheet-title">미달분을 어떻게 할까요?</h3>
      <p class="hint">이월하면 목표를 넘겨 푼 양으로 오래된 순서부터 갚아요. 다 갚으면 그날 칸이 연한 초록으로 바뀌어요.</p>
      ${anyAuto ? `<p class="hint">자동 계획 과목은 이월하면 이번 주 남은 공부일에 나눠서 더해요. 이월하지 않으면 그날만 끝나고, 못 한 양은 다음 주 계획에 자동으로 반영돼요.</p>` : ""}
      ${days.length > 1 ? `<div class="form-inline settle-bulk">
        <button class="btn btn-secondary btn-sm" data-action="settle-all" data-value="carried" type="button">모두 이월</button>
        <button class="btn btn-secondary btn-sm" data-action="settle-all" data-value="dropped" type="button">모두 ${anyAuto ? "이월 안 함" : "버림"}</button>
      </div>` : ""}
      <div class="sheet-list">${days
        .map((day) => {
          const asked = day.shortfalls.filter((s) => s.canCarry);
          const later = day.shortfalls.filter((s) => !s.canCarry);
          const skipLabel = asked.some((s) => s.auto) ? "이월 안 함" : "버림";
          return `<div class="settle-item">
            <div class="settle-date">${formatKoreanDate(day.date)}</div>
            <div class="settle-what">${asked.map(text).join(" · ")}</div>
            ${later.length ? `<div class="settle-what">${later.map(text).join(" · ")} — 이번 주에 다시 나눌 공부일이 없어 다음 주 계획에 자동 반영돼요</div>` : ""}
            <div class="seg">
              <label><input type="radio" name="d:${day.date}" value="carried" checked /><span>이월</span></label>
              <label><input type="radio" name="d:${day.date}" value="dropped" /><span>${skipLabel}</span></label>
            </div>
          </div>`;
        })
        .join("")}</div>
      <div class="form-inline">
        <button class="btn btn-primary" type="submit">확정</button>
        <button class="btn btn-secondary" data-action="close-sheet" type="button">나중에</button>
      </div>
    </form>
  </div>`;
}
