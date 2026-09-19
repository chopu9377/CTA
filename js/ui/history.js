import { monthGroups, currentWeekIndex } from "../stats.js";
import { legendHTML, weekHTML } from "./weekgrid.js";

export function renderHistory(data, ctx, today) {
  const groups = monthGroups(data, ctx, today);
  const currentIndex = currentWeekIndex(data, today);

  return `<section class="view">
    <div class="card">
      <h2 class="section-title">공부기록 (누적)</h2>
      ${legendHTML()}
      ${groups
        .map((g) => {
          const pct = g.active ? Math.round((g.ok / g.active) * 100) : 0;
          const [year, month] = g.key.split("-");
          return `<details class="month-card${g.active ? "" : " upcoming"}">
            <summary>
              <div class="month-head"><b>${year}년 ${Number(month)}월</b><span>${g.active ? `달성 ${g.ok}/${g.active}일 · ${pct}%` : "예정"}</span></div>
              <div class="meter-track"><div class="meter-fill${pct >= 80 ? " good" : ""}" style="width:${pct}%"></div></div>
            </summary>
            <div class="month-body">${g.weeks.map((w) => weekHTML(w, { mini: true, today, currentIndex })).join("")}</div>
          </details>`;
        })
        .join("")}
    </div>
  </section>`;
}
