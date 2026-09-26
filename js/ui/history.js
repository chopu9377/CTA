import { addDays } from "../dates.js";
import { monthGroups, currentWeekIndex, weekQuotas, computeTargets, trackAt } from "../stats.js";
import { countUnit } from "../presets.js";
import { legendHTML, weekHTML } from "./weekgrid.js";
import { escapeHtml, subjectColor, formatDuration } from "./shared.js";

function subjectRowHTML(data, goal, count) {
  return `<div class="wk-row"><span class="wk-name"><i class="swatch" style="background:${subjectColor(data, goal.subject)}"></i>${escapeHtml(goal.subject)} <small>${escapeHtml(goal.unit)}</small></span><span class="wk-count">${count}</span></div>`;
}

// 다음 주: 지금 진도 기준으로 그 주 날마다 목표를 미리 계산해 과목별로 더한다(요일·과목 배치는 보여 주지 않는다)
function nextWeekHTML(data, week) {
  const totals = new Map();
  const days = new Map();
  for (let d = week.start; d <= week.end; d = addDays(d, 1)) {
    Object.entries(computeTargets(data, d, true)).forEach(([id, n]) => {
      totals.set(id, (totals.get(id) || 0) + n);
      days.set(id, (days.get(id) || 0) + 1);
    });
  }
  const rows = data.goals.filter((g) => totals.get(g.id) > 0);
  if (!rows.length) return `<p class="hint">다음 주는 목표가 없어요.</p>`;
  const minutes = rows.reduce((sum, g) => sum + totals.get(g.id) * g.minutesPerUnit, 0);
  return `${rows
    .map((g) => subjectRowHTML(data, g, `${totals.get(g.id)}${escapeHtml(countUnit(g.unit))}<small> · ${days.get(g.id)}일 · 약 ${formatDuration(totals.get(g.id) * g.minutesPerUnit)}</small>`))
    .join("")}
    <div class="wk-total">한 주 합계 약 ${formatDuration(minutes)}</div>
    <p class="hint">지금 진도 기준 예상이에요. 이번 주에 더 풀면 자동 과목 양이 줄고, 새 주가 시작될 때 확정돼요.</p>`;
}

// 지난 주·이번 주: 과목별 한 양 / 그 주 목표
function pastWeekHTML(data, ctx, week, current) {
  const q = weekQuotas(data, ctx, week.index, trackAt(data, week.start));
  const rows = q.rings.filter((r) => r.quota > 0 || r.done > 0);
  if (!rows.length) return `<p class="hint">이 주는 목표도 기록도 없어요.</p>`;
  return `${rows
    .map((r) => subjectRowHTML(data, r.goal, `${r.done} / ${r.quota}${escapeHtml(countUnit(r.goal.unit))}${r.quota > 0 && r.done >= r.quota ? " ✓" : ""}`))
    .join("")}
    <p class="hint">${current ? "지금까지 한 양 / 이번 주 목표예요." : "한 양 / 그 주 목표예요."}</p>`;
}

function weekDetailHTML(data, ctx, week, currentIndex) {
  if (week.index <= currentIndex) return pastWeekHTML(data, ctx, week, week.index === currentIndex);
  if (week.index === currentIndex + 1) return nextWeekHTML(data, week);
  return `<p class="hint">아직 미정이에요. 이 주의 바로 전 주가 되면 예상 양을 볼 수 있어요.</p>`;
}

export function renderHistory(data, ctx, today) {
  const groups = monthGroups(data, ctx, today);
  const currentIndex = currentWeekIndex(data, today);

  return `<section class="view">
    <div class="card">
      <h2 class="section-title">공부기록 (누적)</h2>
      ${legendHTML()}
      <p class="hint">주를 누르면 과목별 양이 보여요(다음 주는 예상).</p>
      ${groups
        .map((g) => {
          const pct = g.active ? Math.round((g.ok / g.active) * 100) : 0;
          const [year, month] = g.key.split("-");
          return `<details class="month-card${g.active ? "" : " upcoming"}">
            <summary>
              <div class="month-head"><b>${year}년 ${Number(month)}월</b><span>${g.active ? `달성 ${g.ok}/${g.active}일 · ${pct}%` : "예정"}</span></div>
              <div class="meter-track"><div class="meter-fill${pct >= 80 ? " good" : ""}" style="width:${pct}%"></div></div>
            </summary>
            <div class="month-body">${g.weeks
              .map((w) => `<details class="week-detail"><summary>${weekHTML(w, { mini: true, today, currentIndex })}</summary>
                <div class="week-detail-body">${weekDetailHTML(data, ctx, w, currentIndex)}</div></details>`)
              .join("")}</div>
          </details>`;
        })
        .join("")}
    </div>
  </section>`;
}
