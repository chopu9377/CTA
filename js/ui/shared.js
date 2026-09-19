export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

export function clampPct(rate) {
  return Math.min(100, Math.max(0, rate || 0));
}

export function subjectColor(data, name) {
  const color = data.subjectColors[name];
  return typeof color === "number" ? `var(--series-${color})` : color || "#8a8a8a";
}

export function formatDuration(minutes) {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

// 채워질수록 진해지다가 100%면 꽉 찬 원 + 체크
export function ringHTML(color, pct) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const done = pct >= 100;
  const opacity = (0.35 + 0.65 * (pct / 100)).toFixed(2);
  const track = `<circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-opacity=".14" stroke-width="7" />`;
  if (done) {
    return `<svg viewBox="0 0 64 64" width="66" height="66">${track}
      <circle cx="32" cy="32" r="29.5" fill="${color}" />
      <path d="M20 33 l8 8 l16 -17" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
  }
  const arc = pct > 0
    ? `<circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(c * pct / 100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 32 32)" />`
    : "";
  return `<svg viewBox="0 0 64 64" width="66" height="66">${track}${arc}
    <text x="32" y="36" text-anchor="middle" font-size="13" font-weight="700" fill="${color}" fill-opacity="${opacity}">${Math.round(pct)}%</text></svg>`;
}
