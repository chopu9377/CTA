import { dayReport, halfStreak, trackAt, daysUntil } from "../stats.js";
import { escapeHtml } from "./shared.js";

const ALWAYS = ["자, 오늘도 화이팅!", "절반만 해도 합격이다이", "한국세무사회 회원이 되는 게 쉬운 줄 알았더냐?"];

const BY_PHASE = {
  start: ["딱 한 문제만 풀고 생각하자", "8문제 말고 1문제만 봐. 1문제", "시작이 반이다. 진짜로 반이다이", "앉기만 해도 절반은 한 거다"],
  going: ["좋아, 시동 걸렸다", "그 기세로 절반까지만 가 보자", "하나 풀었으면 둘도 푼다이"],
  half: ["절반 넘었다! 여기서 멈춰도 🌗는 네 거", "나머지는 덤이다이", "절반 했으면 오늘은 이미 이긴 날"],
  done: ["오늘 치 끝! 이제 놀아도 된다이", "이러다 진짜 세무사 되겠는데?", "다 했네? 독한 것..."],
  rest: ["오늘은 쉬는 날. 쉬는 것도 실력이다이", "푹 쉬어. 내일의 네가 풀 거다"],
  free: ["오늘은 목표 없는 날. 놀아도 합법", "심심하면 한 문제쯤은... 아니다, 쉬어"]
};

// 오늘이 어떤 상태인지(문구 묶음을 고르는 기준). 상태가 바뀌면 app.js가 새 문구를 띄운다.
export function mascotPhase(data, ctx, today) {
  const report = dayReport(data, ctx, today, today);
  if (report.kind) return "rest";
  if (!report.rows.length) return "free";
  if (report.status === "full") return "done";
  if (report.half) return "half";
  return report.totalDone > 0 ? "going" : "start";
}

export function pickCheer(data, ctx, today, phase, previous) {
  const pool = [...BY_PHASE[phase]];
  // 아직 할 게 남은 날에만 쓰는 문구(쉬는 날·다 한 날에 "하루치만 하면 된다"는 어색하다)
  if (phase === "start" || phase === "going") {
    pool.push(...ALWAYS);
    const streak = halfStreak(data, ctx, today);
    if (streak >= 3) pool.push(`🔥 ${streak}일째다. 끊기 아깝지?`);
    const exam = data.tracks[trackAt(data, today)].examDate;
    const left = exam ? daysUntil(exam, today) : 0;
    if (left > 0) pool.push(`D-${left}. 오늘 하루치만 하면 된다이`);
  }
  const choices = pool.filter((text) => text !== previous);
  return choices[Math.floor(Math.random() * choices.length)];
}

export function bubbleHTML(text) {
  return `<div class="mascot-bubble">${escapeHtml(text)}</div>`;
}

// 상단 바를 좌우로 걸어 다니는 픽셀 마스코트. 한 번만 그려 두고(걷기 애니메이션이 끊기지 않게) 말풍선만 갈아 끼운다.
export function mascotHTML() {
  return `<div class="mascot-walker">
    <div class="mascot-bubble-pos" data-mascot-bubble></div>
    <button class="mascot-sprite" data-action="mascot-cheer" type="button" aria-label="응원 한마디 더 듣기">
      <svg viewBox="0 0 12 8" width="42" height="28" shape-rendering="crispEdges" aria-hidden="true">
        <rect x="1" y="0" width="10" height="6" fill="#d97757" />
        <rect x="0" y="2" width="1" height="2" fill="#d97757" />
        <rect x="11" y="2" width="1" height="2" fill="#d97757" />
        <rect x="3" y="2" width="1" height="2" fill="#1f1e1d" />
        <rect x="8" y="2" width="1" height="2" fill="#1f1e1d" />
        <g class="mascot-legs-a"><rect x="2" y="6" width="1" height="2" fill="#d97757" /><rect x="7" y="6" width="1" height="2" fill="#d97757" /></g>
        <g class="mascot-legs-b"><rect x="4" y="6" width="1" height="2" fill="#d97757" /><rect x="9" y="6" width="1" height="2" fill="#d97757" /></g>
      </svg>
    </button>
  </div>`;
}
