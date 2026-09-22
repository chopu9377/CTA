import * as storage from "./storage.js";
import { monthKey, shiftMonth, formatKoreanDate } from "./dates.js";
import { trackAt, buildContext, dayReport, historyEnd } from "./stats.js";
import { bonusSavings, bonusBlockReason, bonusMaxFor, BONUS_STEP_MIN } from "./bonus.js";
import { bonusSheetHTML, bonusCancelSheetHTML } from "./ui/bonus.js";
import { formatDuration } from "./ui/shared.js";
import { maintenanceGoals, presetImpact } from "./plan.js";
import { WEEKDAY_PRESETS, countUnit } from "./presets.js";
import * as sync from "./sync.js";

const SYNC_RESULT_TEXT = {
  pushed: "GitHub에 올렸어요",
  adopted: "GitHub에서 불러왔어요",
  same: "이미 최신이에요",
  deferred: "나중에 다시 물어볼게요"
};

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

// data-action 값 → 처리 함수. app.js가 클릭을 위임해서 호출한다.
export function createActions({ ui, render, toast, overlay, showSettleSheet, closeSheet, resolveConflict }) {
  // 입력 대상: 오늘 활성 트랙의 목표 + 유지 모드로 켜진 다른 트랙 목표
  function currentGoalId() {
    const data = storage.getData();
    const today = storage.appToday();
    const goals = [
      ...data.goals.filter((g) => !g.archived && g.track === trackAt(data, today)),
      ...maintenanceGoals(data, today, today)
    ];
    const selected = goals.find((g) => g.id === ui.selectedGoalId) || goals[0];
    return selected ? selected.id : null;
  }

  function announceRounds(goalId, rolled) {
    if (!rolled) return;
    const goal = storage.getData().goals.find((g) => g.id === goalId);
    if (goal) toast(`${goal.subject} 1회독 완료! ${goal.round}회독을 시작해요`);
  }

  // 휠 기본값: 오늘 그 과목의 남은 목표량(없으면 지금 값 유지)
  function suggestedPick(goalId) {
    const data = storage.getData();
    const today = storage.appToday();
    const row = dayReport(data, buildContext(data), today, today).rows.find((r) => r.goal.id === goalId);
    const left = row ? row.target - row.done : 0;
    return left > 0 ? Math.min(10, left) : ui.pick;
  }

  function showBonusSheet() {
    const data = storage.getData();
    overlay.innerHTML = bonusSheetHTML(data, buildContext(data), storage.appToday(), ui);
  }

  const actions = {
    "set-track"(btn) {
      storage.setActiveTrack(Number(btn.dataset.track));
      ui.selectedGoalId = null;
      ui.pickerOpen = false;
      render();
    },
    "cycle-day"(btn) {
      const { next, blockedReview } = storage.cycleDayKind(btn.dataset.date);
      toast(blockedReview ? "복습일은 주 1일만 — 원상복귀했어요" : next === "rest" ? "휴식일로 지정 · 쿼터 자동 조정" : next === "review" ? "복습일로 지정 · 진도 없이 다시 떠올리는 날" : "원상복귀");
      render();
    },
    "bonus-toggle"() {
      ui.bonusPick = !ui.bonusPick;
      ui.weekMonth = null;
      render();
    },
    "bonus-month"(btn) {
      const data = storage.getData();
      const today = storage.appToday();
      const next = shiftMonth(ui.weekMonth || monthKey(today), Number(btn.dataset.step));
      if (next < monthKey(today) || next > monthKey(historyEnd(data, today))) return;
      ui.weekMonth = next;
      render();
    },
    "pick-bonus-day"(btn) {
      const data = storage.getData();
      const today = storage.appToday();
      const date = btn.dataset.date;
      const reason = bonusBlockReason(data, date, today);
      const max = bonusMaxFor(data, date, bonusSavings(data, buildContext(data), today).savedMin);
      if (reason || max < BONUS_STEP_MIN) {
        toast(reason || "저축이 모자라요");
        return;
      }
      ui.bonusDate = date;
      ui.bonusMinutes = max;
      showBonusSheet();
    },
    "bonus-step"(btn) {
      const data = storage.getData();
      const max = bonusMaxFor(data, ui.bonusDate, bonusSavings(data, buildContext(data), storage.appToday()).savedMin);
      ui.bonusMinutes = Math.min(max, Math.max(BONUS_STEP_MIN, ui.bonusMinutes + Number(btn.dataset.step) * BONUS_STEP_MIN));
      showBonusSheet();
    },
    "confirm-bonus"() {
      const data = storage.getData();
      const today = storage.appToday();
      const savedMin = bonusSavings(data, buildContext(data), today).savedMin;
      const minutes = Math.min(ui.bonusMinutes, bonusMaxFor(data, ui.bonusDate, savedMin));
      if (bonusBlockReason(data, ui.bonusDate, today) || minutes < BONUS_STEP_MIN) {
        closeSheet();
        return;
      }
      storage.setBonusRest(ui.bonusDate, minutes);
      ui.bonusPick = false;
      ui.weekMonth = null;
      closeSheet();
      toast(`${formatKoreanDate(ui.bonusDate)} ${formatDuration(minutes)} 보상 휴식으로 정했어요`);
    },
    "bonus-day"(btn) {
      ui.bonusDate = btn.dataset.date;
      overlay.innerHTML = bonusCancelSheetHTML(storage.getData(), ui);
    },
    "cancel-bonus"() {
      storage.setBonusRest(ui.bonusDate, 0);
      closeSheet();
      toast("보상 휴식을 취소했어요 · 시간이 저축으로 돌아왔어요");
    },
    "open-settle"() {
      showSettleSheet();
    },
    "toggle-dawn"(btn) {
      storage.setDawnChoice(btn.dataset.date);
      toast(`${formatKoreanDate(btn.dataset.date)} 걸로 기록해요`);
      render();
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
      const same = ui.pickerOpen && ui.selectedGoalId === btn.dataset.id;
      ui.selectedGoalId = btn.dataset.id;
      ui.pickerAnim = !ui.pickerOpen;
      ui.pickerOpen = !same;
      ui.revealSelected = ui.pickerOpen;
      if (ui.pickerOpen) ui.pick = suggestedPick(btn.dataset.id);
      render();
    },
    "close-picker"() {
      ui.pickerOpen = false;
      render();
    },
    "toggle-quiet"() {
      ui.quietOpen = !ui.quietOpen;
      render();
    },
    "toggle-tomorrow"() {
      ui.tomorrowOpen = !ui.tomorrowOpen;
      render();
    },
    "toggle-sec"(btn) {
      ui.sec[btn.dataset.sec] = !ui.sec[btn.dataset.sec];
      render();
    },
    "auto-all"() {
      const data = storage.getData();
      const today = storage.appToday();
      const goals = data.goals.filter((g) => !g.archived && g.planMode !== "auto");
      goals.forEach((g) => storage.updateGoal(g.id, { planMode: "auto", autoFrom: today }));
      toast(goals.length ? `${goals.length}개 과목을 자동 계획으로 바꿨어요` : "이미 모든 과목이 자동이에요");
      render();
    },
    "goto-input"(btn) {
      const { id, track, field } = btn.dataset;
      const selector = id ? `input[data-goal-field="${field}"][data-id="${id}"]` : `input[data-track-field="${field}"][data-track="${track}"]`;
      let input = document.querySelector(selector);
      if (!input) {
        const goal = id ? storage.getData().goals.find((g) => g.id === id) : null;
        if (id && !goal) return;
        if (id) Object.assign(ui.sec, { goals: true, [`goals${goal.track}`]: true });
        else ui.sec.track = true;
        render();
        input = document.querySelector(selector);
        if (!input) return;
      }
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      input.focus({ preventScroll: true });
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
      const goal = storage.getData().goals.find((g) => g.id === goalId);
      if (result.rolled) announceRounds(goalId, result.rolled);
      else toast(`${goal.subject} +${ui.pick}${countUnit(goal.unit)}`);
      render();
    },
    "undo-entry"() {
      const removed = storage.removeLastEntryOn(storage.appToday());
      if (!removed) {
        toast("오늘 되돌릴 입력이 없어요");
        return;
      }
      const goal = storage.getData().goals.find((g) => g.id === removed.goalId);
      toast(`${goal ? goal.subject : "입력"} −${removed.amount}${goal ? countUnit(goal.unit) : ""} 취소했어요`);
      render();
    },
    "toggle-edit"() {
      ui.editing = !ui.editing;
      render();
    },
    "apply-preset"(btn) {
      const track = trackAt(storage.getData(), storage.appToday());
      const { before, after } = presetImpact(storage.getData(), track, btn.dataset.preset);
      const change = `과목별 공부 요일 합계 ${before}칸 → ${after}칸`;
      const label = WEEKDAY_PRESETS.find((p) => p.key === btn.dataset.preset).label;
      if (!confirm(`"${label}"으로 요일을 바꿀까요?\n\n${change}으로 바뀌어요.\n자동 계획 과목은 남은 요일에 맞춰 목표를 다시 나눠요.`)) return;
      storage.applyWeekdayPreset(track, btn.dataset.preset);
      toast(`요일 패턴을 적용했어요 · ${change}`);
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
    "set-progress-track"(btn) {
      ui.progressTrack = Number(btn.dataset.track);
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
      downloadJson(storage.exportData(), `cta-backup-${storage.appToday()}.json`);
      storage.markBackup();
      render();
    },
    "import-data"() {
      document.getElementById("import-file-input").click();
    },
    async "sync-now"() {
      if (!sync.isConfigured()) {
        toast("저장소와 토큰을 먼저 입력해 주세요");
        return;
      }
      toast("동기화 중…");
      const result = await sync.syncNow();
      toast(result === "error" ? `동기화 실패: ${sync.lastError()}` : SYNC_RESULT_TEXT[result] || "완료");
    },
    "sync-disconnect"() {
      if (!confirm("GitHub 연결을 해제할까요? 이 기기의 토큰이 지워져요(GitHub의 데이터는 그대로예요).")) return;
      sync.disconnect();
      toast("연결을 해제했어요");
      render();
    },
    "conflict-choice"(btn) {
      resolveConflict(btn.dataset.choice);
    },
    "export-legacy"() {
      downloadJson(storage.legacyDataJson(), `cta-legacy-backup-${storage.appToday()}.json`);
    }
  };

  return { actions, announceRounds };
}
