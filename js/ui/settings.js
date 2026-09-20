import { exportedLastBackupDays, trackAt } from "../stats.js";
import { isAutoGoal } from "../weekplan.js";
import { paceMissing } from "../plan.js";
import { formatMD } from "../dates.js";
import { TRACK_LABEL, UNIT_SUGGESTIONS } from "../presets.js";
import { planTreeHTML } from "./plantree.js";
import { escapeHtml, subjectColor } from "./shared.js";
import { syncCardHTML } from "./syncui.js";

function backupStatusText(lastBackupAt, syncOn) {
  const days = exportedLastBackupDays(lastBackupAt);
  const manual = days === null ? "" : days <= 0 ? " 파일 백업: 오늘." : ` 파일 백업: ${days}일 전.`;
  if (syncOn) return `GitHub 동기화가 켜져 있어 자동으로 백업돼요. JSON 내보내기는 비상용이에요(큰 변경 전에 받아 두면 좋아요).${manual}`;
  if (days === null) return "아직 백업한 적이 없어요. 데이터가 소중하다면 지금 내보내기를 눌러주세요.";
  return days <= 0 ? "오늘 백업했어요." : `마지막 백업: ${days}일 전`;
}

function secHeadHTML(key, title, open, right = "") {
  return `<div class="sec-head"><button class="sec-toggle" data-action="toggle-sec" data-sec="${key}" type="button" aria-expanded="${!!open}"><span class="chev${open ? " open" : ""}">›</span>${title}</button>${right}</div>`;
}

// 자동 계획에 필요한데 비어 있는 입력 수(권장량 도출 트리의 ✗와 같은 기준). 다 채우면 칩이 사라진다
function emptyChip(count) {
  return count > 0 ? `<span class="chip chip-warn" title="자동 계획에 필요한데 비어 있어요">비어 있음 ${count}곳</span>` : "";
}

function goalGaps(data, track) {
  return data.goals
    .filter((g) => !g.archived && g.track === track)
    .reduce((n, g) => n + paceMissing(data, g).filter((m) => m.field !== "examDate").length, 0);
}

function trackGaps(data) {
  return [1, 2].filter((t) => !data.tracks[t].examDate && data.goals.some((g) => !g.archived && g.track === t)).length;
}

function trackCardHTML(data, open) {
  return `<div class="card">
    ${secHeadHTML("track", "트랙 · 시험일", open, emptyChip(trackGaps(data)))}
    ${open ? `<div class="sec-body"><div class="form-grid">${[2, 1]
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
    <p class="hint" style="margin-top:0">1차 시작일 ~ 1차 시험일 전날은 <b>1차 집중 기간</b>이라 2차 권장량 계산에서 빠져요.</p>
    <div class="form-grid">${[2, 1]
      .map((t) => `<label class="check"><input type="checkbox" ${data.tracks[t].maintain ? "checked" : ""} data-track-field="maintain" data-track="${t}" /> ${TRACK_LABEL[t]} 유지 모드</label>`)
      .join("")}</div>
    <p class="hint" style="margin-top:0">유지 모드: 다른 트랙을 집중하는 동안 이 트랙을 가볍게 이어 가요. 과목 카드의 "유지 평일/주말" 양만 하고, 못 해도 미달·이월로 세지 않아요.</p></div>` : ""}
  </div>`;
}

// 입력칸은 그대로 두고 이 부분만 다시 그린다(칸을 옮길 때 포커스가 끊기지 않게)
function autoHintHTML(data, g) {
  if (g.planMode !== "auto") return "";
  if (!isAutoGoal(data, g)) return `<p class="hint">자동 계획에는 시험일·총 분량·목표 회독이 필요해요. 채우기 전에는 고정 목표를 써요.</p>`;
  return `<p class="hint">자동: ${formatMD(g.autoFrom)}부터 매주 시작 시점의 진도로 이번 주 목표를 계산해 그 주 동안 고정해요. 오늘 탭 편집의 평일/주말 목표는 쓰지 않아요(다시 고정으로 바꾸면 그 값을 써요).</p>`;
}

export function paceSlotHTML(data, g, today) {
  const pct = g.total > 0 ? Math.round((g.progress / g.total) * 100) : 0;
  return `<div class="meter-track"><div class="meter-fill" style="width:${pct}%"></div></div>
    <div class="hint">이번 회독 ${g.progress}${g.total ? ` / ${g.total} · ${pct}%` : " · 총 분량을 입력하면 진도율과 회독이 계산돼요"}</div>
    ${autoHintHTML(data, g)}
`;
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
      <label class="mini-field"><span>총 분량</span><input type="number" min="0" inputmode="numeric" value="${g.total || ""}" placeholder="예) 1200" data-goal-field="total" data-id="${g.id}" /></label>
      <label class="mini-field"><span>누적 푼 양</span><input type="number" min="0" inputmode="numeric" value="${cumulative || ""}" placeholder="0 (예: 340)" data-goal-field="cumulative" data-id="${g.id}" /></label>
      <label class="mini-field"><span>목표 회독</span><input type="number" min="0" inputmode="numeric" value="${g.targetRounds || ""}" placeholder="예) 3" data-goal-field="targetRounds" data-id="${g.id}" /></label>
      <label class="mini-field"><span>하루 목표</span><select data-goal-field="planMode" data-id="${g.id}"><option value="fixed"${g.planMode === "auto" ? "" : " selected"}>고정</option><option value="auto"${g.planMode === "auto" ? " selected" : ""}>자동</option></select></label>
      <label class="mini-field"><span>1개당 소요(분)</span><input type="number" min="1" inputmode="numeric" value="${g.minutesPerUnit}" data-goal-field="minutesPerUnit" data-id="${g.id}" /></label>
      <label class="mini-field"><span>유지 평일</span><input type="number" min="0" inputmode="numeric" value="${g.maintWeekdayTarget}" data-goal-field="maintWeekdayTarget" data-id="${g.id}" /></label>
      <label class="mini-field"><span>유지 주말</span><input type="number" min="0" inputmode="numeric" value="${g.maintWeekendTarget}" data-goal-field="maintWeekendTarget" data-id="${g.id}" /></label>
    </div>
    <div class="pace-slot" data-slot-for="${g.id}">${paceSlotHTML(data, g, today)}</div>
  </div>`;
}

function totalsCardHTML(data, today, ui) {
  const active = trackAt(data, today);
  const body = [2, 1]
    .map((track) => {
      const goals = data.goals.filter((g) => !g.archived && g.track === track);
      const key = `goals${track}`;
      const on = ui.sec[key];
      return `<div class="sec-sub">
        ${secHeadHTML(key, `${TRACK_LABEL[track]}${track === active ? " (진행중)" : ""}`, on, `${emptyChip(goalGaps(data, track))}<span class="chip">${goals.length}과목</span>`)}
        ${on
          ? `<div class="sec-body">${goals.map((g) => totalRowHTML(data, g, today)).join("")}
        <form data-form="add-goal" class="form goal-add">
          <input type="hidden" name="track" value="${track}" />
          <div class="goal-add-fields"><input type="text" name="subject" placeholder="과목 이름" required list="subject-names" /><input type="text" name="unit" placeholder="단위(예: 문제)" required list="unit-names" /></div>
          <button class="btn btn-secondary" type="submit">+ 과목 추가</button>
        </form>
        <p class="hint">과목 이름·단위는 여기서 바로 고치고, ✕로 삭제해요(지난 기록은 남아요). 고정 목표의 평일/주말 양·요일은 '오늘' 탭 편집에서 해요.</p>
        <p class="hint">'누적 푼 양'에 앱을 쓰기 전까지 푼 양을 넣으면 총 분량 기준으로 회독과 현재 진행량으로 환산돼요(주간 통계에는 잡히지 않아요). 총 분량을 먼저 넣고 누적을 넣어 주세요.</p></div>`
          : ""}
      </div>`;
    })
    .join("");
  return `<div class="card">
    ${secHeadHTML("goals", "과목 설정", ui.sec.goals, emptyChip(goalGaps(data, 1) + goalGaps(data, 2)))}
    ${ui.sec.goals ? `<div class="sec-body">${body}</div>` : ""}
  </div>`;
}

function customColorCardHTML(data) {
  const custom = Object.entries(data.subjectColors).filter(([, c]) => typeof c === "string");
  if (!custom.length) return "";
  return `<div class="card"><h2 class="section-title">과목 색 직접 고르기</h2>
    ${custom.map(([name, color]) => `<label class="check"><input type="color" value="${color}" data-color-name="${escapeHtml(name)}" /> ${escapeHtml(name)}</label>`).join("")}
    <p class="hint">기본 색 12개를 다 쓴 뒤 추가된 과목이에요.</p></div>`;
}

function planDeriveCardHTML(data, today, open) {
  const st = data.settings;
  const field = (key, value, label) =>
    `<label class="mini-field"><span>${label}</span><input type="number" min="0" step="0.5" inputmode="decimal" value="${value}" data-setting-num="${key}" /></label>`;
  return `<div class="card">
    ${secHeadHTML("plan", "권장량 계산 · 도출", open)}
    ${!open ? "" : `<div class="sec-body">
    <div class="total-inputs">
      ${field("weekdayHours", st.weekdayHours, "평일 가능(시간)")}
      ${field("weekendHours", st.weekendHours, "주말 가능(시간)")}
      ${field("bufferDays", st.bufferDays, "시험 전 마감(일)")}
    </div>
    <p class="hint">목표 회독을 시험 며칠 전에 끝내는 페이스로 권장량을 계산해요(마지막 기간은 모의고사·복습용). 평일:주말 양의 비율은 공부 가능 시간 비율을 따르고, 공휴일은 주말로 봐요.</p>
    ${data.goals.some((g) => !g.archived && g.planMode !== "auto") ? `<div class="form-inline" style="margin-bottom:10px"><button class="btn btn-secondary btn-sm" data-action="auto-all" type="button">모든 과목 자동으로</button><span class="hint" style="margin:0">하루 목표를 매주 자동 계산으로 바꿔요</span></div>` : ""}
    <p class="hint" style="margin-top:0">트랙 > 과목별로 무엇이 채워졌고 무엇이 비었는지(✗)와 결과를 보여줘요.</p>
    <div data-slot-plan>${planTreeHTML(data, today)}</div>
    </div>`}
  </div>`;
}

export function renderSettings(data, today, legacyExists, syncInfo, ui) {
  return `<section class="view">
    ${syncCardHTML(syncInfo, ui.sec.sync)}
    ${totalsCardHTML(data, today, ui)}
    ${planDeriveCardHTML(data, today, ui.sec.plan)}
    ${trackCardHTML(data, ui.sec.track)}
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
