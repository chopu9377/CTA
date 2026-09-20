import { TRACK_LABEL, countUnit } from "../presets.js";
import { cumulativeOf, workLeft } from "../plan.js";
import { escapeHtml, ringHTML, subjectColor } from "./shared.js";
import { comicBadgeHTML, comicsPanelHTML } from "./comics.js";

function goalItemHTML(data, goal, ui) {
  const open = ui.comicGoalId === goal.id;
  return `<div class="prog-item">
    <div class="prog-row prog-row-tap" data-action="toggle-comics" data-id="${escapeHtml(goal.id)}" role="button" aria-expanded="${open}">
      ${goalRowHTML(data, goal)}
      <span class="chev${open ? " open" : ""}">›</span>
    </div>
    ${open ? comicsPanelHTML(data, goal, ui) : ""}
  </div>`;
}

function goalRowHTML(data, goal) {
  const unit = escapeHtml(countUnit(goal.unit));
  const pct = goal.total > 0 ? Math.min(100, (goal.progress / goal.total) * 100) : 0;
  const target = goal.targetRounds > 0 ? `<small>/${goal.targetRounds}</small>` : "";
  const left = workLeft(goal);
  const detail = goal.total > 0
    ? `${goal.progress}/${goal.total}${unit}${goal.targetRounds > 0 ? ` · 목표 회독까지 ${left}${unit} 남음` : ""}`
    : `${goal.progress}${unit} · 총 분량 미설정(설정에서 입력)`;
  return `${ringHTML(subjectColor(data, goal.subject), pct)}
    <div class="prog-info">
      <div class="prog-name"><i class="swatch" style="background:${subjectColor(data, goal.subject)}"></i>${escapeHtml(goal.subject)}<span class="unit">${escapeHtml(goal.unit)}</span>${comicBadgeHTML(data, goal)}</div>
      <div class="prog-round"><b>${goal.round}</b>${target}회독차</div>
      <div class="prog-detail">${detail}</div>
      ${goal.total > 0 ? `<div class="prog-detail">누적 ${cumulativeOf(goal)}${unit}</div>` : ""}
    </div>`;
}

export function renderProgress(data, ui) {
  const track = ui.progressTrack;
  const goals = data.goals.filter((g) => !g.archived && g.track === track);
  return `<section class="view">
    <div class="card">
      <h2 class="section-title">진도율</h2>
      <div class="seg seg-block">${[2, 1]
        .map((t) => `<button type="button" class="${t === track ? "on" : ""}" data-action="set-progress-track" data-track="${t}">${TRACK_LABEL[t]}</button>`)
        .join("")}</div>
      ${goals.length ? goals.map((g) => goalItemHTML(data, g, ui)).join("") : `<p class="empty-state">${TRACK_LABEL[track]} 목표가 없어요.</p>`}
      <p class="hint">과목을 누르면 챕터 목록이 열려서 챕터마다 만화를 올리고 볼 수 있어요. 링은 현재 회독의 진행률이에요. 100%가 되면 회독이 +1 되고 링이 0으로 돌아가요. 휴식일·버퍼데이에 공부한 것도 오늘 탭에서 입력하면 진도에 그대로 기록돼요.</p>
    </div>
  </section>`;
}
