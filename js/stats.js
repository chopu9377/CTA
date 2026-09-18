function pad(n) {
  return String(n).padStart(2, "0");
}

export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfWeek(refDate) {
  const d = new Date(refDate);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  d.setDate(d.getDate() - day);
  return d;
}

export function endOfWeek(refDate) {
  const start = startOfWeek(refDate);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function startOfMonth(refDate) {
  const d = new Date(refDate);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(refDate) {
  const d = new Date(refDate);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function isInRange(dateStr, start, end) {
  const d = new Date(dateStr + "T00:00:00");
  return d >= start && d <= end;
}

export function isWeekend(dateStr) {
  const day = new Date(dateStr + "T00:00:00").getDay();
  return day === 0 || day === 6;
}

export function logsInRange(logs, start, end) {
  return logs.filter((l) => isInRange(l.date, start, end));
}

export function sumMinutes(logs) {
  return logs.reduce((sum, l) => sum + (l.durationMinutes || 0), 0);
}

export function achievementRate(actualMinutes, goalMinutes) {
  if (!goalMinutes || goalMinutes <= 0) return null;
  return Math.round((actualMinutes / goalMinutes) * 100);
}

// "주간 목표"(weeklyGoalMinutes)는 평일(월~금) 한 주치 목표를 뜻하고, 월간 목표는 이제
// 따로 입력받지 않는다 — (평일 목표 + 주말 목표) x 4주로 자동 계산한다.
const WEEKS_PER_MONTH = 4;

export function monthlyGoalFor(subject) {
  return ((subject.weeklyGoalMinutes || 0) + (subject.weekendGoalMinutes || 0)) * WEEKS_PER_MONTH;
}

export function periodSummary(data, refDate = new Date()) {
  const weekStart = startOfWeek(refDate);
  const weekEnd = endOfWeek(refDate);
  const monthStart = startOfMonth(refDate);
  const monthEnd = endOfMonth(refDate);

  const weekLogs = logsInRange(data.logs, weekStart, weekEnd);
  const monthLogs = logsInRange(data.logs, monthStart, monthEnd);
  const weekendLogs = weekLogs.filter((l) => isWeekend(l.date));
  const weekdayLogs = weekLogs.filter((l) => !isWeekend(l.date));

  const weekdayGoal = data.subjects.reduce((sum, s) => sum + (s.weeklyGoalMinutes || 0), 0);
  const monthGoal = data.subjects.reduce((sum, s) => sum + monthlyGoalFor(s), 0);
  const weekendGoal = data.subjects.reduce((sum, s) => sum + (s.weekendGoalMinutes || 0), 0);

  const weekdayActual = sumMinutes(weekdayLogs);
  const monthActual = sumMinutes(monthLogs);
  const weekendActual = sumMinutes(weekendLogs);
  const totalActual = sumMinutes(data.logs);

  return {
    weekday: { actual: weekdayActual, goal: weekdayGoal, rate: achievementRate(weekdayActual, weekdayGoal) },
    month: { actual: monthActual, goal: monthGoal, rate: achievementRate(monthActual, monthGoal) },
    weekend: { actual: weekendActual, goal: weekendGoal, rate: achievementRate(weekendActual, weekendGoal) },
    total: { actual: totalActual }
  };
}

export function subjectStats(data, refDate = new Date()) {
  const weekStart = startOfWeek(refDate);
  const weekEnd = endOfWeek(refDate);
  const monthStart = startOfMonth(refDate);
  const monthEnd = endOfMonth(refDate);

  return data.subjects.map((s) => {
    const subjectLogs = data.logs.filter((l) => l.subjectId === s.id);
    const weekLogs = logsInRange(subjectLogs, weekStart, weekEnd);
    const weekdayActual = sumMinutes(weekLogs.filter((l) => !isWeekend(l.date)));
    const weekendActual = sumMinutes(weekLogs.filter((l) => isWeekend(l.date)));
    const monthActual = sumMinutes(logsInRange(subjectLogs, monthStart, monthEnd));
    const monthGoal = monthlyGoalFor(s);
    return {
      id: s.id,
      name: s.name,
      weekdayActual,
      weekdayGoal: s.weeklyGoalMinutes || 0,
      weekdayRate: achievementRate(weekdayActual, s.weeklyGoalMinutes),
      weekendActual,
      weekendGoal: s.weekendGoalMinutes || 0,
      weekendRate: achievementRate(weekendActual, s.weekendGoalMinutes),
      monthActual,
      monthGoal,
      monthRate: achievementRate(monthActual, monthGoal),
      totalActual: sumMinutes(subjectLogs)
    };
  });
}

export function subjectBreakdown(data, start, end) {
  const logs = start && end ? logsInRange(data.logs, start, end) : data.logs;
  return data.subjects
    .map((s) => ({
      id: s.id,
      name: s.name,
      minutes: sumMinutes(logs.filter((l) => l.subjectId === s.id))
    }))
    .filter((s) => s.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}

export function daysUntil(dateStr, refDate = new Date()) {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date(refDate);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function currentStreak(data, refDate = new Date()) {
  const dateSet = new Set(data.logs.map((l) => l.date));
  const cursor = new Date(refDate);
  cursor.setHours(0, 0, 0, 0);

  if (!dateSet.has(toISODate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!dateSet.has(toISODate(cursor))) return 0;
  }

  let streak = 0;
  while (dateSet.has(toISODate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function examCalendarCells(data, refDate = new Date(), maxDays = 120) {
  const examDate = data.meta.examDate;
  if (!examDate) return null;

  const today = new Date(refDate);
  today.setHours(0, 0, 0, 0);
  const end = new Date(examDate + "T00:00:00");
  const totalDays = Math.round((end.getTime() - today.getTime()) / 86400000);
  if (totalDays < 0) return { cells: [], totalDays, truncated: false };

  const dailyGoal = data.meta.dailyGoalMinutes || 0;
  const minutesByDate = new Map();
  data.logs.forEach((l) => {
    minutesByDate.set(l.date, (minutesByDate.get(l.date) || 0) + (l.durationMinutes || 0));
  });

  const count = Math.min(totalDays, maxDays) + 1; // inclusive of today
  const cells = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = toISODate(d);
    const minutes = minutesByDate.get(dateStr) || 0;

    let status;
    if (d.getTime() > today.getTime()) {
      status = "future";
    } else if (dailyGoal > 0) {
      status = minutes >= dailyGoal ? "done" : minutes > 0 ? "partial" : "empty";
    } else {
      status = minutes > 0 ? "done" : "empty";
    }

    cells.push({ date: dateStr, minutes, status });
  }

  return { cells, totalDays, truncated: totalDays > maxDays };
}

export function allTags(data) {
  const set = new Set();
  data.logs.forEach((l) => (l.tags || []).forEach((t) => set.add(t)));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
}

export function formatMinutes(minutes) {
  const total = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}
