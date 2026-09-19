import {
  startOfWeek,
  endOfWeek,
  periodSummary,
  subjectBreakdown,
  subjectStats,
  daysUntil,
  currentStreak,
  examCalendarCells,
  formatMinutes
} from "../stats.js";
import { escapeHtml, rateText, clampPct, roundBadgeText } from "./shared.js";

function capToEight(items) {
  if (items.length <= 8) return items;
  const top = items.slice(0, 7);
  const restMinutes = items.slice(7).reduce((sum, i) => sum + i.minutes, 0);
  return [...top, { id: "other", name: "기타", minutes: restMinutes }];
}

function barChartHTML(items) {
  if (!items.length) return `<p class="empty-state">이번 주 기록이 아직 없어요.</p>`;
  const capped = capToEight(items);
  const max = Math.max(...capped.map((i) => i.minutes), 1);
  return `<div class="bar-chart">${capped
    .map(
      (item, idx) => `
      <div class="bar-row">
        <div class="bar-label">${escapeHtml(item.name)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(item.minutes / max) * 100}%; background: var(--series-${idx + 1})"></div></div>
        <div class="bar-value">${formatMinutes(item.minutes)}</div>
      </div>`
    )
    .join("")}</div>`;
}

// 33% 미만 빨강, 66% 미만 노랑, 그 이상 초록 — 시험 준비 캘린더의 상태색과 같은 기준.
function progressRingColor(rate) {
  if (rate < 33) return "var(--cal-bad)";
  if (rate < 66) return "var(--cal-warn)";
  return "var(--cal-good)";
}

function progressRingHTML(rate, label) {
  const size = 40;
  const strokeWidth = 5;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const hasGoal = rate !== null;
  const dashoffset = circumference * (1 - clampPct(rate) / 100);

  return `
    <div class="ring-item">
      <svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--gridline)" stroke-width="${strokeWidth}" />
        ${
          hasGoal
            ? `<circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${progressRingColor(rate)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${dashoffset.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})" />`
            : ""
        }
      </svg>
      <span class="ring-label">${label}</span>
    </div>
  `;
}

function subjectStatsListHTML(stats) {
  if (!stats.length) return `<p class="empty-state">등록된 과목이 없어요. '과목' 탭에서 추가해보세요.</p>`;
  return `<ul class="subject-stat-list">${stats
    .map(
      (s) => `
      <li class="subject-stat-row">
        <div class="subject-stat-header">
          <span class="subject-stat-name">${escapeHtml(s.name)}</span>
          <span class="subject-stat-total">누적 ${formatMinutes(s.totalActual)}</span>
        </div>
        <div class="ring-row">
          ${progressRingHTML(s.weekdayRate, "평일")}
          ${progressRingHTML(s.weekendRate, "주말")}
          ${progressRingHTML(s.monthRate, "월간")}
        </div>
      </li>`
    )
    .join("")}</ul>`;
}

function examBannerHTML(data, refDate) {
  const examDate = data.meta.examDate;
  if (!examDate) return "";
  const name = data.meta.examName ? escapeHtml(data.meta.examName) : "시험";
  const d = daysUntil(examDate, refDate);
  let ddayText;
  if (d > 0) ddayText = `D-${d}`;
  else if (d === 0) ddayText = "D-DAY";
  else ddayText = `D+${Math.abs(d)}`;

  return `
    <div class="card exam-banner">
      <span class="exam-banner-name">${name}</span>
      <span class="exam-banner-dday">${ddayText}</span>
    </div>
  `;
}

function streakText(streak) {
  return streak > 0 ? `연속 학습 ${streak}일째` : "오늘 기록을 남기고 연속 학습을 시작해보세요";
}

function examCalendarHTML(data, refDate) {
  const result = examCalendarCells(data, refDate, 120);
  if (!result) return "";
  if (!result.cells.length) {
    return `
      <div class="card">
        <h2 class="section-title">시험 준비 캘린더</h2>
        <p class="empty-state">시험일이 이미 지났어요.</p>
      </div>
    `;
  }

  return `
    <div class="card">
      <h2 class="section-title">시험 준비 캘린더${result.truncated ? ` (앞으로 ${result.cells.length}일 표시)` : ""}</h2>
      <div class="exam-calendar">
        ${result.cells
          .map(
            (c) =>
              `<div class="exam-calendar-cell cal-${c.status}" title="${c.date} · ${formatMinutes(c.minutes)}${c.status === "future" || !c.dailyGoal ? "" : " / " + formatMinutes(c.dailyGoal)}"></div>`
          )
          .join("")}
      </div>
      <div class="exam-calendar-legend">
        <span><i class="legend-dot cal-done"></i>목표 달성</span>
        <span><i class="legend-dot cal-partial"></i>일부 학습</span>
        <span><i class="legend-dot cal-empty"></i>미학습</span>
        <span><i class="legend-dot cal-future"></i>예정</span>
      </div>
      <p class="stat-sub">'목표' 탭에서 그날의 과목별 시간을 배분해두면 '일부 학습' 단계까지 나눠서 표시돼요.</p>
    </div>
  `;
}

function materialsRoundListHTML(subjects) {
  const rows = [];
  subjects.forEach((s) => {
    s.materials.forEach((m) => {
      rows.push({
        subjectId: s.id,
        subjectName: s.name,
        materialId: m.id,
        materialName: m.name,
        rounds: m.roundHistory.length,
        target: m.targetRounds || 0
      });
    });
  });
  if (!rows.length) return `<p class="empty-state">등록된 교재가 없어요. '과목' 탭에서 추가해보세요.</p>`;
  return `<ul class="list">${rows
    .map(
      (r) => `
      <li class="list-item">
        <div>
          <div class="list-item-title">${escapeHtml(r.materialName)}</div>
          <div class="list-item-meta">${escapeHtml(r.subjectName)}</div>
          ${
            r.target > 0
              ? `<div class="mini-meter"><div class="meter-track"><div class="meter-fill" style="width:${clampPct(Math.round((r.rounds / r.target) * 100))}%"></div></div></div>`
              : ""
          }
        </div>
        <div class="list-item-actions">
          <span class="badge">${roundBadgeText(r.rounds, r.target)}</span>
          <button class="btn btn-secondary btn-sm" data-action="complete-round" data-subject-id="${r.subjectId}" data-material-id="${r.materialId}" type="button">완료</button>
        </div>
      </li>`
    )
    .join("")}</ul>`;
}

export function renderDashboard(data) {
  const now = new Date();
  const summary = periodSummary(data, now);
  const breakdown = subjectBreakdown(data, startOfWeek(now), endOfWeek(now));
  const perSubject = subjectStats(data, now);
  const streak = currentStreak(data, now);

  return `
    <section class="view">
      ${examBannerHTML(data, now)}
      ${examCalendarHTML(data, now)}

      <div class="stat-grid">
        <div class="card stat-tile">
          <div class="stat-label">이번 주 평일 달성률</div>
          <div class="stat-value">${rateText(summary.weekday.rate)}</div>
          <div class="meter-track"><div class="meter-fill" style="width:${clampPct(summary.weekday.rate)}%"></div></div>
          <div class="stat-sub">${formatMinutes(summary.weekday.actual)} / ${summary.weekday.goal > 0 ? formatMinutes(summary.weekday.goal) : "목표 없음"}</div>
        </div>
        <div class="card stat-tile">
          <div class="stat-label">이번 달 달성률</div>
          <div class="stat-value">${rateText(summary.month.rate)}</div>
          <div class="meter-track"><div class="meter-fill" style="width:${clampPct(summary.month.rate)}%"></div></div>
          <div class="stat-sub">${formatMinutes(summary.month.actual)} / ${summary.month.goal > 0 ? formatMinutes(summary.month.goal) : "목표 없음"} (자동)</div>
        </div>
        <div class="card stat-tile">
          <div class="stat-label">이번 주말 달성률</div>
          <div class="stat-value">${rateText(summary.weekend.rate)}</div>
          <div class="meter-track"><div class="meter-fill" style="width:${clampPct(summary.weekend.rate)}%"></div></div>
          <div class="stat-sub">${formatMinutes(summary.weekend.actual)} / ${summary.weekend.goal > 0 ? formatMinutes(summary.weekend.goal) : "목표 없음"}</div>
        </div>
        <div class="card stat-tile stat-tile-hero">
          <div class="stat-label">누적 공부시간 (전체 과목 합계)</div>
          <div class="stat-value stat-value-hero">${formatMinutes(summary.total.actual)}</div>
          <div class="stat-sub">${streakText(streak)}</div>
        </div>
      </div>

      <div class="card">
        <h2 class="section-title">과목별 달성률 · 누적 시간</h2>
        ${subjectStatsListHTML(perSubject)}
      </div>

      <div class="card">
        <h2 class="section-title">이번 주 과목별 공부시간</h2>
        ${barChartHTML(breakdown)}
      </div>

      <div class="card">
        <h2 class="section-title">교재별 회독 현황</h2>
        ${materialsRoundListHTML(data.subjects)}
      </div>
    </section>
  `;
}
