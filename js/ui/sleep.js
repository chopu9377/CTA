import { formatKoreanDate, addDays } from "../dates.js";
import { escapeHtml } from "./shared.js";

// 수면 계획 팝업(v81): data.sleepPlan{ 그날 밤 날짜: { bed, wake, note? } }가 있는 날, 앱을 열면 하루 한 번 띄운다(기기별로 닫은 날을 기억).
// 새벽 루틴 시차 적응 주간처럼 잠깐 쓰는 용도라 저장 데이터로만 넣는다.
export function sleepPopupHTML(day, plan) {
  return `<div class="sheet-backdrop"><div class="sheet sleep-sheet">
    <h3 class="sheet-title">🌙 오늘 밤 수면 계획</h3>
    <p class="sleep-line">오늘 ${escapeHtml(formatKoreanDate(day))} <b>${escapeHtml(plan.bed)}</b>에 자서<br>내일 ${escapeHtml(formatKoreanDate(addDays(day, 1)))} <b>${escapeHtml(plan.wake)}</b>에 일어나세요! ⏰</p>
    ${plan.note ? `<p class="hint">${escapeHtml(plan.note)}</p>` : ""}
    <div class="form-inline"><button class="btn btn-primary" data-action="close-sleep" type="button">알겠어요</button></div>
  </div></div>`;
}
