import { formatKoreanDate, addDays } from "../dates.js";
import { targetsFor } from "../stats.js";
import { postponeDest, postponeOut, postponeLimits } from "../postpone.js";
import { countUnit } from "../presets.js";
import { escapeHtml } from "./shared.js";

// "내일 10/23 (금)으로", "10/24 (토)로" — 요일 글자 받침에 맞춰 조사를 붙인다(ㄹ받침·받침 없음은 "로")
function destLabel(today, dest) {
  const label = formatKoreanDate(dest);
  const code = label.charCodeAt(label.length - 2) - 0xac00;
  const jong = code >= 0 && code < 11172 ? code % 28 : 0;
  return `${dest === addDays(today, 1) ? "내일 " : ""}${label}${jong && jong !== 8 ? "으로" : "로"}`;
}

function doneOn(data, ctx, today) {
  const done = {};
  data.goals.forEach((g) => {
    const n = ctx.sums.get(`${g.id}|${today}`) || 0;
    if (n > 0) done[g.id] = n;
  });
  return done;
}

export function todayPostponeLimits(data, ctx, today) {
  return postponeLimits(data, today, targetsFor(data, today), doneOn(data, ctx, today));
}

// 오늘 탭: 넘긴 게 있으면 안내 + [바꾸기], 아니면 남은 양이 있을 때 [내일로 넘기기] 버튼
export function postponeLineHTML(data, ctx, today, report) {
  if (report.kind || !report.rows.length) return "";
  const dest = postponeDest(data, today);
  if (!dest) return "";
  const out = postponeOut(data, today);
  const items = Object.entries(out)
    .map(([id, n]) => {
      const g = data.goals.find((x) => x.id === id);
      return g ? `${escapeHtml(g.subject)} ${n}${escapeHtml(countUnit(g.unit))}` : "";
    })
    .filter(Boolean);
  if (items.length) {
    return `<div class="notice light">➡️ ${destLabel(today, dest)} 넘김 · ${items.join(", ")}
      <button class="btn btn-sm btn-secondary" data-action="postpone-open" type="button">바꾸기</button></div>`;
  }
  const limits = todayPostponeLimits(data, ctx, today);
  if (!report.shortfalls.length || !Object.values(limits).some((l) => l.max > 0)) return "";
  return `<div class="light-line"><button class="btn btn-secondary btn-sm" data-action="postpone-open" type="button">➡️ 내일로 넘기기</button><span>오늘 못 할 양을 ${destLabel(today, dest)}</span></div>`;
}

// 과목마다 넘길 양을 스테퍼로 고르는 시트
export function postponeSheetHTML(data, ctx, today, ui) {
  const dest = postponeDest(data, today);
  const limits = todayPostponeLimits(data, ctx, today);
  const amounts = ui.postponeAmounts || {};
  const rows = Object.entries(limits)
    .map(([id, l]) => {
      const goal = data.goals.find((g) => g.id === id);
      if (!goal) return "";
      const unit = escapeHtml(countUnit(goal.unit));
      const amount = Math.min(amounts[id] || 0, l.max);
      const note = `최대 ${l.max}${unit}${l.incoming ? ` · 넘겨받은 ${l.incoming}${unit}는 다시 못 넘겨요` : ""}`;
      return `<div class="bonus-goal-row">
        <div class="bonus-goal-name">${escapeHtml(goal.subject)} <span class="hint">${note}</span></div>
        <div class="bonus-stepper">
          <button class="btn btn-secondary btn-sm" data-action="postpone-step" data-goal="${id}" data-step="-1" type="button"${amount <= 0 ? " disabled" : ""}>−</button>
          <b>${amount}${unit}</b>
          <button class="btn btn-secondary btn-sm" data-action="postpone-step" data-goal="${id}" data-step="1" type="button"${amount < l.max ? "" : " disabled"}>＋</button>
        </div>
      </div>`;
    })
    .join("");
  const had = Object.keys(postponeOut(data, today)).length > 0;
  const any = Object.values(amounts).some((n) => n > 0);
  return `<div class="sheet-backdrop"><div class="sheet">
    <h3 class="sheet-title">${destLabel(today, dest)} 넘기기</h3>
    <p class="hint">넘긴 만큼 오늘 목표가 줄어서, 남은 걸 다 하면 오늘 칸이 초록이 돼요. 받는 날 목표는 그만큼 늘어요. 넘겨받은 양은 다시 못 넘기고, 주를 넘겨서는 못 옮겨요.</p>
    <div class="settle-item">${rows || `<div class="settle-what">넘길 수 있는 양이 없어요.</div>`}</div>
    <div class="form-inline">
      <button class="btn btn-primary" data-action="confirm-postpone" type="button"${any || had ? "" : " disabled"}>${had && !any ? "넘기기 취소" : "넘기기"}</button>
      <button class="btn btn-secondary" data-action="close-sheet" type="button">닫기</button>
    </div>
  </div></div>`;
}
