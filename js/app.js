import * as storage from "./storage.js";
import { toISODate } from "./stats.js";
import { renderDashboard, renderLog, renderGoal, renderVolume, renderSubjects, renderSettings } from "./ui.js";

const root = document.getElementById("view-root");
const tabButtons = document.querySelectorAll(".tab-btn");
let currentView = "dashboard";
let logTagFilter = "";
let planDate = toISODate(new Date());

function render() {
  const data = storage.getData();
  if (currentView === "dashboard") root.innerHTML = renderDashboard(data);
  else if (currentView === "log") root.innerHTML = renderLog(data, logTagFilter);
  else if (currentView === "goal") root.innerHTML = renderGoal(data, planDate);
  else if (currentView === "volume") root.innerHTML = renderVolume(data);
  else if (currentView === "subjects") root.innerHTML = renderSubjects(data);
  else root.innerHTML = renderSettings(data);

  tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === currentView));
}

function switchView(view) {
  currentView = view;
  render();
}

function exportBackup() {
  const json = storage.exportData();
  storage.markBackup();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cta-backup-${toISODate(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  render();
}

tabButtons.forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));

root.addEventListener("submit", (event) => {
  const form = event.target;

  if (form.matches('[data-form="add-log"]')) {
    event.preventDefault();
    const fd = new FormData(form);
    const [subjectId, materialId] = String(fd.get("target")).split("|");
    const tags = String(fd.get("tags") || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    storage.addLog({
      date: fd.get("date"),
      subjectId,
      materialId: materialId || null,
      durationMinutes: parseInt(fd.get("durationMinutes"), 10),
      content: fd.get("content"),
      tags
    });
    render();
  } else if (form.matches('[data-form="set-exam"]')) {
    event.preventDefault();
    const fd = new FormData(form);
    storage.setExamInfo({
      name: fd.get("examName"),
      date: fd.get("examDate") || null
    });
    render();
  } else if (form.matches('[data-form="set-daily-plan"]')) {
    event.preventDefault();
    const fd = new FormData(form);
    const date = fd.get("planDate");
    const allocations = {};
    for (const [key, value] of fd.entries()) {
      if (!key.startsWith("alloc:")) continue;
      allocations[key.slice("alloc:".length)] = Math.round(parseFloat(value || "0") * 60);
    }
    storage.setDailyPlan(date, allocations);
    planDate = date;
    render();
  } else if (form.matches('[data-form="add-subject"]')) {
    event.preventDefault();
    const fd = new FormData(form);
    storage.addSubject({
      name: fd.get("name"),
      weeklyGoalMinutes: Math.round(parseFloat(fd.get("weeklyGoalHours") || "0") * 60),
      weekendGoalMinutes: Math.round(parseFloat(fd.get("weekendGoalHours") || "0") * 60)
    });
    render();
  } else if (form.matches('[data-form="update-subject-goals"]')) {
    event.preventDefault();
    const fd = new FormData(form);
    storage.updateSubjectGoals(form.dataset.subjectId, {
      weeklyGoalMinutes: Math.round(parseFloat(fd.get("weeklyGoalHours") || "0") * 60),
      weekendGoalMinutes: Math.round(parseFloat(fd.get("weekendGoalHours") || "0") * 60)
    });
    render();
  } else if (form.matches('[data-form="add-material"]')) {
    event.preventDefault();
    const fd = new FormData(form);
    storage.addMaterial(form.dataset.subjectId, fd.get("name"), parseInt(fd.get("targetRounds"), 10) || 0);
    render();
  } else if (form.matches('[data-form="set-target"]')) {
    event.preventDefault();
    const fd = new FormData(form);
    storage.setMaterialTarget(form.dataset.subjectId, form.dataset.materialId, parseInt(fd.get("targetRounds"), 10) || 0);
    render();
  }
});

root.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-action]");
  if (!btn) return;

  switch (btn.dataset.action) {
    case "delete-log":
      if (confirm("이 기록을 삭제할까요?")) {
        storage.deleteLog(btn.dataset.id);
        render();
      }
      break;
    case "delete-subject":
      if (confirm("과목과 관련된 모든 기록을 삭제할까요?")) {
        storage.deleteSubject(btn.dataset.id);
        render();
      }
      break;
    case "delete-material":
      if (confirm("교재를 삭제할까요?")) {
        storage.deleteMaterial(btn.dataset.subjectId, btn.dataset.materialId);
        render();
      }
      break;
    case "complete-round":
      storage.completeRound(btn.dataset.subjectId, btn.dataset.materialId);
      render();
      break;
    case "export-data":
      exportBackup();
      break;
    case "import-data":
      document.getElementById("import-file-input").click();
      break;
  }
});

root.addEventListener("change", (event) => {
  if (event.target.id === "tag-filter") {
    logTagFilter = event.target.value;
    render();
    return;
  }
  if (event.target.id === "plan-date") {
    planDate = event.target.value;
    render();
    return;
  }
  if (event.target.id !== "import-file-input") return;
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      storage.importData(reader.result);
      alert("백업을 불러왔어요.");
      render();
    } catch (e) {
      alert("불러오기에 실패했어요: " + e.message);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
});

render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((err) => console.error("SW registration failed", err));
  });
}
