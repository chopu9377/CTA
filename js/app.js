import * as storage from "./storage.js";
import { todayStr } from "./dates.js";
import { buildContext, pendingSettlements, trackAt } from "./stats.js";
import { loadHolidays } from "./holidays.js";
import { EXAM_SUBJECTS } from "./presets.js";
import { renderWeek, renderToday, renderExam, renderHistory, renderSettings } from "./ui.js";
import { renderSettleSheet } from "./ui/settle.js";

const root = document.getElementById("view-root");
const overlay = document.getElementById("overlay-root");
const toastEl = document.getElementById("toast");
const tabButtons = document.querySelectorAll(".tab-btn");
const PICKER_ITEM_HEIGHT = 44;

const ui = {
  view: "week",
  examTrack: 2,
  showRef: true,
  hiddenSeries: { 1: new Set(), 2: new Set() },
  selectedGoalId: null,
  editing: false,
  pick: 5,
  lastEntryId: null
};

let toastTimer = null;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("on"), 2200);
}

function render() {
  const today = todayStr();
  storage.freezeDayTargets(today);
  const data = storage.getData();
  const ctx = buildContext(data);

  if (ui.view === "week") root.innerHTML = renderWeek(data, ctx, today);
  else if (ui.view === "today") root.innerHTML = renderToday(data, ctx, today, ui);
  else if (ui.view === "exam") root.innerHTML = renderExam(data, ui, today);
  else if (ui.view === "history") root.innerHTML = renderHistory(data, ctx, today);
  else root.innerHTML = renderSettings(data, today, storage.legacyDataJson() !== null);

  tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === ui.view));
  const picker = document.getElementById("picker");
  if (picker) picker.scrollTop = ui.pick * PICKER_ITEM_HEIGHT;
}

function switchView(view) {
  ui.view = view;
  ui.editing = false;
  render();
  window.scrollTo(0, 0);
}

function currentGoalId() {
  const data = storage.getData();
  const track = trackAt(data, todayStr());
  const goals = data.goals.filter((g) => !g.archived && g.track === track);
  const selected = goals.find((g) => g.id === ui.selectedGoalId) || goals[0];
  return selected ? selected.id : null;
}

function downloadJson(json, filename) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function showSettleSheet({ silent } = {}) {
  const data = storage.getData();
  const days = pendingSettlements(data, buildContext(data), todayStr());
  if (!days.length) {
    if (!silent) toast("정할 미달분이 없어요");
    return;
  }
  overlay.innerHTML = renderSettleSheet(days, data);
}

function closeSheet() {
  overlay.innerHTML = "";
  render();
}

function announceRounds(goalId, rolled) {
  if (!rolled) return;
  const goal = storage.getData().goals.find((g) => g.id === goalId);
  if (goal) toast(`${goal.subject} 1회독 완료! ${goal.round}회독을 시작해요`);
}

const actions = {
  "set-track"(btn) {
    storage.setActiveTrack(Number(btn.dataset.track));
    ui.selectedGoalId = null;
    render();
  },
  "toggle-focus"() {
    storage.setSetting("focusMode", !storage.getData().settings.focusMode);
    render();
  },
  "cycle-day"(btn) {
    const { next, blockedReview } = storage.cycleDayKind(btn.dataset.date);
    toast(blockedReview ? "복습일은 주 1일만 — 원상복귀했어요" : next === "rest" ? "휴식일로 지정 · 쿼터 자동 조정" : next === "review" ? "복습일로 지정 · 진도 없이 다시 떠올리는 날" : "원상복귀");
    render();
  },
  "open-settle"() {
    showSettleSheet();
  },
  "close-sheet"() {
    closeSheet();
  },
  "settle-all"(btn) {
    overlay.querySelectorAll(`input[type="radio"][value="${btn.dataset.value}"]`).forEach((radio) => {
      radio.checked = true;
    });
  },
  "select-goal"(btn) {
    ui.selectedGoalId = btn.dataset.id;
    render();
  },
  "add-entry"() {
    const goalId = currentGoalId();
    if (!goalId) return;
    if (ui.pick <= 0) {
      toast("0은 추가할 게 없어요");
      return;
    }
    const result = storage.addEntry(goalId, ui.pick);
    if (!result) return;
    ui.lastEntryId = result.entry.id;
    const goal = storage.getData().goals.find((g) => g.id === goalId);
    if (result.rolled) announceRounds(goalId, result.rolled);
    else toast(`${goal.subject} +${ui.pick}`);
    render();
  },
  "undo-entry"() {
    if (!ui.lastEntryId) {
      toast("되돌릴 입력이 없어요");
      return;
    }
    storage.removeEntry(ui.lastEntryId);
    ui.lastEntryId = null;
    toast("되돌렸어요");
    render();
  },
  "toggle-edit"() {
    ui.editing = !ui.editing;
    render();
  },
  "toggle-weekday"(btn) {
    const goal = storage.getData().goals.find((g) => g.id === btn.dataset.id);
    if (!goal) return;
    const day = Number(btn.dataset.day);
    const weekdays = goal.weekdays.includes(day) ? goal.weekdays.filter((d) => d !== day) : [...goal.weekdays, day].sort();
    storage.updateGoal(goal.id, { weekdays });
    render();
  },
  "archive-goal"(btn) {
    if (!confirm("이 목표를 삭제할까요? 지난 기록은 남아요.")) return;
    storage.archiveGoal(btn.dataset.id);
    render();
  },
  "set-exam-track"(btn) {
    ui.examTrack = Number(btn.dataset.track);
    render();
  },
  "toggle-ref"() {
    ui.showRef = !ui.showRef;
    render();
  },
  "toggle-series"(btn) {
    const set = ui.hiddenSeries[ui.examTrack];
    const index = Number(btn.dataset.index);
    if (set.has(index)) set.delete(index);
    else set.add(index);
    render();
  },
  "delete-exam"(btn) {
    if (!confirm("이 기록을 삭제할까요?")) return;
    storage.deleteExamRecord(Number(btn.dataset.track), btn.dataset.id);
    render();
  },
  "export-data"() {
    downloadJson(storage.exportData(), `cta-backup-${todayStr()}.json`);
    storage.markBackup();
    render();
  },
  "import-data"() {
    document.getElementById("import-file-input").click();
  },
  "export-legacy"() {
    downloadJson(storage.legacyDataJson(), `cta-legacy-backup-${todayStr()}.json`);
  }
};

document.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-action]");
  if (btn && actions[btn.dataset.action]) actions[btn.dataset.action](btn);
});

tabButtons.forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));

document.addEventListener("submit", (event) => {
  const form = event.target;
  const fd = new FormData(form);

  if (form.matches('[data-form="add-goal"]')) {
    event.preventDefault();
    const subject = String(fd.get("subject")).trim();
    const unit = String(fd.get("unit")).trim();
    if (!subject || !unit) return;
    storage.addGoal(trackAt(storage.getData(), todayStr()), subject, unit);
    render();
  } else if (form.matches('[data-form="add-exam"]')) {
    event.preventDefault();
    const scores = EXAM_SUBJECTS[ui.examTrack].map((_, i) => Number(fd.get(`score${i}`)));
    storage.addExamRecord(ui.examTrack, { date: fd.get("date"), label: String(fd.get("label") || "").trim(), scores });
    toast("기록했어요");
    render();
  } else if (form.matches('[data-form="settle"]')) {
    event.preventDefault();
    const data = storage.getData();
    const days = pendingSettlements(data, buildContext(data), todayStr());
    days.forEach((day) => storage.settleDay(day.date, fd.get(`d:${day.date}`) || "carried", day.shortfalls));
    toast("반영했어요");
    closeSheet();
  }
});

function applyGoalField(input) {
  const field = input.dataset.goalField;
  if (field === "cumulative") {
    const result = storage.setCumulative(input.dataset.id, parseInt(input.value, 10) || 0);
    const goal = storage.getData().goals.find((g) => g.id === input.dataset.id);
    if (result && goal) toast(`${goal.subject}: ${result.round}회독 ${result.progress}${result.total ? `/${result.total}` : ""}로 반영`);
    return;
  }
  let value = input.value;
  if (field === "subject" || field === "unit") {
    value = value.trim();
    if (!value) return;
  } else {
    value = Math.max(0, parseInt(value, 10) || 0);
  }
  const { rolled } = storage.updateGoal(input.dataset.id, { [field]: value });
  if (rolled) {
    announceRounds(input.dataset.id, rolled);
    render();
  }
}

// 입력칸 값은 바로 저장만 하고 다시 그리지 않는다(다음 칸 탭이 끊기지 않게). 다른 탭으로 가면 반영됨.
document.addEventListener("change", (event) => {
  const el = event.target;

  if (el.dataset.goalField) applyGoalField(el);
  else if (el.dataset.trackField) {
    const field = el.dataset.trackField;
    const value = field === "examEstimated" ? el.checked : el.value || null;
    storage.setTrackInfo(Number(el.dataset.track), { [field]: value });
  } else if (el.dataset.setting) {
    storage.setSetting(el.dataset.setting, el.checked);
  } else if (el.dataset.colorName) {
    storage.setSubjectColor(el.dataset.colorName, el.value);
  } else if (el.id === "import-file-input") {
    const file = el.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        storage.importData(reader.result);
        toast("백업을 불러왔어요");
        render();
      } catch (e) {
        alert("불러오기에 실패했어요: " + e.message);
      }
    };
    reader.readAsText(file);
    el.value = "";
  }
});

document.addEventListener(
  "scroll",
  (event) => {
    if (event.target.id === "picker") {
      ui.pick = Math.min(10, Math.max(0, Math.round(event.target.scrollTop / PICKER_ITEM_HEIGHT)));
    }
  },
  true
);

render();
loadHolidays().then(render);
showSettleSheet({ silent: true });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((err) => console.error("SW registration failed", err));
  });
}
