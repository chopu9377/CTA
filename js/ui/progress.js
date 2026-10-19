import { TRACK_LABEL, countUnit } from "../presets.js";
import { cumulativeOf, workLeft } from "../plan.js";
import { buildContext } from "../stats.js";
import { formatMD } from "../dates.js";
import { goalStatus, fixedTimeline, DEBT_ALERT_PCT } from "../progressstatus.js";
import { escapeHtml, ringHTML, subjectColor } from "./shared.js";

const BADGE = {
  behind: { cls: "behind", text: "🐢 밀림 주의" },
  cruise: { cls: "cruise", text: "🚗 순항" },
  ahead: { cls: "ahead", text: "🚀 초과" },
  aheadFixed: { cls: "ahead", text: "🚀 여유" }
};

function badgeHTML(status) {
  if (!status) return "";
  if (status.level === "done") return `<span class="ship-badge ship-cruise">🏁 목표 회독 완료</span>`;
  const b = BADGE[status.level === "ahead" && status.kind === "fixed" ? "aheadFixed" : status.level];
  return `<span class="ship-badge ship-${b.cls}">${b.text}</span>`;
}

const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

// 과목 아래 상태 상자: 밀린 양 게이지(0%~🐢 10%) / 밀린 것 없음 / 앞서 감 / 고정 과목 완료 예상
function statusBoxHTML(status, unit, today) {
  if (!status || status.level === "done" || status.kind === "upcoming") return "";
  if (status.kind === "fixed") {
    const t = fixedTimeline(status, today);
    if (!t) return "";
    const spare = t.spareWeeks >= 0 ? `${t.spareWeeks}주 여유` : `${-t.spareWeeks}주 늦음`;
    return `<div class="pstat-box">
      <div class="pstat-head"><span>완료 예상 <b>${formatMD(status.finish)}</b></span><span class="pstat-val ${t.spareWeeks >= 0 ? "is-ahead" : "is-bad"}">${spare}</span></div>
      <div class="pstat-bar"><i class="is-fixed" style="width:${Math.max(3, t.pos).toFixed(0)}%"></i></div>
      <div class="pstat-scale"><span>오늘</span><span>마감 ${formatMD(status.endDate)}</span></div>
    </div>`;
  }
  if (status.unpaid > 0) {
    const tone = status.pct >= DEBT_ALERT_PCT ? "is-bad" : status.pct >= DEBT_ALERT_PCT * 0.7 ? "is-warn" : "is-ok";
    const width = Math.max(4, Math.min(100, (status.pct / DEBT_ALERT_PCT) * 100));
    return `<div class="pstat-box">
      <div class="pstat-head"><span>밀린 <b>${status.unpaid}${unit}</b> · 주당 <b>+${fmt1(status.perWeek)}</b></span><span class="pstat-val ${tone}">+${fmt1(status.pct)}%</span></div>
      <div class="pstat-bar"><i class="${tone}" style="width:${width.toFixed(0)}%"></i></div>
      <div class="pstat-scale"><span>0%</span><span>🐢 ${DEBT_ALERT_PCT}%</span></div>
    </div>`;
  }
  if (status.ahead > 0) return `<div class="pstat-note is-ahead">↑ 목표보다 ${status.ahead}${unit} 앞서 감</div>`;
  return `<div class="pstat-note is-ok">✓ 밀린 것 없음</div>`;
}

function recentHTML(status) {
  if (!status || status.level === "done" || status.kind === "upcoming") return "";
  if (status.kind === "fixed") return `<div class="pstat-main">고정 과목 · 지금 속도로 예측</div>`;
  const { quota, done } = status.recent;
  if (quota <= 0) return "";
  return `<div class="pstat-main">최근 2주 목표 ${done}/${quota} (${Math.round((done / quota) * 100)}%)</div>`;
}

function goalItemHTML(data, ctx, goal, today) {
  const unit = escapeHtml(countUnit(goal.unit));
  const pct = goal.total > 0 ? Math.min(100, (goal.progress / goal.total) * 100) : 0;
  const target = goal.targetRounds > 0 ? `<small>/${goal.targetRounds}</small>` : "";
  const left = workLeft(goal);
  const status = goalStatus(data, ctx, goal, today);
  const detail = goal.total > 0
    ? `${goal.progress}/${goal.total}${unit}${goal.targetRounds > 0 ? ` · 목표 회독까지 ${left}${unit} 남음` : ""} · 누적 ${cumulativeOf(goal)}${unit}`
    : `${goal.progress}${unit} · 총 분량 미설정(설정에서 입력)`;
  return `<div class="prog-item">
    <div class="prog-row">${ringHTML(subjectColor(data, goal.subject), pct)}
      <div class="prog-info">
        <div class="prog-name"><i class="swatch" style="background:${subjectColor(data, goal.subject)}"></i>${escapeHtml(goal.subject)}<span class="unit">${escapeHtml(goal.unit)}</span></div>
        <div class="prog-round"><b>${goal.round}</b>${target}회독차 ${badgeHTML(status)}</div>
        <div class="prog-detail">${detail}</div>
        ${recentHTML(status)}
        ${statusBoxHTML(status, unit, today)}
      </div>
    </div>
  </div>`;
}

export function renderProgress(data, ui, today) {
  const track = ui.progressTrack;
  const goals = data.goals.filter((g) => !g.archived && g.track === track);
  const ctx = buildContext(data, today);
  return `<section class="view">
    <div class="card">
      <h2 class="section-title">진도율</h2>
      <div class="seg seg-block">${[2, 1]
        .map((t) => `<button type="button" class="${t === track ? "on" : ""}" data-action="set-progress-track" data-track="${t}">${TRACK_LABEL[t]}</button>`)
        .join("")}</div>
      ${goals.length ? goals.map((g) => goalItemHTML(data, ctx, g, today)).join("") : `<p class="empty-state">${TRACK_LABEL[track]} 목표가 없어요.</p>`}
      <p class="hint">자동 과목은 앱이 매주 시험일 기준으로 다시 나눠 주니, 목표만 따라가면 제때 끝나요. 못 채운 양은 남은 주들로 나뉘어 주간 목표가 조금씩 늘고,
        그게 그 과목 주간 필요량의 ${DEBT_ALERT_PCT}%를 넘으면 🐢가 떠요(더 풀어서 갚으면 바로 줄어요). 고정 과목은 지금 속도로 끝나는 날을 보여 줘요.
        링은 현재 회독의 진행률이에요. 100%가 되면 회독이 +1 되고 링이 0으로 돌아가요.</p>
    </div>
  </section>`;
}
