// 스톱워치(v97): 과목 하나에 붙여 ▶ 재생 · ⏸ 일시정지 · ⏹ 중단. 기록(+N 추가)을 넣으면 그때까지 잰 시간이 그 입력에 붙고(entry.sec)
// 시계는 0부터 다시 잰다(재생 중이면 계속 돈다). 성과는 문제 수로, 과정은 시간으로 본다.
// 상태는 기기에만(localStorage) 둔다: { goalId, acc(ms), runFrom(ms|null) }. 앱을 닫았다 열어도 시각으로 다시 계산한다.
const KEY = "cta-stopwatch";

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    return s && s.goalId ? s : null;
  } catch (e) { return null; }
}
function write(s) {
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch (e) { /* 저장 불가 기기 */ }
}

export function state() {
  const s = read();
  if (!s) return null;
  const ms = s.acc + (s.runFrom ? Date.now() - s.runFrom : 0);
  return { goalId: s.goalId, running: !!s.runFrom, ms: Math.max(0, ms) };
}

export function start(goalId) {
  write({ goalId, acc: 0, runFrom: Date.now() });
}
export function pause() {
  const s = read();
  if (!s || !s.runFrom) return;
  write({ ...s, acc: s.acc + Date.now() - s.runFrom, runFrom: null });
}
export function resume() {
  const s = read();
  if (!s || s.runFrom) return;
  write({ ...s, runFrom: Date.now() });
}
export function stop() {
  write(null);
}
// 입력에 붙일 시간을 꺼내고 0부터 다시(같은 과목일 때만)
export function take(goalId) {
  const s = read();
  if (!s || s.goalId !== goalId) return 0;
  const now = Date.now();
  const ms = s.acc + (s.runFrom ? now - s.runFrom : 0);
  write({ ...s, acc: 0, runFrom: s.runFrom ? now : null });
  return Math.max(0, ms);
}
// 되돌리기로 지운 입력의 시간은 같은 과목 시계에 돌려준다(시계가 없으면 일시정지 상태로 새로 만든다)
export function giveBack(goalId, ms) {
  if (!(ms > 0)) return;
  const s = read();
  if (!s) write({ goalId, acc: ms, runFrom: null });
  else if (s.goalId === goalId) write({ ...s, acc: s.acc + ms });
}

export function clock(ms) {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? h + ":" : ""}${mm}:${String(s).padStart(2, "0")}`;
}
