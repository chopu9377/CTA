import { formatMinutes, monthlyGoalFor } from "../stats.js";
import { escapeHtml, clampPct, roundBadgeText } from "./shared.js";

function subjectCardHTML(s) {
  const materialsHTML = s.materials.length
    ? `<ul class="list">${s.materials
        .map((m) => {
          const target = m.targetRounds || 0;
          const rounds = m.roundHistory.length;
          return `
          <li class="list-item material-item">
            <div class="material-main">
              <div>
                <div class="list-item-title">${escapeHtml(m.name)}</div>
                <div class="list-item-meta">${roundBadgeText(rounds, target)} 완료</div>
                ${target > 0 ? `<div class="mini-meter"><div class="meter-track"><div class="meter-fill" style="width:${clampPct(Math.round((rounds / target) * 100))}%"></div></div></div>` : ""}
              </div>
              <div class="list-item-actions">
                <button class="btn btn-secondary btn-sm" data-action="complete-round" data-subject-id="${s.id}" data-material-id="${m.id}" type="button">회독 완료</button>
                <button class="btn btn-danger btn-sm" data-action="delete-material" data-subject-id="${s.id}" data-material-id="${m.id}" type="button">삭제</button>
              </div>
            </div>
            <form data-form="set-target" data-subject-id="${s.id}" data-material-id="${m.id}" class="form form-inline target-form">
              <input type="number" name="targetRounds" min="0" value="${target || ""}" placeholder="목표 회독수" />
              <button class="btn btn-secondary btn-sm" type="submit">목표 저장</button>
            </form>
          </li>`;
        })
        .join("")}</ul>`
    : `<p class="empty-state">등록된 교재가 없어요.</p>`;

  return `
    <div class="card">
      <div class="subject-header">
        <h3>${escapeHtml(s.name)}</h3>
        <button class="btn btn-danger btn-sm" data-action="delete-subject" data-id="${s.id}" type="button">과목 삭제</button>
      </div>
      <div class="stat-sub">평일 목표(주간) ${formatMinutes(s.weeklyGoalMinutes)} · 주말 목표 ${formatMinutes(s.weekendGoalMinutes)} · 월간 목표 ${formatMinutes(monthlyGoalFor(s))} (자동: (평일+주말)×4주)</div>
      <form data-form="update-subject-goals" data-subject-id="${s.id}" class="form goals-form">
        <label class="field"><span>평일 목표 시간(시간, 한 주 기준)</span><input type="number" name="weeklyGoalHours" min="0" step="0.5" value="${s.weeklyGoalMinutes / 60}" /></label>
        <label class="field"><span>주말 목표 시간(시간, 한 주 기준)</span><input type="number" name="weekendGoalHours" min="0" step="0.5" value="${s.weekendGoalMinutes / 60}" /></label>
        <button class="btn btn-secondary btn-sm" type="submit">목표 수정 저장</button>
      </form>

      <h4 class="section-title-sm">교재</h4>
      ${materialsHTML}

      <form data-form="add-material" data-subject-id="${s.id}" class="form form-inline">
        <input type="text" name="name" placeholder="새 교재 이름" required />
        <input type="number" name="targetRounds" min="0" placeholder="목표 회독(선택)" />
        <button class="btn btn-secondary" type="submit">추가</button>
      </form>
    </div>
  `;
}

export function renderSubjects(data) {
  return `
    <section class="view">
      <div class="card">
        <h2 class="section-title">과목 추가</h2>
        <form data-form="add-subject" class="form">
          <label class="field"><span>과목 이름</span><input type="text" name="name" required /></label>
          <label class="field"><span>평일 목표 시간(시간, 한 주 기준)</span><input type="number" name="weeklyGoalHours" min="0" step="0.5" value="0" /></label>
          <label class="field"><span>주말 목표 시간(시간, 한 주 기준)</span><input type="number" name="weekendGoalHours" min="0" step="0.5" value="0" /></label>
          <p class="field-hint">월간 목표는 (평일+주말)×4주로 자동 계산돼요.</p>
          <button class="btn btn-primary" type="submit">과목 추가</button>
        </form>
      </div>
      ${data.subjects.length ? data.subjects.map(subjectCardHTML).join("") : `<p class="empty-state">등록된 과목이 없어요.</p>`}
    </section>
  `;
}
