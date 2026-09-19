import * as storage from "./storage.js";
import { todayStr } from "./dates.js";
import { trackAt, paceFor } from "./stats.js";

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
export function createActions({ ui, render, toast, overlay, showSettleSheet, closeSheet }) {
  function currentGoalId() {
    const data = storage.getData();
    const goals = data.goals.filter((g) => !g.archived && g.track === trackAt(data, todayStr()));
    const selected = goals.find((g) => g.id === ui.selectedGoalId) || goals[0];
    return selected ? selected.id : null;
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
    "apply-pace"(btn) {
      storage.updateGoal(btn.dataset.id, { weekdayTarget: Number(btn.dataset.weekday), weekendTarget: Number(btn.dataset.weekend) });
      toast("평일/주말 목표에 적용했어요");
      render();
    },
    "apply-all-pace"() {
      const data = storage.getData();
      const today = todayStr();
      let count = 0;
      data.goals
        .filter((g) => !g.archived && g.track === trackAt(data, today))
        .forEach((goal) => {
          const pace = paceFor(data, goal, today);
          if (!pace || pace.perWeekday === null || pace.left <= 0) return;
          storage.updateGoal(goal.id, { weekdayTarget: pace.perWeekday, weekendTarget: pace.perWeekend });
          count++;
        });
      toast(count ? `${count}개 목표에 권장량을 적용했어요` : "적용할 권장량이 없어요");
      render();
    },
    "apply-preset"(btn) {
      if (!confirm("현재 과목별 요일 설정을 이 프리셋으로 바꿀까요?")) return;
      storage.applyWeekdayPreset(trackAt(storage.getData(), todayStr()), btn.dataset.preset);
      toast("요일 패턴을 적용했어요");
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

  return { actions, announceRounds };
}
