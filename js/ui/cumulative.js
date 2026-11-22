// 누적 공부시간 vs 계획(v95): 시작일부터 실제 공부 시간(입력 수량 × 1개당 시간)과 그날 목표 시간의 누적을 두 선으로 비교한다.
// 오늘 계획은 한 만큼만 센다(아직 남은 오늘 몫을 "뒤처짐"으로 보지 않는다). 휴식·복습일 계획은 0.
import { addDays, formatKoreanDate } from "../dates.js";
import { dayReport } from "../stats.js";
import { minutesOn, entryMinutes } from "../minutes.js";

export function cumulativeRows(data, ctx, today) {
  const rows = [];
  let actual = 0;
  let plan = 0;
  const goalById = new Map(data.goals.map((g) => [g.id, g]));
  const byDate = new Map();
  data.entries.forEach((e) => { if (!byDate.has(e.date)) byDate.set(e.date, []); byDate.get(e.date).push(e); });
  for (let d = data.startDate; d <= today; d = addDays(d, 1)) {
    const r = dayReport(data, ctx, d, today);
    const p = r.kind ? 0 : r.rows.reduce((s, x) => s + x.target * minutesOn(x.goal, d), 0);
    const done = (byDate.get(d) || []).reduce((s, e) => s + entryMinutes(goalById.get(e.goalId), e), 0); // v97 실측 우선
    actual += done;
    plan += d === today ? Math.min(p, done) : p;
    if (actual || plan) rows.push({ date: d, actual, plan }); // 기록 시작 전 빈 날은 뺀다
  }
  return rows;
}

const h1 = (min) => (Math.round(min / 6) / 10).toFixed(1);

export function cumulativeHTML(data, ctx, today) {
  const rows = cumulativeRows(data, ctx, today);
  if (rows.length < 2) return "";
  const last = rows[rows.length - 1];
  const diff = last.actual - last.plan;
  const W = 340, H = 170, L = 8, R = 8, T = 14, B = 22;
  const max = Math.max(60, ...rows.map((r) => Math.max(r.actual, r.plan))) * 1.05;
  const x = (i) => L + (i * (W - L - R)) / (rows.length - 1);
  const y = (m) => T + (H - T - B) * (1 - m / max);
  const line = (k) => rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(r[k]).toFixed(1)}`).join("");
  const ticks = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.date.endsWith("-01"))
    .map(({ r, i }) => `<line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${H - B}" stroke="var(--gridline)" stroke-width="1"/><text x="${x(i) + 3}" y="${H - 6}" font-size="10" fill="var(--text-muted)">${Number(r.date.slice(5, 7))}월</text>`).join("");
  const ahead = diff >= 0;
  const headline = ahead ? `<b class="ahead">+${h1(diff)}h</b> 앞섬` : `${h1(-diff)}h 차이 · 이번 주에 메우면 돼요`;
  const data64 = rows.map((r) => `${r.date.slice(5)},${h1(r.actual)},${h1(r.plan)}`).join(";");
  return `<div class="card">
    <div class="section-header-row"><h2 class="section-title">누적 공부 시간</h2><span class="chip">${headline}</span></div>
    <div class="cum-chart" data-rows="${data64}">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="누적 실제 ${h1(last.actual)}시간, 계획 ${h1(last.plan)}시간">
        ${ticks}
        <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--gridline)" stroke-width="1"/>
        <path d="${line("plan")}" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-dasharray="4 4"/>
        <path d="${line("actual")}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="${x(rows.length - 1)}" cy="${y(last.actual)}" r="4" fill="var(--accent)" stroke="var(--surface-1)" stroke-width="2"/>
        <g class="cum-cross" style="display:none"><line y1="${T}" y2="${H - B}" stroke="var(--text-secondary)" stroke-width="1"/></g>
      </svg>
      <div class="cum-tip" hidden></div>
    </div>
    <div class="cum-legend"><span><i class="solid"></i>실제 ${h1(last.actual)}h</span><span><i class="dash"></i>계획 ${h1(last.plan)}h</span></div>
    <p class="hint">그날 목표 시간을 쌓은 선과 실제로 한 시간을 쌓은 선이에요. 그래프를 누르면 그날 값이 보여요.</p>
  </div>`;
}

// 그래프를 누르거나 훑으면 그날 누적값(한 번만 등록, 다시 그려도 위임으로 동작)
function onPoint(e) {
  const box = e.target.closest && e.target.closest(".cum-chart");
  if (!box) return;
  const rows = box.dataset.rows.split(";").map((s) => s.split(","));
  const svg = box.querySelector("svg");
  const rect = svg.getBoundingClientRect();
  const W = 340, L = 8, R = 8;
  const vx = ((e.clientX - rect.left) / rect.width) * W;
  const i = Math.max(0, Math.min(rows.length - 1, Math.round(((vx - L) / (W - L - R)) * (rows.length - 1))));
  const cx = L + (i * (W - L - R)) / (rows.length - 1);
  const cross = box.querySelector(".cum-cross");
  cross.style.display = "";
  cross.querySelector("line").setAttribute("x1", cx);
  cross.querySelector("line").setAttribute("x2", cx);
  const tip = box.querySelector(".cum-tip");
  const [md, a, p] = rows[i];
  tip.hidden = false;
  tip.innerHTML = `<b>${md.replace("-", "/")}</b> 실제 ${a}h · 계획 ${p}h`;
  const left = Math.min(Math.max((cx / W) * rect.width, 70), rect.width - 70);
  tip.style.left = `${left}px`;
}
function onLeave(e) {
  const box = e.target.closest && e.target.closest(".cum-chart");
  if (!box) return;
  box.querySelector(".cum-cross").style.display = "none";
  box.querySelector(".cum-tip").hidden = true;
}
if (typeof document !== "undefined") {
  document.addEventListener("pointermove", onPoint);
  document.addEventListener("pointerdown", onPoint);
  document.addEventListener("pointerout", onLeave);
}
