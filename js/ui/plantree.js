import { formatMD, addDays, WEEKDAY_LABELS } from "../dates.js";
import { trackAt } from "../stats.js";
import { paceFor, paceMissing, weeklyLoad, hasFocusPlan } from "../plan.js";
import { TRACK_LABEL, countUnit } from "../presets.js";
import { escapeHtml, subjectColor, formatDuration } from "./shared.js";

export function paceHTML(g, pace) {
  if (!pace) return `<p class="hint">시험일·총 분량·목표 회독을 입력하면 평일/주말 권장량이 계산돼요.</p>`;
  if (pace.rawLeft <= 0) return `<p class="hint">목표 회독을 이미 채웠어요.</p>`;
  if (pace.left <= 0) return `<p class="hint">다른 트랙 집중 기간의 유지분(${pace.maintCredit})만으로 목표 회독을 채울 수 있어요.</p>`;
  if (pace.perWeekday === null) return `<p class="hint">마감일(${formatMD(pace.endDate)})까지 이 목표의 공부일이 남아 있지 않아요.</p>`;
  const unit = escapeHtml(countUnit(g.unit));
  const same = pace.perWeekday === g.weekdayTarget && pace.perWeekend === g.weekendTarget;
  return `<div class="pace-line">
    <span>권장 <b>평일 ${pace.perWeekday}${unit} · 주말 ${pace.perWeekend}${unit}</b>
      <small>(남은 ${pace.left}${unit}${pace.maintCredit ? `, 유지분 ${pace.maintCredit} 반영` : ""} · ${formatMD(pace.endDate)} 마감 · 평일 ${pace.weekdayDays}일 / 주말 ${pace.weekendDays}일)</small></span>
    ${same
      ? `<span class="chip">현재 목표와 같아요</span>`
      : `<button class="btn btn-secondary btn-sm" data-action="apply-pace" data-id="${g.id}" data-weekday="${pace.perWeekday}" data-weekend="${pace.perWeekend}" type="button">평일 ${g.weekdayTarget}→${pace.perWeekday} · 주말 ${g.weekendTarget}→${pace.perWeekend} 적용</button>`}
  </div>`;
}

const MARKS = { ok: "✓", bad: "✗", info: "·" };
const leaf = (state, html) => `<li class="tree-leaf ${state}"><span class="tree-mark">${MARKS[state]}</span><div>${html}</div></li>`;
const gotoBtn = (attrs) => `<button type="button" class="link-btn" data-action="goto-input" ${attrs}>입력하러 가기</button>`;

function commonLeaves(data, track) {
  const info = data.tracks[track];
  const { weekdayHours, weekendHours, bufferDays } = data.settings;
  const ratio = weekdayHours > 0 && weekendHours > 0 ? (weekendHours / weekdayHours).toFixed(2) : "1";
  const leaves = [];
  leaves.push(
    info.examDate
      ? leaf("ok", `시험일 <b>${info.examDate}</b>${info.examEstimated ? " (추정)" : ""} · 마감 ${formatMD(addDays(info.examDate, -bufferDays))} (시험 ${bufferDays}일 전)`)
      : leaf("bad", `시험일이 비어 있어요 ${gotoBtn(`data-track="${track}" data-field="examDate"`)}`)
  );
  leaves.push(leaf("info", `공부 가능 시간 평일 ${weekdayHours}시간 · 주말 ${weekendHours}시간 → 평일:주말 양 = 1:${ratio}`));
  if (track === 2) {
    leaves.push(
      hasFocusPlan(data)
        ? leaf("info", `1차 집중 기간 ${formatMD(data.tracks[1].activeFrom)}~${formatMD(data.tracks[1].examDate)}는 공부일에서 뺐어요(유지 모드 분량은 진도로 인정)`)
        : leaf("info", `1차 활성 시작일·1차 시험일을 모두 넣으면 1차 집중 기간을 빼고 계산해요 ${gotoBtn(`data-track="1" data-field="${data.tracks[1].activeFrom ? "examDate" : "activeFrom"}"`)}`)
    );
  }
  return leaves.join("");
}

function goalNode(data, g, today) {
  const missing = paceMissing(data, g);
  const own = missing.filter((m) => m.field !== "examDate");
  const pace = paceFor(data, g, today);
  const unit = countUnit(g.unit);
  const cumulative = (g.round - 1) * g.total + g.progress;
  const tag = own.length ? `<span class="tree-tag bad">입력 ${own.length}개 필요</span>` : `<span class="tree-tag ok">계산됨</span>`;
  const input = (field, label, value, suffix) =>
    missing.some((m) => m.field === field)
      ? leaf("bad", `${label} 미입력 ${gotoBtn(`data-id="${g.id}" data-field="${field}"`)}`)
      : leaf("ok", `${label} <b>${value}${suffix}</b>`);
  return `<li class="tree-goal">
    <div class="tree-head"><i class="swatch" style="background:${subjectColor(data, g.subject)}"></i><b>${escapeHtml(g.subject)}</b><span class="unit">${escapeHtml(g.unit)}</span>${tag}</div>
    <ul>
      ${input("total", "총 분량", g.total, unit)}
      ${input("targetRounds", "목표 회독", g.targetRounds, "회독")}
      ${leaf("info", `누적 푼 양 ${cumulative}${unit}${g.total > 0 && cumulative === 0 ? " (앱 쓰기 전에 푼 양이 있으면 입력)" : ""}`)}
      ${missing.length ? leaf("info", "빨간 항목(공통 조건 포함)을 채우면 권장량이 계산돼요") : leaf("ok", paceHTML(g, pace))}
    </ul>
  </li>`;
}

function loadNode(data, track, today) {
  const { rows, paced, total, maintenance } = weeklyLoad(data, track, today);
  if (!paced) return "";
  const list = rows
    .map((r) => {
      const over = r.minutes > r.limit;
      const pct = r.limit ? Math.min(100, (r.minutes / r.limit) * 100) : 0;
      return `<div class="load-row"><span class="load-dow">${WEEKDAY_LABELS[r.dow]}</span>
        <div class="meter-track"><div class="meter-fill${over ? " bad" : ""}" style="width:${pct}%"></div></div>
        <span class="load-min${over ? " over" : ""}">${formatDuration(r.minutes)} / ${formatDuration(r.limit)}</span></div>`;
    })
    .join("");
  return `<li class="tree-goal">
    <div class="tree-head"><b>요일별 예상 공부 시간</b><span class="tree-tag">${paced}/${total}개 기준</span></div>
    <div class="tree-body"><div class="load-list">${list}</div>
    <p class="hint">단위당 소요 시간 × 권장량 합계(다른 트랙 유지 목표${maintenance ? ` ${maintenance}개` : ""} 포함). 빨간색은 공부 가능 시간을 넘는 날이에요. 요일 패턴은 '오늘' 탭 편집의 프리셋으로 바꿀 수 있어요.</p>
    <button class="btn btn-secondary" data-action="apply-all-pace" data-track="${track}" type="button">${TRACK_LABEL[track]} 권장량 한 번에 적용</button></div>
  </li>`;
}

function trackNode(data, track, today, active) {
  const goals = data.goals.filter((g) => !g.archived && g.track === track);
  const ready = goals.filter((g) => !paceMissing(data, g).length).length;
  const label = `${TRACK_LABEL[track]}${active ? " (진행 중)" : data.tracks[track].activeFrom ? ` (${formatMD(data.tracks[track].activeFrom)}부터 집중)` : ""}`;
  return `<li class="tree-track">
    <div class="tree-head"><b>${label}</b><span class="tree-tag ${goals.length && ready === goals.length ? "ok" : "bad"}">과목 ${ready}/${goals.length} 계산됨</span></div>
    <ul>
      <li class="tree-goal"><div class="tree-head"><b>공통 조건</b></div><ul>${commonLeaves(data, track)}</ul></li>
      ${goals.map((g) => goalNode(data, g, today)).join("")}
      ${loadNode(data, track, today)}
    </ul>
  </li>`;
}

// 트랙 > (공통 조건 · 과목별 입력 상태와 결과 · 요일별 예상 시간). 입력이 바뀔 때 이 부분만 다시 그린다.
export function planTreeHTML(data, today) {
  const active = trackAt(data, today);
  return `<ul class="tree">${[active, active === 2 ? 1 : 2].map((t) => trackNode(data, t, today, t === active)).join("")}</ul>`;
}
