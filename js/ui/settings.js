import { formatMD, WEEKDAY_LABELS } from "../dates.js";
import { exportedLastBackupDays, trackAt, paceFor, weeklyLoad } from "../stats.js";
import { TRACK_LABEL, UNIT_SUGGESTIONS } from "../presets.js";
import { escapeHtml, subjectColor, shortUnit, formatDuration } from "./shared.js";
import { syncCardHTML } from "./syncui.js";

function backupStatusText(lastBackupAt, syncOn) {
  const days = exportedLastBackupDays(lastBackupAt);
  const manual = days === null ? "" : days <= 0 ? " 파일 백업: 오늘." : ` 파일 백업: ${days}일 전.`;
  if (syncOn) return `GitHub 동기화가 켜져 있어 자동으로 백업돼요. JSON 내보내기는 비상용이에요(큰 변경 전에 받아 두면 좋아요).${manual}`;
  if (days === null) return "아직 백업한 적이 없어요. 데이터가 소중하다면 지금 내보내기를 눌러주세요.";
  return days <= 0 ? "오늘 백업했어요." : `마지막 백업: ${days}일 전`;
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

function paceHTML(g, pace) {
  if (!pace) return `<p class="hint">시험일·총 분량·목표 회독을 입력하면 평일/주말 권장량이 계산돼요.</p>`;
  if (pace.left <= 0) return `<p class="hint">목표 회독을 이미 채웠어요.</p>`;
  if (pace.perWeekday === null) return `<p class="hint">마감일(${formatMD(pace.endDate)})까지 이 목표의 공부일이 남아 있지 않아요.</p>`;
  const unit = escapeHtml(shortUnit(g.unit));
  const same = pace.perWeekday === g.weekdayTarget && pace.perWeekend === g.weekendTarget;
  return `<div class="pace-line">
    <span>권장 <b>평일 ${pace.perWeekday}${unit} · 주말 ${pace.perWeekend}${unit}</b>
      <small>(남은 ${pace.left} · ${formatMD(pace.endDate)} 마감 · 평일 ${pace.weekdayDays}일 / 주말 ${pace.weekendDays}일)</small></span>
    ${same
      ? `<span class="chip">현재 목표와 같아요</span>`
      : `<button class="btn btn-secondary btn-sm" data-action="apply-pace" data-id="${g.id}" data-weekday="${pace.perWeekday}" data-weekend="${pace.perWeekend}" type="button">평일 ${g.weekdayTarget}→${pace.perWeekday} · 주말 ${g.weekendTarget}→${pace.perWeekend} 적용</button>`}
  </div>`;
}

function planCardHTML(data) {
  const s = data.settings;
  const field = (key, value, label) =>
    `<label class="mini-field"><span>${label}</span><input type="number" min="0" step="0.5" inputmode="decimal" value="${value}" data-setting-num="${key}" /></label>`;
  return `<div class="card">
    <h2 class="section-title">권장량 계산 기준</h2>
    <div class="total-inputs">
      ${field("weekdayHours", s.weekdayHours, "평일 가능(시간)")}
      ${field("weekendHours", s.weekendHours, "주말 가능(시간)")}
      ${field("bufferDays", s.bufferDays, "시험 전 마감(일)")}
    </div>
    <p class="hint">목표 회독을 시험 며칠 전에 끝내는 페이스로 권장량을 계산해요(마지막 기간은 모의고사·복습용). 평일:주말 양의 비율은 공부 가능 시간 비율을 따르고, 공휴일은 주말로 봐요.</p>
  </div>`;
}

// 권장량을 그대로 따랐을 때의 요일별 예상 시간. 입력이 바뀔 때 이 부분만 다시 그린다.
export function weekLoadHTML(data, today) {
  const { rows, paced, total } = weeklyLoad(data, trackAt(data, today), today);
  if (!paced) return `<p class="hint">시험일·총 분량·목표 회독을 입력하면 요일별 예상 공부 시간을 점검해줘요.</p>`;
  return `<div class="load-list">${rows
    .map((r) => {
      const over = r.minutes > r.limit;
      const pct = r.limit ? Math.min(100, (r.minutes / r.limit) * 100) : 0;
      return `<div class="load-row"><span class="load-dow">${WEEKDAY_LABELS[r.dow]}</span>
        <div class="meter-track"><div class="meter-fill${over ? " bad" : ""}" style="width:${pct}%"></div></div>
        <span class="load-min${over ? " over" : ""}">${formatDuration(r.minutes)} / ${formatDuration(r.limit)}</span></div>`;
    })
    .join("")}</div>
    <p class="hint">단위당 소요 시간 × 권장량 합계예요. 빨간색은 공부 가능 시간을 넘는 날${paced < total ? ` · 권장량이 계산된 목표 ${paced}/${total}개 기준` : ""}. 요일 패턴은 '오늘' 탭 편집의 프리셋으로 바꿀 수 있어요.</p>
    <button class="btn btn-secondary" data-action="apply-all-pace" type="button">모든 권장량 한 번에 적용</button>`;
}

// 입력칸은 그대로 두고 이 부분만 다시 그린다(칸을 옮길 때 포커스가 끊기지 않게)
export function paceSlotHTML(data, g, today) {
  const pct = g.total > 0 ? Math.round((g.progress / g.total) * 100) : 0;
  return `<div class="meter-track"><div class="meter-fill" style="width:${pct}%"></div></div>
    <div class="hint">이번 회독 ${g.progress}${g.total ? ` / ${g.total} · ${pct}%` : " · 총 분량을 입력하면 진도율과 회독이 계산돼요"}</div>
    ${paceHTML(g, paceFor(data, g, today))}`;
}

function totalRowHTML(data, g, today) {
  const cumulative = (g.round - 1) * g.total + g.progress;
  return `<div class="total-row">
    <div class="total-name">
      <i class="swatch" style="background:${subjectColor(data, g.subject)}"></i>
      <input type="text" value="${escapeHtml(g.subject)}" data-goal-field="subject" data-id="${g.id}" aria-label="과목 이름" list="subject-names" />
      <input type="text" value="${escapeHtml(g.unit)}" data-goal-field="unit" data-id="${g.id}" aria-label="단위(책·강의 이름)" list="unit-names" />
      <span class="round">${g.round}${g.targetRounds ? `/${g.targetRounds}` : ""}회독</span>
      <button type="button" class="btn-danger" data-action="archive-goal" data-id="${g.id}" aria-label="삭제">✕</button>
    </div>
    <div class="total-inputs">
      <label class="mini-field"><span>총 분량</span><input type="number" min="0" inputmode="numeric" value="${g.total || ""}" placeholder="1200" data-goal-field="total" data-id="${g.id}" /></label>
      <label class="mini-field"><span>누적 푼 양</span><input type="number" min="0" inputmode="numeric" value="${cumulative || ""}" placeholder="340" data-goal-field="cumulative" data-id="${g.id}" /></label>
      <label class="mini-field"><span>목표 회독</span><input type="number" min="0" inputmode="numeric" value="${g.targetRounds || ""}" placeholder="3" data-goal-field="targetRounds" data-id="${g.id}" /></label>
      <label class="mini-field"><span>1개당 소요(분)</span><input type="number" min="1" inputmode="numeric" value="${g.minutesPerUnit}" data-goal-field="minutesPerUnit" data-id="${g.id}" /></label>
    </div>
    <div class="pace-slot" data-slot-for="${g.id}">${paceSlotHTML(data, g, today)}</div>
  </div>`;
}

function totalsCardHTML(data, today) {
  const active = trackAt(data, today);
  return [active, active === 2 ? 1 : 2]
    .map((track) => {
      const goals = data.goals.filter((g) => !g.archived && g.track === track);
      return `<div class="card">
        <div class="section-header-row"><h2 class="section-title">총 분량 · 누적 · 회독</h2><span class="chip">${TRACK_LABEL[track]}${track === active ? " (진행중)" : ""}</span></div>
        ${goals.map((g) => totalRowHTML(data, g, today)).join("")}
        ${track === active
          ? `<p class="hint">과목 이름과 단위(연습서·인강 등)는 여기서 바로 고치고, ✕로 삭제해요(지난 기록은 남아요). 하루 목표·요일은 '오늘' 탭의 편집에서 해요.</p>
        <p class="hint">'누적 푼 양'에 앱을 쓰기 전까지 푼 양을 넣으면 총 분량 기준으로 회독과 현재 진행량으로 환산돼요(주간 통계에는 잡히지 않아요). 진행량이 총 분량에 도달하면 회독이 자동으로 +1이 돼요. 총 분량을 먼저 넣고 누적을 넣어 주세요.</p>`
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

export function renderSettings(data, today, legacyExists, syncInfo) {
  return `<section class="view">
    ${syncCardHTML(syncInfo)}
    ${trackCardHTML(data)}
    ${planCardHTML(data)}
    <div class="card">
      <h2 class="section-title">요일별 권장 학습 시간 점검</h2>
      <div data-slot-load>${weekLoadHTML(data, today)}</div>
    </div>
    ${totalsCardHTML(data, today)}
    <datalist id="subject-names">${[...new Set(data.goals.map((g) => g.subject))].map((n) => `<option value="${escapeHtml(n)}">`).join("")}</datalist>
    <datalist id="unit-names">${UNIT_SUGGESTIONS.map((n) => `<option value="${n}">`).join("")}</datalist>
    ${customColorCardHTML(data)}
    <div class="card">
      <h2 class="section-title">공휴일</h2>
      <label class="check"><input type="checkbox" ${data.settings.holidayAutoRest ? "checked" : ""} data-setting="holidayAutoRest" /> 공휴일을 자동으로 휴식일 처리</label>
      <p class="hint">기본은 꺼짐 — 공휴일은 빨간 점으로만 표시하고 공부는 그대로 진행해요. 공휴일은 주말과 같은 목표량·권장량으로 계산해요.</p>
    </div>
    <div class="card">
      <h2 class="section-title">데이터 백업</h2>
      <p class="stat-sub">${backupStatusText(data.meta.lastBackupAt, syncInfo.hasToken)}</p>
      <div class="form form-inline">
        <button class="btn btn-primary" data-action="export-data" type="button">JSON으로 내보내기</button>
        <button class="btn btn-secondary" data-action="import-data" type="button">JSON 불러오기</button>
      </div>
      <input type="file" id="import-file-input" accept="application/json" hidden />
      ${legacyExists ? `<p class="hint">이전 버전(시간 기준) 기록이 이 기기에 남아 있어요.</p>
        <button class="btn btn-secondary btn-sm" data-action="export-legacy" type="button">이전 버전 데이터 내보내기</button>` : ""}
    </div>
    <div class="card"><h2 class="section-title">앱 정보</h2><p class="stat-sub">CTA · 세무사 수험용 공부 기록 트래커<span data-app-version></span></p></div>
  </section>`;
}
