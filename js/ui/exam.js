import { formatMD } from "../dates.js";
import { EXAM_SUBJECTS, TRACK_LABEL } from "../presets.js";
import { escapeHtml } from "./shared.js";

const CHART = { w: 360, h: 260, left: 28, bottom: 28, top: 14, right: 100 };

function chartSVG(records, subjects, hidden, showRef) {
  const { w, h, left, bottom, top, right } = CHART;
  const pw = w - left - right;
  const ph = h - top - bottom;
  const x = (i) => left + (records.length === 1 ? pw / 2 : (pw * i) / (records.length - 1));
  const y = (v) => top + ph * (1 - v / 100);
  let s = "";
  [0, 20, 40, 60, 80, 100].forEach((v) => {
    s += `<line x1="${left}" x2="${w - right}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" opacity=".12" />
      <text x="${left - 5}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="currentColor" opacity=".6">${v}</text>`;
  });
  if (showRef) {
    s += `<line x1="${left}" x2="${w - right}" y1="${y(40)}" y2="${y(40)}" stroke="var(--cal-bad)" stroke-dasharray="4 3" />
      <text x="${left + 3}" y="${y(40) - 3}" font-size="9" fill="var(--cal-bad)">과락 40</text>
      <line x1="${left}" x2="${w - right}" y1="${y(60)}" y2="${y(60)}" stroke="var(--cal-good)" stroke-dasharray="4 3" />
      <text x="${left + 3}" y="${y(60) - 3}" font-size="9" fill="var(--cal-good)">평균 60</text>`;
  }
  records.forEach((r, i) => {
    s += `<text x="${x(i)}" y="${h - 10}" font-size="10" text-anchor="middle" fill="currentColor" opacity=".6">${formatMD(r.date)}</text>`;
  });
  const ends = [];
  subjects.forEach((name, k) => {
    if (hidden.has(k)) return;
    const color = `var(--series-${k + 1})`;
    s += `<polyline fill="none" stroke="${color}" stroke-width="2.4" points="${records.map((r, i) => `${x(i)},${y(r.scores[k])}`).join(" ")}" />`;
    records.forEach((r, i) => {
      s += `<circle cx="${x(i)}" cy="${y(r.scores[k])}" r="3.5" fill="${color}"><title>${escapeHtml(name)} ${r.scores[k]}점</title></circle>`;
    });
    const last = records[records.length - 1].scores[k];
    ends.push({ k, label: `${name} ${last}`, y: y(last) });
  });
  ends.sort((a, b) => a.y - b.y);
  ends.forEach((e, i) => {
    if (i && e.y - ends[i - 1].y < 13) e.y = ends[i - 1].y + 13;
    s += `<text x="${x(records.length - 1) + 9}" y="${e.y + 3}" font-size="10.5" font-weight="700" fill="var(--series-${e.k + 1})">${escapeHtml(e.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="color: var(--text-primary)">${s}</svg>`;
}

export function renderExam(data, ui, today) {
  const track = ui.examTrack;
  const subjects = EXAM_SUBJECTS[track];
  const records = data.exams[track];
  const hidden = ui.hiddenSeries[track];

  return `<section class="view">
    <div class="card">
      <h2 class="section-title">시험(모의고사) 기록</h2>
      <div class="seg seg-block">${[1, 2]
        .map((t) => `<button type="button" class="${t === track ? "on" : ""}" data-action="set-exam-track" data-track="${t}">${TRACK_LABEL[t]}</button>`)
        .join("")}</div>
      <form data-form="add-exam" class="form">
        <div class="form-grid">
          <label class="field"><span>날짜</span><input type="date" name="date" value="${today}" required /></label>
          <label class="field"><span>회차 이름 (선택)</span><input type="text" name="label" placeholder="예: 모의 4회" /></label>
        </div>
        <div class="form-grid">${subjects
          .map((name, i) => `<label class="field"><span>${escapeHtml(name)}</span><input type="number" name="score${i}" min="0" max="100" step="0.5" inputmode="decimal" placeholder="점수" required /></label>`)
          .join("")}</div>
        <button class="btn btn-primary" type="submit">기록 저장</button>
      </form>
    </div>
    <div class="card">
      <div class="section-header-row"><h2 class="section-title">점수 추이</h2>
        <span class="switch-row">기준선 <button class="sw${ui.showRef ? " on" : ""}" data-action="toggle-ref" type="button" aria-label="기준선"></button></span></div>
      ${records.length
        ? `${chartSVG(records, subjects, hidden, ui.showRef)}
           <div class="series-filter">${subjects
             .map((name, k) => `<button type="button" class="chip-btn${hidden.has(k) ? "" : " on"}" style="--c: var(--series-${k + 1})" data-action="toggle-series" data-index="${k}">${escapeHtml(name)}</button>`)
             .join("")}</div>
           <p class="hint">과목 버튼을 탭하면 그 과목만 켜고 끌 수 있어요.</p>`
        : `<p class="empty-state">아직 ${TRACK_LABEL[track]} 기록이 없어요.</p>`}
    </div>
    ${records.length
      ? `<div class="card"><h2 class="section-title">기록 목록</h2><ul class="list">${[...records].reverse()
          .map((r) => `<li class="list-item"><div><div class="list-item-title">${formatMD(r.date)} ${escapeHtml(r.label)}</div>
            <div class="list-item-meta">${subjects.map((n, i) => `${escapeHtml(n)} ${r.scores[i]}`).join(" · ")}</div></div>
            <button class="btn-danger" data-action="delete-exam" data-track="${track}" data-id="${r.id}" type="button">삭제</button></li>`)
          .join("")}</ul></div>`
      : ""}
  </section>`;
}
