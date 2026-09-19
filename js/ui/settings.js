import { exportedLastBackupDays, trackAt } from "../stats.js";
import { TRACK_LABEL } from "../presets.js";
import { escapeHtml, subjectColor } from "./shared.js";

function backupStatusText(lastBackupAt) {
  const days = exportedLastBackupDays(lastBackupAt);
  if (days === null) return "아직 백업한 적이 없어요. 데이터가 소중하다면 지금 내보내기를 눌러주세요.";
  if (days <= 0) return "오늘 백업했어요.";
  return `마지막 백업: ${days}일 전`;
}

function trackCardHTML(data) {
  return `<div class="card">
    <div class="section-header-row"><h2 class="section-title">트랙 · 시험일</h2><span class="chip">임의 입력 → 확정되면 수정</span></div>
    <div class="form-grid">${[2, 1]
      .map((t) => {
        const info = data.tracks[t];
        return `<label class="field"><span>${TRACK_LABEL[t]} 시험일</span>
          <input type="date" value="${info.examDate || ""}" data-track-field="examDate" data-track="${t}" /></label>`;
      })
      .join("")}</div>
    <div class="form-grid">${[2, 1]
      .map((t) => `<label class="check"><input type="checkbox" ${data.tracks[t].examEstimated ? "checked" : ""} data-track-field="examEstimated" data-track="${t}" /> ${TRACK_LABEL[t]} 추정 날짜</label>`)
      .join("")}</div>
    <label class="field"><span>1차 활성 시작일 (이날 이후 1차로 전환을 안내해요. 2차는 일시정지·진도 보존)</span>
      <input type="date" value="${data.tracks[1].activeFrom || ""}" data-track-field="activeFrom" data-track="1" /></label>
  </div>`;
}

function totalRowHTML(data, g) {
  const pct = g.total > 0 ? Math.round((g.progress / g.total) * 100) : 0;
  const cumulative = (g.round - 1) * g.total + g.progress;
  return `<div class="total-row">
    <div class="total-head"><span><i class="swatch" style="background:${subjectColor(data, g.subject)}"></i>${escapeHtml(g.subject)}<span class="unit">${escapeHtml(g.unit)}</span><span class="round">${g.round}회독</span></span></div>
    <div class="total-inputs">
      <label class="mini-field"><span>총 분량</span><input type="number" min="0" inputmode="numeric" value="${g.total || ""}" placeholder="예: 1200" data-goal-field="total" data-id="${g.id}" /></label>
      <label class="mini-field"><span>누적 푼 양</span><input type="number" min="0" inputmode="numeric" value="${cumulative || ""}" placeholder="예: 340" data-goal-field="cumulative" data-id="${g.id}" /></label>
    </div>
    <div class="meter-track"><div class="meter-fill" style="width:${pct}%"></div></div>
    <div class="hint">이번 회독 ${g.progress}${g.total ? ` / ${g.total} · ${pct}%` : " · 총 분량을 입력하면 진도율과 회독이 계산돼요"}</div>
  </div>`;
}

function totalsCardHTML(data, today) {
  const active = trackAt(data, today);
  return [active, active === 2 ? 1 : 2]
    .map((track) => {
      const goals = data.goals.filter((g) => !g.archived && g.track === track);
      return `<div class="card">
        <div class="section-header-row"><h2 class="section-title">총 분량 · 누적 · 회독</h2><span class="chip">${TRACK_LABEL[track]}${track === active ? " (진행중)" : ""}</span></div>
        ${goals.map((g) => totalRowHTML(data, g)).join("")}
        ${track === active
          ? `<p class="hint">'누적 푼 양'에 앱을 쓰기 전까지 푼 양을 넣으면 총 분량 기준으로 회독과 현재 진행량으로 환산돼요(주간 통계에는 잡히지 않아요). 진행량이 총 분량에 도달하면 회독이 자동으로 +1이 돼요. 총 분량을 먼저 넣고 누적을 넣어 주세요.</p>`
          : ""}
      </div>`;
    })
    .join("");
}

function customColorCardHTML(data) {
  const custom = Object.entries(data.subjectColors).filter(([, c]) => typeof c === "string");
  if (!custom.length) return "";
  return `<div class="card"><h2 class="section-title">과목 색 직접 고르기</h2>
    ${custom.map(([name, color]) => `<label class="check"><input type="color" value="${color}" data-color-name="${escapeHtml(name)}" /> ${escapeHtml(name)}</label>`).join("")}
    <p class="hint">기본 색 12개를 다 쓴 뒤 추가된 과목이에요.</p></div>`;
}

export function renderSettings(data, today, legacyExists) {
  return `<section class="view">
    ${trackCardHTML(data)}
    ${totalsCardHTML(data, today)}
    ${customColorCardHTML(data)}
    <div class="card">
      <h2 class="section-title">공휴일</h2>
      <label class="check"><input type="checkbox" ${data.settings.holidayAutoRest ? "checked" : ""} data-setting="holidayAutoRest" /> 공휴일을 자동으로 휴식일 처리</label>
      <p class="hint">기본은 꺼짐 — 공휴일은 빨간 점으로만 표시하고 공부는 그대로 진행해요.</p>
    </div>
    <div class="card">
      <h2 class="section-title">데이터 백업</h2>
      <p class="stat-sub">${backupStatusText(data.meta.lastBackupAt)}</p>
      <div class="form form-inline">
        <button class="btn btn-primary" data-action="export-data" type="button">JSON으로 내보내기</button>
        <button class="btn btn-secondary" data-action="import-data" type="button">JSON 불러오기</button>
      </div>
      <input type="file" id="import-file-input" accept="application/json" hidden />
      ${legacyExists ? `<p class="hint">이전 버전(시간 기준) 기록이 이 기기에 남아 있어요.</p>
        <button class="btn btn-secondary btn-sm" data-action="export-legacy" type="button">이전 버전 데이터 내보내기</button>` : ""}
    </div>
    <div class="card"><h2 class="section-title">앱 정보</h2><p class="stat-sub">CTA · 세무사 수험용 공부 기록 트래커</p></div>
  </section>`;
}
