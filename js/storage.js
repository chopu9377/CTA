const STORAGE_KEY = "cta-study-tracker-data";
const SCHEMA_VERSION = 1;

let cache = null;

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function emptyData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    subjects: [],
    logs: [],
    meta: { lastBackupAt: null, examName: "", examDate: null, dailyGoalMinutes: 0 }
  };
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

// Fills in any fields a newer app version added, without discarding existing
// data just because schemaVersion differs. Only truly unreadable data (not an
// object, or missing the core arrays) falls back to an empty dataset.
function normalize(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.subjects) || !Array.isArray(data.logs)) {
    return emptyData();
  }
  data.schemaVersion = SCHEMA_VERSION;
  data.meta = data.meta || {};
  data.meta.lastBackupAt = data.meta.lastBackupAt || null;
  data.meta.examName = data.meta.examName || "";
  data.meta.examDate = data.meta.examDate || null;
  data.meta.dailyGoalMinutes = data.meta.dailyGoalMinutes || 0;
  data.subjects.forEach((s) => {
    s.weeklyGoalMinutes = s.weeklyGoalMinutes || 0;
    s.monthlyGoalMinutes = s.monthlyGoalMinutes || 0;
    s.materials = s.materials || [];
    s.materials.forEach((m) => {
      m.roundHistory = m.roundHistory || [];
      m.targetRounds = m.targetRounds || 0;
    });
  });
  data.logs.forEach((l) => {
    l.tags = l.tags || [];
  });
  return data;
}

export function getData() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = normalize(raw ? JSON.parse(raw) : null);
  } catch (e) {
    console.error("CTA: failed to load saved data, starting fresh", e);
    cache = emptyData();
  }
  return cache;
}

export function addSubject({ name, weeklyGoalMinutes, monthlyGoalMinutes }) {
  const data = getData();
  const subject = {
    id: uid(),
    name,
    weeklyGoalMinutes: weeklyGoalMinutes || 0,
    monthlyGoalMinutes: monthlyGoalMinutes || 0,
    materials: []
  };
  data.subjects.push(subject);
  persist();
  return subject;
}

export function deleteSubject(subjectId) {
  const data = getData();
  data.subjects = data.subjects.filter((s) => s.id !== subjectId);
  data.logs = data.logs.filter((l) => l.subjectId !== subjectId);
  persist();
}

export function addMaterial(subjectId, name, targetRounds) {
  const data = getData();
  const subject = data.subjects.find((s) => s.id === subjectId);
  if (!subject) return null;
  const material = { id: uid(), name, roundHistory: [], targetRounds: targetRounds || 0 };
  subject.materials.push(material);
  persist();
  return material;
}

export function setMaterialTarget(subjectId, materialId, targetRounds) {
  const data = getData();
  const subject = data.subjects.find((s) => s.id === subjectId);
  const material = subject && subject.materials.find((m) => m.id === materialId);
  if (!material) return;
  material.targetRounds = targetRounds || 0;
  persist();
}

export function deleteMaterial(subjectId, materialId) {
  const data = getData();
  const subject = data.subjects.find((s) => s.id === subjectId);
  if (!subject) return;
  subject.materials = subject.materials.filter((m) => m.id !== materialId);
  data.logs.forEach((l) => {
    if (l.materialId === materialId) l.materialId = null;
  });
  persist();
}

export function completeRound(subjectId, materialId) {
  const data = getData();
  const subject = data.subjects.find((s) => s.id === subjectId);
  const material = subject && subject.materials.find((m) => m.id === materialId);
  if (!material) return;
  const roundNumber = material.roundHistory.length + 1;
  material.roundHistory.push({ roundNumber, completedAt: new Date().toISOString() });
  persist();
}

export function addLog({ date, subjectId, materialId, durationMinutes, content, tags }) {
  const data = getData();
  const log = {
    id: uid(),
    date,
    subjectId,
    materialId: materialId || null,
    durationMinutes,
    content: content || "",
    tags: tags && tags.length ? tags : []
  };
  data.logs.push(log);
  persist();
  return log;
}

export function deleteLog(logId) {
  const data = getData();
  data.logs = data.logs.filter((l) => l.id !== logId);
  persist();
}

export function exportData() {
  return JSON.stringify(getData(), null, 2);
}

export function importData(json) {
  const parsed = JSON.parse(json);
  if (!parsed || !Array.isArray(parsed.subjects) || !Array.isArray(parsed.logs)) {
    throw new Error("지원하지 않는 백업 파일 형식입니다.");
  }
  cache = normalize(parsed);
  persist();
}

export function markBackup() {
  const data = getData();
  data.meta.lastBackupAt = new Date().toISOString();
  persist();
}

export function getLastBackupAt() {
  return getData().meta.lastBackupAt;
}

export function setExamInfo({ name, date, dailyGoalMinutes }) {
  const data = getData();
  data.meta.examName = name || "";
  data.meta.examDate = date || null;
  data.meta.dailyGoalMinutes = dailyGoalMinutes || 0;
  persist();
}
