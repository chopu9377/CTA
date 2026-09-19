export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

export function rateText(rate) {
  return rate === null ? "목표 미설정" : `${rate}%`;
}

export function clampPct(rate) {
  return Math.min(100, Math.max(0, rate || 0));
}

export function roundBadgeText(rounds, target) {
  return target > 0 ? `${rounds}/${target}회독` : `${rounds}회독`;
}
