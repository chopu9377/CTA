import { toISODate, allTags, formatMinutes } from "../stats.js";
import { escapeHtml } from "./shared.js";

function targetOptionsHTML(subjects) {
  return subjects
    .map(
      (s) => `
      <optgroup label="${escapeHtml(s.name)}">
        ${s.materials.length === 0 ? `<option value="${s.id}|">${escapeHtml(s.name)} (교재 미지정)</option>` : ""}
        ${s.materials
          .map((m) => `<option value="${s.id}|${m.id}">${escapeHtml(s.name)} - ${escapeHtml(m.name)}</option>`)
          .join("")}
      </optgroup>`
    )
    .join("");
}

function tagBadgesHTML(tags) {
  if (!tags || !tags.length) return "";
  return `<div class="tag-badges">${tags.map((t) => `<span class="badge badge-tag">${escapeHtml(t)}</span>`).join("")}</div>`;
}

function historyListHTML(logs, subjects, tagFilter) {
  const filtered = tagFilter ? logs.filter((l) => (l.tags || []).includes(tagFilter)) : logs;
  if (!filtered.length) {
    return tagFilter
      ? `<p class="empty-state">'${escapeHtml(tagFilter)}' 태그가 붙은 기록이 없어요.</p>`
      : `<p class="empty-state">아직 기록이 없어요.</p>`;
  }
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return `<ul class="list">${sorted
    .slice(0, 30)
    .map((l) => {
      const subject = subjectMap.get(l.subjectId);
      const material = subject && subject.materials.find((m) => m.id === l.materialId);
      return `
        <li class="list-item">
          <div>
            <div class="list-item-title">${escapeHtml(subject ? subject.name : "삭제된 과목")}${material ? " · " + escapeHtml(material.name) : ""}</div>
            <div class="list-item-meta">${l.date} · ${formatMinutes(l.durationMinutes)}${l.content ? " · " + escapeHtml(l.content) : ""}</div>
            ${tagBadgesHTML(l.tags)}
          </div>
          <button class="btn btn-danger btn-sm" data-action="delete-log" data-id="${l.id}" type="button">삭제</button>
        </li>`;
    })
    .join("")}</ul>`;
}

function tagFilterHTML(tags, activeTag) {
  if (!tags.length) return "";
  return `
    <label class="field tag-filter-field">
      <span>태그 필터</span>
      <select id="tag-filter">
        <option value="">전체</option>
        ${tags.map((t) => `<option value="${escapeHtml(t)}" ${t === activeTag ? "selected" : ""}>${escapeHtml(t)}</option>`).join("")}
      </select>
    </label>
  `;
}

export function renderLog(data, tagFilter) {
  if (!data.subjects.length) {
    return `
      <section class="view">
        <div class="card">
          <h2 class="section-title">오늘 기록 추가</h2>
          <p class="empty-state">먼저 '과목' 탭에서 과목을 등록해주세요.</p>
        </div>
      </section>
    `;
  }

  const today = toISODate(new Date());
  const tags = allTags(data);

  return `
    <section class="view">
      <div class="card">
        <h2 class="section-title">오늘 기록 추가</h2>
        <form data-form="add-log" class="form">
          <label class="field">
            <span>날짜</span>
            <input type="date" name="date" value="${today}" required />
          </label>
          <label class="field">
            <span>과목 / 교재</span>
            <select name="target" required>${targetOptionsHTML(data.subjects)}</select>
          </label>
          <label class="field">
            <span>공부 시간(분)</span>
            <input type="number" name="durationMinutes" min="1" step="1" required />
          </label>
          <label class="field">
            <span>내용</span>
            <textarea name="content" rows="2" placeholder="무엇을 공부했나요?"></textarea>
          </label>
          <label class="field">
            <span>취약 유형 태그 (선택, 쉼표로 구분)</span>
            <input type="text" name="tags" placeholder="예: 계산실수, 조문미숙" />
          </label>
          <button class="btn btn-primary" type="submit">기록 저장</button>
        </form>
      </div>

      <div class="card">
        <div class="section-header-row">
          <h2 class="section-title">최근 기록</h2>
          ${tagFilterHTML(tags, tagFilter)}
        </div>
        ${historyListHTML(data.logs, data.subjects, tagFilter)}
      </div>
    </section>
  `;
}
