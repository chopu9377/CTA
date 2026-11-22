// 입력 타격감(v95): 기록을 넣는 순간 숫자·불꽃·콤보가 터지고, 오늘 기록으로 완료 예정일을 며칠 당겼는지 한 줄로 보여 준다.
// 절반을 넘기면 DOWN!, 그날 목표를 다 채우면 K.O.! 화면. 저장 데이터에는 아무것도 쓰지 않는다(표시 전용).
import { escapeHtml } from "./shared.js";
import { formatKoreanDate } from "../dates.js";

const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let layer = null;
let comboTimer = null;
let combo = 0;

function ensureLayer() {
  if (layer && document.body.contains(layer)) return layer;
  layer = document.createElement("div");
  layer.className = "fx-layer";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);
  return layer;
}

function burst(host, color) {
  const n = 14;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("i");
    const angle = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const dist = 60 + Math.random() * 50;
    p.className = "fx-spark";
    p.style.background = color;
    p.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    host.appendChild(p);
  }
}

// info: { amount, unit, subject, color, pull: {projected, days} | null, milestone: "down" | "ko" | null }
export function hitFx(info) {
  const host = ensureLayer();
  combo = comboTimer ? combo + 1 : 1;
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => { comboTimer = null; combo = 0; }, 90 * 1000);
  try { navigator.vibrate && navigator.vibrate(info.milestone ? [30, 40, 60] : 25); } catch (e) { /* 진동 없는 기기 */ }

  const p = info.pull;
  const name = escapeHtml(info.subject);
  const unit = escapeHtml(info.unit);
  let pull = "";
  if (p && p.kind === "week" && p.quota > 0) {
    pull = p.done >= p.quota
      ? `${name} 이번 주 목표 <b>달성 ✓</b> (${p.done}/${p.quota})`
      : `${name} 이번 주 <b>${p.done}</b>/${p.quota} · ${p.quota - p.done}${unit} 남음`;
  } else if (p && p.kind === "date" && p.projected) {
    pull = `${name} 완료 예정 ${formatKoreanDate(p.projected).replace(/ \(.\)$/, "")}${p.days > 0 ? ` · 오늘 <b>${p.days}일</b> 당김 ⏩` : ""}`;
  } else if (p && p.left !== null && p.left !== undefined) {
    pull = `${name} 목표 회독까지 ${p.left}${unit} 남음`;
  }

  host.querySelectorAll(".fx-hit").forEach((el) => el.remove());
  const hit = document.createElement("div");
  hit.className = `fx-hit${reduced() ? " still" : ""}`;
  hit.innerHTML = `<div class="fx-burst"></div>
    <strong class="fx-amount" style="color:${info.color}">+${info.amount}</strong>
    <span class="fx-subject">${escapeHtml(info.subject)} 💥</span>
    ${combo >= 2 ? `<span class="fx-combo">${combo} COMBO</span>` : ""}
    ${pull ? `<span class="fx-pull">${pull}</span>` : ""}
    ${info.ms ? `<span class="fx-pull">⏱ ${Math.round(info.ms / 60000)}분 · 1개당 <b>${(info.ms / 60000 / info.amount).toFixed(1)}분</b></span>` : ""}`;
  host.appendChild(hit);
  if (!reduced()) burst(hit.querySelector(".fx-burst"), info.color);
  setTimeout(() => hit.remove(), 2600);

  if (info.milestone) {
    const big = document.createElement("div");
    big.className = `fx-milestone ${info.milestone}${reduced() ? " still" : ""}`;
    host.querySelectorAll(".fx-milestone").forEach((el) => el.remove());
    big.innerHTML = info.milestone === "ko"
      ? `<strong>K.O.!</strong><span>오늘 목표 완료 🏆</span>`
      : `<strong>DOWN!</strong><span>절반 넘었다 🌗</span>`;
    setTimeout(() => host.appendChild(big), 350);
    setTimeout(() => big.remove(), info.milestone === "ko" ? 2600 : 1900);
  }
}
