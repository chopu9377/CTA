import { formatMD, addDays, WEEKDAY_LABELS } from "../dates.js";
import { trackAt } from "../stats.js";
import { paceMissing, hasFocusPlan } from "../plan.js";
import { planPreview, trackFeasibility, isAutoGoal, weekLoadRows } from "../weekplan.js";
import { TRACK_LABEL, countUnit, LAYOUT_MODES } from "../presets.js";
import { escapeHtml, subjectColor, formatDuration } from "./shared.js";

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

// 주간 자동 역산 미리보기: 오늘 목표에는 적용되지 않는 참고용 계산
function previewHTML(data, g, today) {
  const p = planPreview(data, g, today);
  if (!p) return "";
  const unit = countUnit(g.unit);
  const days = p.weekDays.length
    ? p.weekDays.map((d) => `${WEEKDAY_LABELS[d.dow]} ${d.amount}`).join(" · ")
    : isAutoGoal(data, g) ? "이 주에는 공부일이 없어요" : "자동으로 바꾸면 이 양을 주 N일에 나눠요";
  const weekLabel = p.upcoming ? `집중 시작 주(${formatMD(p.weekStart)}~) 필요` : "이번 주 필요";
  let actual;
  if (p.actual.state === "ok") {
    actual = p.actual.projected
      ? `<b>${formatMD(p.actual.projected)}</b> <small>(최근 ${p.actual.observed}일 기록 · 공부일 하루 평균 ${p.actual.rate.toFixed(1)}${unit})</small>`
      : "현재 페이스로는 완료일을 정할 수 없어요";
  } else if (p.actual.state === "upcoming") actual = "집중 시작 전이라 표시하지 않아요";
  else actual = "기록이 더 쌓이면 실제 페이스 예상일을 표시해요";
  const rows = [
    leaf("info", `남은 <b>${p.rawLeftNow}${unit}</b>${p.rawLeftNow > p.leftNow ? ` <small>(유지분 ${p.rawLeftNow - p.leftNow} 반영 시 ${p.leftNow}${unit})</small>` : ""}`),
    leaf("info", `${weekLabel} 약 <b>${p.weekNeed.toFixed(1)}${unit}</b> → <b>${p.weekTotal}${unit}</b> 배분: ${days}${p.upcoming ? "" : ` <small>(지금 ${p.doneThisWeek}/${p.weekTotal})</small>`}`),
    leaf("info", p.covered ? `목표 마감 <b>${formatMD(p.endDate)}</b> · 다른 트랙 집중 기간의 유지 분량만으로 목표 회독이 채워져요` : `목표 마감 <b>${formatMD(p.endDate)}</b> · 계획상 완료 <b>${p.plannedFinish ? formatMD(p.plannedFinish) : "-"}</b>`),
    leaf("info", `실제 페이스 예상: ${actual}`),
    p.impossible ? leaf("bad", `남은 공부 가능 시간(${formatDuration(p.capacityMin)})으로는 이 과목만으로도 끝내기 어려워요`) : ""
  ].join("");
  const upcomingNote = p.upcoming ? `<li class="tree-leaf info"><span class="tree-mark">·</span><div><small>아직 집중 시작 전이에요. ${formatMD(g.track === 1 ? data.tracks[1].activeFrom : p.weekStart)}에 집중을 시작한다고 가정한 미리보기이고, 그때까지의 기록·시험일 변경에 따라 달라져요.</small></div></li>` : "";
  return `<li class="tree-leaf info preview"><span class="tree-mark">▸</span><div><b>${isAutoGoal(data, g) ? "이번 주 계획" : "자동 역산 미리보기"}</b> <small>${isAutoGoal(data, g) ? "· 오늘 목표에 적용 중" : "· 참고용, 오늘 목표에는 적용 안 돼요"}</small><ul>${upcomingNote}${rows}</ul></div></li>`;
}

function feasibilityLeaf(data, track, today) {
  const f = trackFeasibility(data, track, today);
  if (!f || !f.counted) return "";
  const pct = f.ratio === null ? null : Math.round(f.ratio * 100);
  const state = f.ratio === null || f.ratio > 1 ? "bad" : f.ratio > 0.85 ? "info" : "ok";
  const verdict = f.ratio === null ? "마감일까지 공부 가능한 날이 없어요" : f.ratio > 1 ? "물리적으로 끝내기 어려워요" : f.ratio > 0.85 ? "빠듯해요" : "가능해요";
  return leaf(state, `트랙 전체 가능 여부: 필요 <b>${formatDuration(f.needMin)}</b> / 마감(${formatMD(f.end)})까지 가능 <b>${formatDuration(f.availMin)}</b>${pct === null ? "" : ` (${pct}%)`} → ${verdict}${f.counted < f.total ? ` <small>· 입력이 빠진 ${f.total - f.counted}개 과목 제외</small>` : ""}`);
}


function goalNode(data, g, today) {
  const missing = paceMissing(data, g);
  const own = missing.filter((m) => m.field !== "examDate");
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
      ${g.planMode === "fill" ? leaf("ok", "<b>남는 시간 채우기</b> <small>· 다른 과목 배치 후 남는 시간에 하루 최대 2개씩(역산 안 함)</small>") : missing.length ? leaf("info", "빨간 항목(공통 조건 포함)을 채우면 자동 계획이 계산돼요") : g.planMode === "auto" ? leaf("ok", "<b>자동 계획 적용 중</b> <small>· 아래 이번 주 배분이 오늘 목표가 돼요</small>") : leaf("info", "<b>고정 목표</b> <small>· 오늘 탭 편집의 평일/주말 숫자를 써요. 설정 과목 카드에서 \"자동\"으로 바꾸면 계산한 목표를 써요</small>")}
      ${missing.length || g.planMode === "fill" ? "" : previewHTML(data, g, today)}
    </ul>
  </li>`;
}

const KIND_LABEL = { rest: "휴식", review: "복습" };

function loadNode(data, track, today) {
  if (!data.goals.some((g) => !g.archived && g.track === track)) return "";
  const { rows, start, upcoming, mode } = weekLoadRows(data, track, today);
  const modeLabel = LAYOUT_MODES.find((m) => m.key === mode)?.label || "기본";
  const list = rows
    .map((r) => {
      const over = r.minutes > r.limit;
      const pct = r.limit ? Math.min(100, (r.minutes / r.limit) * 100) : 0;
      const items = r.kind
        ? KIND_LABEL[r.kind]
        : r.items.map((it) => `<span class="load-item"><i class="swatch" style="background:${subjectColor(data, it.goal.subject)}"></i>${escapeHtml(it.goal.subject)} ${it.amount}${escapeHtml(countUnit(it.goal.unit))}${it.maint ? " (유지)" : ""}</span>`).join("") || "목표 없음";
      return `<div class="load-row"><span class="load-dow">${WEEKDAY_LABELS[r.dow]}</span>
        <div class="meter-track"><div class="meter-fill${over ? " bad" : ""}" style="width:${pct}%"></div></div>
        <span class="load-min${over ? " over" : ""}">${formatDuration(r.minutes)} / ${formatDuration(r.limit)}</span>
        <div class="load-items">${items}</div></div>`;
    })
    .join("");
  return `<li class="tree-goal">
    <div class="tree-head"><b>${upcoming ? `집중 시작 주(${formatMD(start)}~)` : "이번 주"} 랜덤 배치</b><span class="tree-tag">${modeLabel} 모드</span></div>
    <div class="tree-body"><div class="load-list">${list}</div>
    <p class="hint">과목마다 한 주 양(자동은 역산 필요량, 고정은 평일/주말 숫자)과 주 N일은 그대로 두고, 요일별 시간이 공부 가능 시간 비율에 가깝도록 고른 배치들 중 하나를 매주 랜덤으로 골라요. 과목이 3일 넘게 비거나 이틀 연속 과목이 많이 겹치는 배치는 피하고, 채우기 과목은 남는 시간에 넣어요. 휴식일을 바꾸면 그날부터 남은 날만 다시 섞여요. 빨간색은 공부 가능 시간을 넘는 날이에요.</p></div>
  </li>`;
}

function trackNode(data, track, today, active) {
  const goals = data.goals.filter((g) => !g.archived && g.track === track);
  const ready = goals.filter((g) => !paceMissing(data, g).length).length;
  const label = `${TRACK_LABEL[track]}${active ? " (진행 중)" : data.tracks[track].activeFrom ? ` (${formatMD(data.tracks[track].activeFrom)}부터 집중)` : ""}`;
  return `<li class="tree-track">
    <div class="tree-head"><b>${label}</b><span class="tree-tag ${goals.length && ready === goals.length ? "ok" : "bad"}">과목 ${ready}/${goals.length} 계산됨</span></div>
    <ul>
      <li class="tree-goal"><div class="tree-head"><b>공통 조건</b></div><ul>${commonLeaves(data, track)}${feasibilityLeaf(data, track, today)}</ul></li>
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
