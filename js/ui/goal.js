import { formatMinutes, dailyPlanProgress } from "../stats.js";
import { escapeHtml, rateText, clampPct } from "./shared.js";

function dailyPlanFormHTML(data, planDate) {
  const plan = data.dailyPlans[planDate] || {};
  return `
    <form data-form="set-daily-plan" class="form">
      <label class="field"><span>날짜</span><input type="date" id="plan-date" name="planDate" value="${planDate}" /></label>
      ${data.subjects
        .map(
          (s) => `
        <label class="field">
          <span>${escapeHtml(s.name)} (시간)</span>
          <input type="number" name="alloc:${s.id}" min="0" step="0.5" value="${plan[s.id] ? plan[s.id] / 60 : ""}" placeholder="0" />
        </label>`
        )
        .join("")}
      <button class="btn btn-primary" type="submit">목표 저장</button>
    </form>
  `;
}

function dailyPlanProgressHTML(progress) {
  if (!progress.hasPlan) return `<p class="empty-state">이 날짜에는 아직 목표를 설정하지 않았어요.</p>`;
  return `
    <div class="mini-meter">
      <div class="mini-meter-label">전체 ${rateText(progress.totalRate)} · ${formatMinutes(progress.totalActual)} / ${formatMinutes(progress.totalGoal)}</div>
      <div class="meter-track"><div class="meter-fill" style="width:${clampPct(progress.totalRate)}%"></div></div>
    </div>
    <ul class="subject-stat-list">
      ${progress.perSubject
        .map(
          (p) => `
        <li class="subject-stat-row">
          <div class="subject-stat-header">
            <span class="subject-stat-name">${escapeHtml(p.name)}</span>
            <span>${formatMinutes(p.actual)} / ${formatMinutes(p.goal)}</span>
          </div>
          <div class="meter-track"><div class="meter-fill" style="width:${clampPct(p.rate)}%"></div></div>
        </li>`
        )
        .join("")}
    </ul>
  `;
}

export function renderGoal(data, planDate) {
  if (!data.subjects.length) {
    return `
      <section class="view">
        <div class="card">
          <h2 class="section-title">날짜별 목표 시간 배분</h2>
          <p class="empty-state">먼저 '과목' 탭에서 과목을 등록해주세요.</p>
        </div>
      </section>
    `;
  }

  const progress = dailyPlanProgress(data, planDate);

  return `
    <section class="view">
      <div class="card">
        <h2 class="section-title">날짜별 목표 시간 배분</h2>
        <p class="field-hint">그날 과목별로 공부할 시간을 미리 배분해두면, 하루 목표가 자동으로 계산돼요.</p>
        ${dailyPlanFormHTML(data, planDate)}
      </div>
      <div class="card">
        <h2 class="section-title">${planDate} 달성 현황</h2>
        ${dailyPlanProgressHTML(progress)}
      </div>
    </section>
  `;
}
