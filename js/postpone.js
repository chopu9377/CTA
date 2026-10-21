import { addDays } from "./dates.js";
import { effectiveKind, trackAt } from "./stats.js";
import { weekStartOf } from "./weekplan.js";

// 내일로 넘기기: 오늘 못 할 양을 과목별로 골라 같은 주의 다음 공부일로 옮긴다.
// 저장은 postpones{ 넘긴 날: { 목표id: 양 } }뿐이고, 받는 날은 매번 계산한다(그 사이에 휴식을 넣으면 그다음 공부일로 간다).
// 넘긴 날은 그만큼 목표가 줄어 다 채우면 그냥 달성이고, 받는 날은 그만큼 목표가 는다. 주 안에서 옮기기만 하니 주간 양은 그대로다.
// 받는 날이 같은 주에 없으면(남은 날이 다 휴식) 넘기기는 효과가 없다.

function amountsOf(data, dateStr) {
  const entry = data.postpones?.[dateStr];
  return entry && typeof entry === "object" ? entry : null;
}

// 그날 넘긴 양을 받을 날: 같은 주, 같은 트랙의 다음 공부일(휴식·복습일은 건너뜀). 없으면 null.
export function postponeDest(data, dateStr) {
  const weekEnd = addDays(weekStartOf(data, dateStr), 7);
  const track = trackAt(data, dateStr);
  for (let d = addDays(dateStr, 1); d < weekEnd; d = addDays(d, 1)) {
    if (trackAt(data, d) !== track) return null;
    if (!effectiveKind(data, d)) return d;
  }
  return null;
}

// 그날 실제로 넘어간 양(넘긴 날이 휴식이 됐거나 받을 날이 없으면 없음)
export function postponeOut(data, dateStr) {
  const amounts = amountsOf(data, dateStr);
  if (!amounts || effectiveKind(data, dateStr) || !postponeDest(data, dateStr)) return {};
  return amounts;
}

// 그날 넘겨받은 양(같은 주 앞날들에서)
export function postponeIn(data, dateStr) {
  const out = {};
  const weekStart = weekStartOf(data, dateStr);
  for (let d = weekStart; d < dateStr; d = addDays(d, 1)) {
    if (!amountsOf(data, d) || postponeDest(data, d) !== dateStr) continue;
    Object.entries(postponeOut(data, d)).forEach(([id, n]) => (out[id] = (out[id] || 0) + n));
  }
  return out;
}

// 그날 목표에 넘긴 양을 빼고 넘겨받은 양을 더한다(보상 휴식을 뺀 뒤에 적용)
export function applyPostpone(data, dateStr, targets) {
  if (!data.postpones || !Object.keys(data.postpones).length) return targets;
  const out = { ...targets };
  Object.entries(postponeOut(data, dateStr)).forEach(([id, n]) => {
    const left = (out[id] || 0) - n;
    if (left > 0) out[id] = left;
    else delete out[id];
  });
  Object.entries(postponeIn(data, dateStr)).forEach(([id, n]) => {
    if (data.goals.some((g) => g.id === id && !g.archived)) out[id] = (out[id] || 0) + n;
  });
  return out;
}

// 굳은 목표 스냅샷에서 넘기기 전의 원래 배치 양으로 되돌린다(배치를 다시 섞을 때 같은 양을 두 번 세지 않게)
export function undoPostpone(data, dateStr, targets) {
  const out = { ...targets };
  Object.entries(postponeOut(data, dateStr)).forEach(([id, n]) => (out[id] = (out[id] || 0) + n));
  Object.entries(postponeIn(data, dateStr)).forEach(([id, n]) => {
    const left = (out[id] || 0) - n;
    if (left > 0) out[id] = left;
    else delete out[id];
  });
  return out;
}

// 오늘 과목별로 넘길 수 있는 최대치. 넘겨받은 양은 다시 못 넘긴다(한 번만) — 오늘 푼 양은 넘겨받은 몫부터 채운 것으로 본다.
// targets: 지금 오늘 목표(넘기기 반영 후), done: 과목별 오늘 한 양
export function postponeLimits(data, dateStr, targets, done) {
  const out = postponeOut(data, dateStr);
  const inn = postponeIn(data, dateStr);
  const ids = new Set([...Object.keys(targets), ...Object.keys(out)]);
  const limits = {};
  ids.forEach((id) => {
    const own = (targets[id] || 0) + (out[id] || 0) - (inn[id] || 0); // 원래 오늘 몫(보상 휴식 차감 후)
    const max = Math.max(0, Math.min(own, own + (inn[id] || 0) - (done[id] || 0)));
    if (max > 0 || out[id]) limits[id] = { max: Math.max(max, out[id] || 0), current: out[id] || 0, incoming: inn[id] || 0 };
  });
  return limits;
}
