import { formatMinutes, studyVolumeStats } from "../stats.js";

function volumeTileHTML(label, stat, subText) {
  return `
    <div class="card stat-tile">
      <div class="stat-label">${label} 일 평균</div>
      <div class="stat-value">${formatMinutes(stat.dailyAvg)}</div>
      <div class="stat-sub">주 평균 ${formatMinutes(stat.weeklyAvg)}${subText ? " · " + subText : ""}</div>
    </div>
  `;
}

export function renderVolume(data) {
  const stats = studyVolumeStats(data);
  if (!stats.hasData) {
    return `
      <section class="view">
        <div class="card">
          <h2 class="section-title">공부량체크</h2>
          <p class="empty-state">아직 기록이 없어요. '기록' 탭에서 기록을 추가해보세요.</p>
        </div>
      </section>
    `;
  }

  return `
    <section class="view">
      <div class="stat-grid">
        ${volumeTileHTML("전체 기간", stats.allTime, `총 ${formatMinutes(stats.allTime.totalMinutes)} · ${stats.allTime.totalDays}일간`)}
        ${volumeTileHTML("최근 7일", stats.last7)}
        ${volumeTileHTML("최근 30일", stats.last30)}
      </div>
    </section>
  `;
}
