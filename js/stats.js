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

export function periodSummary(data, refDate = new Date()) {
  const weekStart = startOfWeek(refDate);
  const weekEnd = endOfWeek(refDate);
  const monthStart = startOfMonth(refDate);
  const monthEnd = endOfMonth(refDate);

  const weekLogs = logsInRange(data.logs, weekStart, weekEnd);
  const monthLogs = logsInRange(data.logs, monthStart, monthEnd);

  const weekGoal = data.subjects.reduce((sum, s) => sum + (s.weeklyGoalMinutes || 0), 0);
  const monthGoal = data.subjects.reduce((sum, s) => sum + (s.monthlyGoalMinutes || 0), 0);

  const weekActual = sumMinutes(weekLogs);
  const monthActual = sumMinutes(monthLogs);
  const totalActual = sumMinutes(data.logs);

  return {
    week: { actual: weekActual, goal: weekGoal, rate: achievementRate(weekActual, weekGoal) },
    month: { actual: monthActual, goal: monthGoal, rate: achievementRate(monthActual, monthGoal) },
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
    const weekActual = sumMinutes(logsInRange(subjectLogs, weekStart, weekEnd));
    const monthActual = sumMinutes(logsInRange(subjectLogs, monthStart, monthEnd));
    return {
      id: s.id,
      name: s.name,
      weekActual,
      weekGoal: s.weeklyGoalMinutes || 0,
      weekRate: achievementRate(weekActual, s.weeklyGoalMinutes),
      monthActual,
      monthGoal: s.monthlyGoalMinutes || 0,
      monthRate: achievementRate(monthActual, s.monthlyGoalMinutes),
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
