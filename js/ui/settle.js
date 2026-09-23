import { formatKoreanDate } from "../dates.js";
import { escapeHtml } from "./shared.js";
import { countUnit } from "../presets.js";

// 앱을 열 때 고정 목표의 미달분이 있으면 이월/버림을 묻는 하단 시트. 밀린 날은 묶어서 한 번에 묻는다.
// 자동 계획 과목은 묻지 않는다(그 주 안에서 더 푼 양으로 먼저 생긴 부족분부터 자동 소급, 주가 끝나면 다음 주 역산에 흡수).
export function renderSettleSheet(days, data) {
  const goalOf = (goalId) => data.goals.find((g) => g.id === goalId);
  const text = (s) => {
    const goal = goalOf(s.goalId);
    return goal ? `${escapeHtml(goal.subject)} ${s.amount}${escapeHtml(countUnit(goal.unit))}` : `삭제된 목표 ${s.amount}`;
  };

  return `<div class="sheet-backdrop">
    <form class="sheet" data-form="settle">
      <h3 class="sheet-title">미달분을 어떻게 할까요?</h3>
      <p class="hint">이월하면 목표를 넘겨 푼 양으로 오래된 순서부터 갚아요. 다 갚으면 그날 칸이 연한 초록으로 바뀌어요. 자동 계획 과목은 묻지 않고 그 주 안에서 자동으로 갚아요.</p>
      ${days.length > 1 ? `<div class="form-inline settle-bulk">
        <button class="btn btn-secondary btn-sm" data-action="settle-all" data-value="carried" type="button">모두 이월</button>
        <button class="btn btn-secondary btn-sm" data-action="settle-all" data-value="dropped" type="button">모두 버림</button>
      </div>` : ""}
      <div class="sheet-list">${days
        .map((day) => {
          const asked = day.shortfalls.filter((s) => s.canCarry);
          return `<div class="settle-item">
            <div class="settle-date">${formatKoreanDate(day.date)}</div>
            <div class="settle-what">${asked.map(text).join(" · ")}</div>
            <div class="seg">
              <label><input type="radio" name="d:${day.date}" value="carried" checked /><span>이월</span></label>
              <label><input type="radio" name="d:${day.date}" value="dropped" /><span>버림</span></label>
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
