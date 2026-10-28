// 그날 기준 1개당 소요 시간(분). 1개당 시간을 바꾼 기록(goal.minutesHistory: [{ from, minutes }], 날짜 오름차순)이 있으면
// 그날 적용되던 값을 쓴다 — 시간을 바꿔도 지난 날 공부 시간이 새 값으로 다시 계산되지 않게. 마지막 구간(오늘 이후 포함)은 현재 값.
export function minutesOn(goal, dateStr) {
  const h = goal.minutesHistory;
  if (!Array.isArray(h) || !h.length || !dateStr) return goal.minutesPerUnit;
  let idx = -1;
  h.forEach((x, i) => {
    if (x.from <= dateStr) idx = i;
  });
  if (idx === h.length - 1) return goal.minutesPerUnit;
  return idx >= 0 ? h[idx].minutes : h[0].minutes;
}

// 1개당 시간을 바꿀 때 기록을 남긴다(오늘부터 새 값). 같은 날 여러 번 바꾸면 마지막 값만 남는다.
export function recordMinutesChange(goal, next, today) {
  if (!(next > 0) || next === goal.minutesPerUnit) return;
  const base = Array.isArray(goal.minutesHistory) && goal.minutesHistory.length
    ? goal.minutesHistory
    : [{ from: "0000-00-00", minutes: goal.minutesPerUnit }];
  goal.minutesHistory = [...base.filter((x) => x.from < today), { from: today, minutes: next }];
}
