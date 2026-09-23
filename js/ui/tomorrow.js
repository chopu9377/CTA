import { addDays, formatKoreanDate } from "../dates.js";
import { computeTargets, effectiveKind, dayReport } from "../stats.js";
import { limitMinutes, maintenanceGoals, maintenanceTargets } from "../plan.js";
import { bonusMinutes } from "../bonus.js";
import { isAutoGoal, canRedistribute, carryPreview, weekStartOf } from "../weekplan.js";
import { countUnit } from "../presets.js";
import { escapeHtml, subjectColor, formatDuration } from "./shared.js";

// 오늘 미달분을 이월하면 내일 목표에 얹힐 양(자동 계획 과목만. 이월 여부는 내일 앱을 열 때 정한다)
function carryHints(data, ctx, today, tomorrow) {
  const report = dayReport(data, ctx, today, today);
  return report.rows
    .filter((r) => r.done < r.target && isAutoGoal(data, r.goal) && canRedistribute(data, r.goal, today, today))
    .map((r) => ({ goal: r.goal, short: r.target - r.done, plus: carryPreview(data, r.goal, r.target - r.done, today, tomorrow, today) }))
    .filter((h) => h.plus > 0);
}

// 내일 과목은 카드 뒷면(?)으로 가려 두고, 탭하면 뒤집어 보여 준다(뒤집은 상태는 화면 상태로만 기억)
function cardHTML(data, r, key, revealed, unit) {
  if (!revealed) {
    return `<button type="button" class="goal-row tmr-row flip-card" data-action="flip-card" data-key="${key}">
      <div><div class="goal-name"><span class="flip-mark">?</span>어떤 과목일까요</div><div class="goal-meta"><span class="unit">탭해서 뒤집기</span></div></div>
      <div class="goal-count flip-count">?</div></button>`;
  }
  return `<div class="goal-row tmr-row flip-open${r.tag ? " maint" : ""}">
      <div><div class="goal-name"><i class="swatch" style="background:${subjectColor(data, r.goal.subject)}"></i>${escapeHtml(r.goal.subject)}</div>
        <div class="goal-meta"><span class="unit">${escapeHtml(r.goal.unit)}</span>${r.tag ? `<span class="unit maint-tag">${r.tag}</span>` : ""}</div></div>
      <div class="goal-count">${r.amount}<small>${unit(r.goal)}</small></div></div>`;
}

function bodyHTML(data, ctx, today, tomorrow, ui) {
  const kind = effectiveKind(data, tomorrow);
  if (kind) return `<div class="notice">${kind === "rest" ? "내일은 휴식일이에요" : "내일은 복습일이에요 — 진도 대신 이번 주 공부를 다시 떠올려봐요"}</div>`;
  const bonus = bonusMinutes(data, tomorrow);
  const targets = computeTargets(data, tomorrow, true);
  const maint = maintenanceTargets(data, tomorrow, today);
  const rows = [
    ...data.goals.filter((g) => targets[g.id] > 0).map((g) => ({ goal: g, amount: targets[g.id], tag: "" })),
    ...maintenanceGoals(data, tomorrow, today).filter((g) => maint[g.id] > 0).map((g) => ({ goal: g, amount: maint[g.id], tag: "유지" }))
  ];
  if (!rows.length) return `<div class="notice">${bonus ? "내일은 보상 휴식이에요 🎁" : "내일은 목표가 없어요"}</div>`;

  const minutes = rows.reduce((sum, r) => sum + r.amount * r.goal.minutesPerUnit, 0);
  const limit = limitMinutes(data, tomorrow);
  const nextWeek = weekStartOf(data, tomorrow) > weekStartOf(data, today);
  // 이월 안내는 과목 이름이 드러나므로 그 카드를 뒤집은 뒤에만 보여 준다
  const hints = nextWeek ? [] : carryHints(data, ctx, today, tomorrow).filter((h) => ui.revealed.has(`${tomorrow}|${h.goal.id}`));
  const unit = (g) => escapeHtml(countUnit(g.unit));
  const keys = rows.map((r) => `${tomorrow}|${r.goal.id}`);
  const hidden = keys.filter((k) => !ui.revealed.has(k));
  return `${bonus ? `<div class="notice">내일 ${formatDuration(bonus)}은 보상 휴식이라 목표가 줄어 있어요 🎁</div>` : ""}
    <p class="hint flip-hint">내일은 ${rows.length}과목이에요.${hidden.length ? ` 카드를 탭하면 뒤집혀요.` : ""}</p>
    ${rows.map((r, i) => cardHTML(data, r, keys[i], ui.revealed.has(keys[i]), unit)).join("")}
    ${hidden.length > 1 ? `<button type="button" class="btn btn-secondary btn-sm flip-all" data-action="flip-card" data-key="all" data-keys="${hidden.join(",")}">모두 뒤집기</button>` : ""}
    <div class="notice">공부 가능 ${formatDuration(limit)} · 내일 목표 합계 약 ${formatDuration(minutes)}</div>
    ${minutes > limit ? `<div class="notice warn">내일 목표 합계가 공부 가능 시간보다 ${formatDuration(minutes - limit)} 많아요.</div>` : ""}
    ${hints.map((h) => `<div class="notice">오늘 ${escapeHtml(h.goal.subject)} ${h.short}${unit(h.goal)} 미달 · 내일 앱을 열 때 이월하면 내일 <b>+${h.plus}${unit(h.goal)}</b></div>`).join("")}
    <p class="hint">${nextWeek ? "새 주의 첫날이라 지금 진도 기준 예상이에요. 오늘 더 공부하면 과목 배치까지 달라질 수 있어요." : "지금 기록 기준이에요. 오늘 더 하거나 되돌리면 양이 바뀔 수 있고, 휴식일을 바꾸면 남은 날 과목이 다시 섞여요."}</p>`;
}

// 오늘 탭 맨 아래 접이식 카드
export function tomorrowCardHTML(data, ctx, today, ui) {
  const tomorrow = addDays(today, 1);
  const open = !!ui.tomorrowOpen;
  return `<div class="card tmr-card">
    <button class="quiet-toggle" data-action="toggle-tomorrow" type="button" aria-expanded="${open}">
      <span>내일 미리보기 · ${formatKoreanDate(tomorrow)}</span><span class="chev${open ? " open" : ""}">›</span></button>
    ${open ? bodyHTML(data, ctx, today, tomorrow, ui) : ""}
  </div>`;
}
