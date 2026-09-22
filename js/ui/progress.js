import { TRACK_LABEL, countUnit } from "../presets.js";
import { cumulativeOf, workLeft } from "../plan.js";
import { planPreview } from "../weekplan.js";
import { escapeHtml, ringHTML, subjectColor, SHIP, shipOfPlan } from "./shared.js";

// 총 진도 기준 상태(예상 완료일 vs 시험 마감). 입력이 부족하면 표시하지 않는다.
function shipBadgeHTML(data, goal, today) {
  const preview = planPreview(data, goal, today);
  if (!preview) return "";
  if (preview.status.level === "done") return `<span class="ship-badge ship-cruise">🏁 목표 회독 완료</span>`;
  const level = shipOfPlan(preview.status.level);
  return level ? `<span class="ship-badge ship-${level}">${SHIP[level].emoji} ${SHIP[level].label}</span>` : "";
}

function goalItemHTML(data, goal, today) {
  return `<div class="prog-item">
    <div class="prog-row">${goalRowHTML(data, goal, today)}</div>
  </div>`;
}

function goalRowHTML(data, goal, today) {
  const unit = escapeHtml(countUnit(goal.unit));
  const pct = goal.total > 0 ? Math.min(100, (goal.progress / goal.total) * 100) : 0;
  const target = goal.targetRounds > 0 ? `<small>/${goal.targetRounds}</small>` : "";
  const left = workLeft(goal);
  const detail = goal.total > 0
    ? `${goal.progress}/${goal.total}${unit}${goal.targetRounds > 0 ? ` · 목표 회독까지 ${left}${unit} 남음` : ""}`
    : `${goal.progress}${unit} · 총 분량 미설정(설정에서 입력)`;
  return `${ringHTML(subjectColor(data, goal.subject), pct)}
    <div class="prog-info">
      <div class="prog-name"><i class="swatch" style="background:${subjectColor(data, goal.subject)}"></i>${escapeHtml(goal.subject)}<span class="unit">${escapeHtml(goal.unit)}</span></div>
      <div class="prog-round"><b>${goal.round}</b>${target}회독차 ${shipBadgeHTML(data, goal, today)}</div>
      <div class="prog-detail">${detail}</div>
      ${goal.total > 0 ? `<div class="prog-detail">누적 ${cumulativeOf(goal)}${unit}</div>` : ""}
    </div>`;
}

export function renderProgress(data, ui, today) {
  const track = ui.progressTrack;
  const goals = data.goals.filter((g) => !g.archived && g.track === track);
  return `<section class="view">
    <div class="card">
      <h2 class="section-title">진도율</h2>
      <div class="seg seg-block">${[2, 1]
        .map((t) => `<button type="button" class="${t === track ? "on" : ""}" data-action="set-progress-track" data-track="${t}">${TRACK_LABEL[t]}</button>`)
        .join("")}</div>
      ${goals.length ? goals.map((g) => goalItemHTML(data, g, today)).join("") : `<p class="empty-state">${TRACK_LABEL[track]} 목표가 없어요.</p>`}
      <p class="hint">🐢 미흡 · 🚗 순항 · 🚀 초고속은 지금 페이스로 시험 마감까지 목표 회독을 끝낼 수 있는지 본 총 진도 상태예요(총 분량·목표 회독·시험일이 있어야 떠요). 링은 현재 회독의 진행률이에요. 100%가 되면 회독이 +1 되고 링이 0으로 돌아가요. 휴식일·버퍼데이에 공부한 것도 오늘 탭에서 입력하면 진도에 그대로 기록돼요.</p>
    </div>
  </section>`;
}
