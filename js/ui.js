import {
  toISODate,
  startOfWeek,
  endOfWeek,
  periodSummary,
  subjectBreakdown,
  subjectStats,
  daysUntil,
  currentStreak,
  examCalendarCells,
  monthlyGoalFor,
  allTags,
  formatMinutes
} from "./stats.js";

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function rateText(rate) {
  return rate === null ? "목표 미설정" : `${rate}%`;
}

function clampPct(rate) {
  return Math.min(100, Math.max(0, rate || 0));
}

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
        <div class="mini-meter">
          <div class="mini-meter-label">이번 주 평일 ${rateText(s.weekdayRate)} · ${formatMinutes(s.weekdayActual)}${s.weekdayGoal > 0 ? " / " + formatMinutes(s.weekdayGoal) : ""}</div>
          <div class="meter-track"><div class="meter-fill" style="width:${clampPct(s.weekdayRate)}%"></div></div>
        </div>
        <div class="mini-meter">
          <div class="mini-meter-label">이번 달 ${rateText(s.monthRate)} · ${formatMinutes(s.monthActual)}${s.monthGoal > 0 ? " / " + formatMinutes(s.monthGoal) : ""} (자동 계산)</div>
          <div class="meter-track"><div class="meter-fill" style="width:${clampPct(s.monthRate)}%"></div></div>
        </div>
        <div class="mini-meter">
          <div class="mini-meter-label">이번 주말 ${rateText(s.weekendRate)} · ${formatMinutes(s.weekendActual)}${s.weekendGoal > 0 ? " / " + formatMinutes(s.weekendGoal) : ""}</div>
          <div class="meter-track"><div class="meter-fill" style="width:${clampPct(s.weekendRate)}%"></div></div>
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

  const hasDailyGoal = (data.meta.dailyGoalMinutes || 0) > 0;
  const goalText = hasDailyGoal ? ` / ${formatMinutes(data.meta.dailyGoalMinutes)}` : "";

  return `
    <div class="card">
      <h2 class="section-title">시험 준비 캘린더${result.truncated ? ` (앞으로 ${result.cells.length}일 표시)` : ""}</h2>
      <div class="exam-calendar">
        ${result.cells
          .map(
            (c) =>
              `<div class="exam-calendar-cell cal-${c.status}" title="${c.date} · ${formatMinutes(c.minutes)}${c.status === "future" ? "" : goalText}"></div>`
          )
          .join("")}
      </div>
      <div class="exam-calendar-legend">
        <span><i class="legend-dot cal-done"></i>목표 달성</span>
        <span><i class="legend-dot cal-partial"></i>일부 학습</span>
        <span><i class="legend-dot cal-empty"></i>미학습</span>
        <span><i class="legend-dot cal-future"></i>예정</span>
      </div>
      ${!hasDailyGoal ? `<p class="stat-sub">설정 탭에서 하루 목표 시간을 등록하면 '일부 학습' 단계까지 나눠서 표시돼요.</p>` : ""}
    </div>
  `;
}

function roundBadgeText(rounds, target) {
  return target > 0 ? `${rounds}/${target}회독` : `${rounds}회독`;
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

function targetOptionsHTML(subjects) {
  return subjects
    .map(
      (s) => `
      <optgroup label="${escapeHtml(s.name)}">
        ${s.materials.length === 0 ? `<option value="${s.id}|">${escapeHtml(s.name)} (교재 미지정)</option>` : ""}
        ${s.materials
          .map((m) => `<option value="${s.id}|${m.id}">${escapeHtml(s.name)} - ${escapeHtml(m.name)}</option>`)
          .join("")}
      </optgroup>`
    )
    .join("");
}

function tagBadgesHTML(tags) {
  if (!tags || !tags.length) return "";
  return `<div class="tag-badges">${tags.map((t) => `<span class="badge badge-tag">${escapeHtml(t)}</span>`).join("")}</div>`;
}

function historyListHTML(logs, subjects, tagFilter) {
  const filtered = tagFilter ? logs.filter((l) => (l.tags || []).includes(tagFilter)) : logs;
  if (!filtered.length) {
    return tagFilter
      ? `<p class="empty-state">'${escapeHtml(tagFilter)}' 태그가 붙은 기록이 없어요.</p>`
      : `<p class="empty-state">아직 기록이 없어요.</p>`;
  }
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return `<ul class="list">${sorted
    .slice(0, 30)
    .map((l) => {
      const subject = subjectMap.get(l.subjectId);
      const material = subject && subject.materials.find((m) => m.id === l.materialId);
      return `
        <li class="list-item">
          <div>
            <div class="list-item-title">${escapeHtml(subject ? subject.name : "삭제된 과목")}${material ? " · " + escapeHtml(material.name) : ""}</div>
            <div class="list-item-meta">${l.date} · ${formatMinutes(l.durationMinutes)}${l.content ? " · " + escapeHtml(l.content) : ""}</div>
            ${tagBadgesHTML(l.tags)}
          </div>
          <button class="btn btn-danger btn-sm" data-action="delete-log" data-id="${l.id}" type="button">삭제</button>
        </li>`;
    })
    .join("")}</ul>`;
}

function tagFilterHTML(tags, activeTag) {
  if (!tags.length) return "";
  return `
    <label class="field tag-filter-field">
      <span>태그 필터</span>
      <select id="tag-filter">
        <option value="">전체</option>
        ${tags.map((t) => `<option value="${escapeHtml(t)}" ${t === activeTag ? "selected" : ""}>${escapeHtml(t)}</option>`).join("")}
      </select>
    </label>
  `;
}

export function renderLog(data, tagFilter) {
  if (!data.subjects.length) {
    return `
      <section class="view">
        <div class="card">
          <h2 class="section-title">오늘 기록 추가</h2>
          <p class="empty-state">먼저 '과목' 탭에서 과목을 등록해주세요.</p>
        </div>
      </section>
    `;
  }

  const today = toISODate(new Date());
  const tags = allTags(data);

  return `
    <section class="view">
      <div class="card">
        <h2 class="section-title">오늘 기록 추가</h2>
        <form data-form="add-log" class="form">
          <label class="field">
            <span>날짜</span>
            <input type="date" name="date" value="${today}" required />
          </label>
          <label class="field">
            <span>과목 / 교재</span>
            <select name="target" required>${targetOptionsHTML(data.subjects)}</select>
          </label>
          <label class="field">
            <span>공부 시간(분)</span>
            <input type="number" name="durationMinutes" min="1" step="1" required />
          </label>
          <label class="field">
            <span>내용</span>
            <textarea name="content" rows="2" placeholder="무엇을 공부했나요?"></textarea>
          </label>
          <label class="field">
            <span>취약 유형 태그 (선택, 쉼표로 구분)</span>
            <input type="text" name="tags" placeholder="예: 계산실수, 조문미숙" />
          </label>
          <button class="btn btn-primary" type="submit">기록 저장</button>
        </form>
      </div>

      <div class="card">
        <div class="section-header-row">
          <h2 class="section-title">최근 기록</h2>
          ${tagFilterHTML(tags, tagFilter)}
        </div>
        ${historyListHTML(data.logs, data.subjects, tagFilter)}
      </div>
    </section>
  `;
}

function subjectCardHTML(s) {
  const materialsHTML = s.materials.length
    ? `<ul class="list">${s.materials
        .map((m) => {
          const target = m.targetRounds || 0;
          const rounds = m.roundHistory.length;
          return `
          <li class="list-item material-item">
            <div class="material-main">
              <div>
                <div class="list-item-title">${escapeHtml(m.name)}</div>
                <div class="list-item-meta">${roundBadgeText(rounds, target)} 완료</div>
                ${target > 0 ? `<div class="mini-meter"><div class="meter-track"><div class="meter-fill" style="width:${clampPct(Math.round((rounds / target) * 100))}%"></div></div></div>` : ""}
              </div>
              <div class="list-item-actions">
                <button class="btn btn-secondary btn-sm" data-action="complete-round" data-subject-id="${s.id}" data-material-id="${m.id}" type="button">회독 완료</button>
                <button class="btn btn-danger btn-sm" data-action="delete-material" data-subject-id="${s.id}" data-material-id="${m.id}" type="button">삭제</button>
              </div>
            </div>
            <form data-form="set-target" data-subject-id="${s.id}" data-material-id="${m.id}" class="form form-inline target-form">
              <input type="number" name="targetRounds" min="0" value="${target || ""}" placeholder="목표 회독수" />
              <button class="btn btn-secondary btn-sm" type="submit">목표 저장</button>
            </form>
          </li>`;
        })
        .join("")}</ul>`
    : `<p class="empty-state">등록된 교재가 없어요.</p>`;

  return `
    <div class="card">
      <div class="subject-header">
        <h3>${escapeHtml(s.name)}</h3>
        <button class="btn btn-danger btn-sm" data-action="delete-subject" data-id="${s.id}" type="button">과목 삭제</button>
      </div>
      <div class="stat-sub">평일 목표(주간) ${formatMinutes(s.weeklyGoalMinutes)} · 주말 목표 ${formatMinutes(s.weekendGoalMinutes)} · 월간 목표 ${formatMinutes(monthlyGoalFor(s))} (자동: (평일+주말)×4주)</div>
      <form data-form="update-subject-goals" data-subject-id="${s.id}" class="form goals-form">
        <label class="field"><span>평일 목표 시간(시간, 한 주 기준)</span><input type="number" name="weeklyGoalHours" min="0" step="0.5" value="${s.weeklyGoalMinutes / 60}" /></label>
        <label class="field"><span>주말 목표 시간(시간, 한 주 기준)</span><input type="number" name="weekendGoalHours" min="0" step="0.5" value="${s.weekendGoalMinutes / 60}" /></label>
        <button class="btn btn-secondary btn-sm" type="submit">목표 수정 저장</button>
      </form>

      <h4 class="section-title-sm">교재</h4>
      ${materialsHTML}

      <form data-form="add-material" data-subject-id="${s.id}" class="form form-inline">
        <input type="text" name="name" placeholder="새 교재 이름" required />
        <input type="number" name="targetRounds" min="0" placeholder="목표 회독(선택)" />
        <button class="btn btn-secondary" type="submit">추가</button>
      </form>
    </div>
  `;
}

export function renderSubjects(data) {
  return `
    <section class="view">
      <div class="card">
        <h2 class="section-title">과목 추가</h2>
        <form data-form="add-subject" class="form">
          <label class="field"><span>과목 이름</span><input type="text" name="name" required /></label>
          <label class="field"><span>평일 목표 시간(시간, 한 주 기준)</span><input type="number" name="weeklyGoalHours" min="0" step="0.5" value="0" /></label>
          <label class="field"><span>주말 목표 시간(시간, 한 주 기준)</span><input type="number" name="weekendGoalHours" min="0" step="0.5" value="0" /></label>
          <p class="field-hint">월간 목표는 (평일+주말)×4주로 자동 계산돼요.</p>
          <button class="btn btn-primary" type="submit">과목 추가</button>
        </form>
      </div>
      ${data.subjects.length ? data.subjects.map(subjectCardHTML).join("") : `<p class="empty-state">등록된 과목이 없어요.</p>`}
    </section>
  `;
}

function backupStatusText(lastBackupAt) {
  if (!lastBackupAt) return "아직 백업한 적이 없어요. 데이터가 소중하다면 지금 내보내기를 눌러주세요.";
  const days = Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / 86400000);
  if (days <= 0) return "오늘 백업했어요.";
  return `마지막 백업: ${days}일 전`;
}

export function renderSettings(data) {
  const examName = data.meta.examName || "";
  const examDate = data.meta.examDate || "";
  const dailyGoalHours = data.meta.dailyGoalMinutes ? data.meta.dailyGoalMinutes / 60 : 0;

  return `
    <section class="view">
      <div class="card">
        <h2 class="section-title">시험 D-day · 하루 목표</h2>
        <form data-form="set-exam" class="form">
          <label class="field"><span>시험 이름</span><input type="text" name="examName" value="${escapeHtml(examName)}" placeholder="예: 세무사 2차" /></label>
          <label class="field"><span>시험일</span><input type="date" name="examDate" value="${examDate}" /></label>
          <label class="field"><span>하루 목표 시간(시간)</span><input type="number" name="dailyGoalHours" min="0" step="0.5" value="${dailyGoalHours}" /></label>
          <button class="btn btn-primary" type="submit">저장</button>
        </form>
      </div>
      <div class="card">
        <h2 class="section-title">데이터 백업</h2>
        <p class="stat-sub">${backupStatusText(data.meta.lastBackupAt)}</p>
        <div class="form form-inline">
          <button class="btn btn-primary" data-action="export-data" type="button">JSON으로 내보내기</button>
          <button class="btn btn-secondary" data-action="import-data" type="button">JSON 불러오기</button>
        </div>
        <input type="file" id="import-file-input" accept="application/json" hidden />
      </div>
      <div class="card">
        <h2 class="section-title">앱 정보</h2>
        <p class="stat-sub">CTA · 개인용 공부 기록 트래커</p>
      </div>
    </section>
  `;
}
