import { formatKoreanDate } from "../dates.js";
import { escapeHtml } from "./shared.js";
import { countUnit } from "../presets.js";

// 앱을 열 때 미달분이 있으면 이월/버림을 묻는 하단 시트. 밀린 날은 묶어서 한 번에 묻는다.
export function renderSettleSheet(days, data) {
  const nameOf = (goalId) => {
    const goal = data.goals.find((g) => g.id === goalId);
    return goal ? goal.subject : "삭제된 목표";
  };
  const unitOf = (goalId) => {
    const goal = data.goals.find((g) => g.id === goalId);
    return goal ? countUnit(goal.unit) : "";
  };

  return `<div class="sheet-backdrop">
    <form class="sheet" data-form="settle">
      <h3 class="sheet-title">미달분을 어떻게 할까요?</h3>
      <p class="hint">이월하면 목표를 넘겨 푼 양으로 오래된 순서부터 갚아요. 다 갚으면 그날 칸이 연한 초록으로 바뀌어요.</p>
      ${days.length > 1 ? `<div class="form-inline settle-bulk">
        <button class="btn btn-secondary btn-sm" data-action="settle-all" data-value="carried" type="button">모두 이월</button>
        <button class="btn btn-secondary btn-sm" data-action="settle-all" data-value="dropped" type="button">모두 버림</button>
      </div>` : ""}
      <div class="sheet-list">${days
        .map(
          (day) => `<div class="settle-item">
            <div class="settle-date">${formatKoreanDate(day.date)}</div>
            <div class="settle-what">${day.shortfalls.map((s) => `${escapeHtml(nameOf(s.goalId))} ${s.amount}${escapeHtml(unitOf(s.goalId))}`).join(" · ")}</div>
            <div class="seg">
              <label><input type="radio" name="d:${day.date}" value="carried" checked /><span>이월</span></label>
              <label><input type="radio" name="d:${day.date}" value="dropped" /><span>버림</span></label>
            </div>
          </div>`
        )
        .join("")}</div>
      <div class="form-inline">
        <button class="btn btn-primary" type="submit">확정</button>
        <button class="btn btn-secondary" data-action="close-sheet" type="button">나중에</button>
      </div>
    </form>
  </div>`;
}
