import * as storage from "./storage.js";
import { buildContext, pendingSettlements } from "./stats.js";
import { loadHolidays, holidaysLoaded } from "./holidays.js";
import { renderWeek, renderToday, renderProgress, renderExam, renderHistory, renderSettings } from "./ui.js";
import { renderSettleSheet } from "./ui/settle.js";
import { conflictSheetHTML } from "./ui/syncui.js";
import { createActions } from "./actions.js";
import { bindInputHandlers } from "./inputs.js";
import { initSync, getSyncInfo } from "./sync.js";

const root = document.getElementById("view-root");
const overlay = document.getElementById("overlay-root");
const toastEl = document.getElementById("toast");
const tabButtons = document.querySelectorAll(".tab-btn");
const PICKER_ITEM_HEIGHT = 44;

const ui = {
  view: "week",
  examTrack: 2,
  progressTrack: 2,
  showRef: true,
  hiddenSeries: { 1: new Set(), 2: new Set() },
  selectedGoalId: null,
  editing: false,
  pick: 5,
  pickerOpen: false,
  pickerAnim: false,
  revealSelected: false,
  quietOpen: false,
  tomorrowOpen: false,
  revealed: new Set(), // 내일 미리보기에서 뒤집어 본 카드("날짜|목표id")
  bonusPick: false,
  bonusDate: null,
  bonusAmounts: null,
  weekMonth: null,
  sec: {}
};

let toastTimer = null;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("on"), 2200);
}

function render() {
  const today = storage.appToday();
  const dawn = storage.dawnInfo();
  if (holidaysLoaded()) storage.freezeDayTargets(today);
  const data = storage.getData();
  const ctx = buildContext(data);

  if (ui.view === "week") root.innerHTML = renderWeek(data, ctx, today, ui);
  else if (ui.view === "today") root.innerHTML = renderToday(data, ctx, today, ui, dawn);
  else if (ui.view === "progress") root.innerHTML = renderProgress(data, ui, today);
  else if (ui.view === "exam") root.innerHTML = renderExam(data, ui, today);
  else if (ui.view === "history") root.innerHTML = renderHistory(data, ctx, today);
  else root.innerHTML = renderSettings(data, today, storage.legacyDataJson() !== null, getSyncInfo(), ui);

  tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === ui.view));
  const picker = document.getElementById("picker");
  if (picker) picker.scrollTop = ui.pick * PICKER_ITEM_HEIGHT;
  if (ui.revealSelected) revealSelectedRow();
  showAppVersion();
}

// 고른 과목 행이 입력 시트에 가려지면 시트 위로 스크롤해서 보이게 한다
function revealSelectedRow() {
  ui.revealSelected = false;
  const row = root.querySelector(".goal-row.selected");
  const sheet = root.querySelector(".picker-sheet");
  if (!row || !sheet) return;
  const limit = sheet.getBoundingClientRect().top - 8;
  const rect = row.getBoundingClientRect();
  if (rect.bottom > limit) window.scrollBy({ top: rect.bottom - limit, behavior: "smooth" });
  else if (rect.top < 60) window.scrollBy({ top: rect.top - 60, behavior: "smooth" });
}

// 서비스워커 캐시 이름(cta-static-vN)에서 지금 받아 둔 앱 버전을 읽어 설정 화면에 보여준다
function showAppVersion() {
  const el = document.querySelector("[data-app-version]");
  if (!el || !window.caches) return;
  caches.keys().then((keys) => {
    const name = keys.filter((k) => k.startsWith("cta-static-")).sort().pop();
    if (name) el.textContent = ` · ${name.replace("cta-static-", "")}`;
  });
}

function switchView(view) {
  ui.view = view;
  ui.editing = false;
  ui.pickerOpen = false;
  ui.bonusPick = false;
  ui.weekMonth = null;
  render();
  window.scrollTo(0, 0);
}

function showSettleSheet({ silent } = {}) {
  const data = storage.getData();
  const days = pendingSettlements(data, buildContext(data), storage.appToday());
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

let conflictResolver = null;

function askConflict(info) {
  return new Promise((resolve) => {
    conflictResolver = resolve;
    overlay.innerHTML = conflictSheetHTML(info);
  });
}

function resolveConflict(choice) {
  overlay.innerHTML = "";
  if (conflictResolver) conflictResolver(choice === "later" ? null : choice);
  conflictResolver = null;
}

const { actions, announceRounds } = createActions({ ui, render, toast, overlay, showSettleSheet, closeSheet, resolveConflict });
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
      const add = document.querySelector('[data-action="add-entry"]');
      if (add) add.textContent = `+ ${ui.pick}${add.dataset.unit} 추가`;
    }
  },
  true
);

render();
loadHolidays().then(render);

// 열 때 GitHub와 먼저 맞추고(다른 기기 데이터가 들어올 수 있음) 그 다음에 이월 확인을 묻는다
initSync({
  toast,
  askConflict,
  onApplied() {
    toast("GitHub에서 최신 데이터를 불러왔어요");
    render();
  },
  onStatus(text) {
    const el = document.querySelector("[data-sync-status]");
    if (el) el.textContent = text;
  }
}).then(() => showSettleSheet({ silent: true }));

if ("serviceWorker" in navigator) {
  // 새 서비스워커가 활성화되면 한 번 새로고침해서 새 버전 화면으로 바꾼다(첫 설치는 제외)
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((err) => console.error("SW registration failed", err));
  });
}
