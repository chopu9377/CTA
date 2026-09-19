import * as storage from "./storage.js";
import { todayStr } from "./dates.js";
import { buildContext, pendingSettlements } from "./stats.js";
import { loadHolidays } from "./holidays.js";
import { renderWeek, renderToday, renderExam, renderHistory, renderSettings } from "./ui.js";
import { renderSettleSheet } from "./ui/settle.js";
import { createActions } from "./actions.js";
import { bindInputHandlers } from "./inputs.js";

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

const { actions, announceRounds } = createActions({ ui, render, toast, overlay, showSettleSheet, closeSheet });
bindInputHandlers({ ui, render, toast, closeSheet, announceRounds });

document.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-action]");
  if (btn && actions[btn.dataset.action]) actions[btn.dataset.action](btn);
});

tabButtons.forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));

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
