import * as storage from "./storage.js";
import { addDays, monthKey, shiftMonth, formatKoreanDate } from "./dates.js";
import { trackAt, buildContext, dayReport, historyEnd, computeTargets, lightTarget } from "./stats.js";
import { bonusSavings, bonusBlockReason, bonusMaxFor, bonusMinutes } from "./bonus.js";
import { bonusSheetHTML, bonusCancelSheetHTML } from "./ui/bonus.js";
import { dayInfoSheetHTML, restSheetHTML } from "./ui/dayinfo.js";
import { postponeSheetHTML, todayPostponeLimits } from "./ui/postpone.js";
import { postponeOut } from "./postpone.js";
import { formatDuration, confirmReplan, subjectColor } from "./ui/shared.js";
import { maintenanceGoals } from "./plan.js";
import { countUnit } from "./presets.js";
import * as sync from "./sync.js";
import { hitFx } from "./ui/fx.js";
import * as sw from "./stopwatch.js";
import { todayPull } from "./weekplan.js";

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
    const target = row ? (storage.isLightDay(today) ? lightTarget(row.target) : row.target) : 0;
    const left = row ? target - row.done - row.prepaid : 0;
    return left > 0 ? Math.min(10, left) : ui.pick;
  }

  function showBonusSheet() {
    const data = storage.getData();
    overlay.innerHTML = bonusSheetHTML(data, buildContext(data), storage.appToday(), ui);
  }

  function showPostponeSheet() {
    const data = storage.getData();
    overlay.innerHTML = postponeSheetHTML(data, buildContext(data), storage.appToday(), ui);
  }

  const actions = {
    "toggle-weekly"() {
      const today = storage.appToday();
      ui.weeklyUntil = ui.weeklyUntil >= today ? "" : addDays(today, 6);
      localStorage.setItem("cta-weekly-until", ui.weeklyUntil);
      ui.pickerOpen = false;
      ui.editing = false;
      render();
    },
    "set-track"(btn) {
      const track = Number(btn.dataset.track);
      const data = storage.getData();
      if (trackAt(data, storage.appToday()) === track) return;
      if (!confirmReplan(`${track}차로 전환할까요?`)) return;
      storage.setActiveTrack(track);
      ui.selectedGoalId = null;
      ui.pickerOpen = false;
      render();
    },
    "cycle-day"(btn) {
      const date = btn.dataset.date;
      // 그 주에 이미 휴식일이 있으면 하루 더 넣을지, 그 휴식을 이 날로 옮길지 묻는다
      const rests = storage.getData().dayKinds[date] ? [] : storage.movableRestDays(date);
      if (rests.length) {
        overlay.innerHTML = restSheetHTML(storage.getData(), date, rests);
        return;
      }
      const { next } = storage.cycleDayKind(date);
      toast(next === "rest" ? "휴식일로 지정 · 쿼터 자동 조정" : "원상복귀");
      render();
    },
    "rest-add"(btn) {
      storage.cycleDayKind(btn.dataset.date);
      closeSheet();
      toast("휴식일을 하루 더 넣었어요 · 쿼터 자동 조정");
    },
    "rest-move"(btn) {
      storage.moveRestDay(btn.dataset.from, btn.dataset.date);
      closeSheet();
      toast(`휴식을 ${formatKoreanDate(btn.dataset.from)} → ${formatKoreanDate(btn.dataset.date)}로 옮겼어요`);
    },
    "day-info"(btn) {
      const data = storage.getData();
      overlay.innerHTML = dayInfoSheetHTML(data, buildContext(data), btn.dataset.date, storage.appToday());
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
      const max = bonusMaxFor(data, date, bonusSavings(data, buildContext(data), today));
      if (reason || max <= 0) {
        toast(reason || "그날 과목의 저축이 없어요");
        return;
      }
      ui.bonusDate = date;
      ui.bonusAmounts = {};
      showBonusSheet();
    },
    "bonus-goal-step"(btn) {
      const data = storage.getData();
      const today = storage.appToday();
      const goal = data.goals.find((g) => g.id === btn.dataset.goal);
      if (!goal) return;
      const targets = computeTargets(data, ui.bonusDate, true);
      const target = targets[goal.id] || 0;
      const saved = bonusSavings(data, buildContext(data), today).byGoal.get(goal.id)?.saved || 0;
      const amounts = ui.bonusAmounts || (ui.bonusAmounts = {});
      const current = amounts[goal.id] || 0;
      const step = Number(btn.dataset.step);
      if (step > 0) {
        if (current >= target || current >= saved) return;
        amounts[goal.id] = current + 1;
      } else {
        const next = Math.max(0, current - 1);
        if (next) amounts[goal.id] = next;
        else delete amounts[goal.id];
      }
      showBonusSheet();
    },
    "confirm-bonus"() {
      const data = storage.getData();
      const today = storage.appToday();
      const amounts = ui.bonusAmounts || {};
      const entries = Object.entries(amounts).filter(([, amt]) => amt > 0);
      if (bonusBlockReason(data, ui.bonusDate, today) || !entries.length) {
        closeSheet();
        return;
      }
      storage.setBonusRest(ui.bonusDate, Object.fromEntries(entries));
      const names = entries
        .map(([id, amt]) => {
          const g = data.goals.find((x) => x.id === id);
          return g ? `${g.subject} ${amt}${countUnit(g.unit)}` : "";
        })
        .filter(Boolean)
        .join(", ");
      const minutes = bonusMinutes(storage.getData(), ui.bonusDate);
      ui.bonusPick = false;
      ui.weekMonth = null;
      ui.bonusAmounts = null;
      closeSheet();
      toast(`${formatKoreanDate(ui.bonusDate)} ${names} 줄였어요 · ${formatDuration(minutes)} 저축에서 뺐어요`);
    },
    "bonus-day"(btn) {
      ui.bonusDate = btn.dataset.date;
      overlay.innerHTML = bonusCancelSheetHTML(storage.getData(), ui);
    },
    "cancel-bonus"() {
      storage.setBonusRest(ui.bonusDate, {});
      closeSheet();
      toast("보상 휴식을 취소했어요 · 줄인 양이 과목별 저축으로 돌아왔어요");
    },
    "open-settle"() {
      showSettleSheet();
    },
    "postpone-open"() {
      ui.postponeAmounts = { ...postponeOut(storage.getData(), storage.appToday()) };
      showPostponeSheet();
    },
    "postpone-step"(btn) {
      const data = storage.getData();
      const limit = todayPostponeLimits(data, buildContext(data), storage.appToday())[btn.dataset.goal];
      if (!limit) return;
      const amounts = ui.postponeAmounts || (ui.postponeAmounts = {});
      const next = Math.max(0, Math.min(limit.max, (amounts[btn.dataset.goal] || 0) + Number(btn.dataset.step)));
      if (next) amounts[btn.dataset.goal] = next;
      else delete amounts[btn.dataset.goal];
      showPostponeSheet();
    },
    "confirm-postpone"() {
      const data = storage.getData();
      const today = storage.appToday();
      const limits = todayPostponeLimits(data, buildContext(data), today);
      const amounts = Object.fromEntries(
        Object.entries(ui.postponeAmounts || {})
          .map(([id, n]) => [id, Math.min(n, limits[id]?.max || 0)])
          .filter(([, n]) => n > 0)
      );
      storage.setPostpone(today, amounts);
      ui.postponeAmounts = null;
      closeSheet();
      const names = Object.entries(amounts)
        .map(([id, n]) => {
          const g = data.goals.find((x) => x.id === id);
          return g ? `${g.subject} ${n}${countUnit(g.unit)}` : "";
        })
        .filter(Boolean)
        .join(", ");
      toast(names ? `${names} 넘겼어요 · 다음 공부일 목표에 더해져요` : "넘기기를 취소했어요");
    },
    "toggle-light"() {
      const today = storage.appToday();
      const on = !storage.isLightDay(today);
      storage.setLightDay(on ? today : null);
      toast(on ? "오늘은 가볍게 · 과목마다 절반만 채워요" : "원래 목표로 돌아왔어요");
      render();
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
      if (ui.pickerOpen) ui.pick = ui.weeklyUntil >= storage.appToday() ? 1 : suggestedPick(btn.dataset.id);
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
    "week-hours"(btn) {
      ui.weekHours = btn.dataset.which;
      render();
    },
    "toggle-sec"(btn) {
      ui.sec[btn.dataset.sec] = !ui.sec[btn.dataset.sec];
      render();
    },
    "toggle-workout-day"(btn) {
      const data = storage.getData();
      const dow = Number(btn.dataset.dow);
      const { days } = storage.currentWorkout(data, storage.appToday());
      const on = !days.includes(dow);
      if (!confirmReplan(`${btn.textContent}요일 운동일을 ${on ? "켤까요" : "끌까요"}?`)) return;
      storage.setWorkout({ days: on ? [...days, dow] : days.filter((d) => d !== dow) });
      toast(`${btn.textContent}요일 운동일 ${on ? "켬 🥊" : "끔"} · 오늘부터 남은 날이 다시 섞여요`);
      render();
    },
    "auto-all"() {
      const data = storage.getData();
      const today = storage.appToday();
      const goals = data.goals.filter((g) => !g.archived && g.planMode === "fixed");
      if (goals.length && !confirmReplan(`고정 과목 ${goals.length}개를 자동 계획으로 바꿀까요?`)) return;
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
      const today = storage.appToday();
      const dayState = () => {
        const data = storage.getData();
        const r = dayReport(data, buildContext(data, today), today, today);
        return r.kind || !r.rows.length ? "none" : r.status === "full" ? "full" : r.half ? "half" : "low";
      };
      const before = dayState();
      const amount = ui.pick;
      // v97 스톱워치: 이 과목 시계에 잰 시간이 있으면 입력에 붙이고 시계는 0부터 다시(1분 미만은 붙이지 않음)
      let ms = sw.take(goalId);
      if (ms < 60000) ms = 0;
      if (ms && ms / amount > 40 * 60000 &&
        !confirm(`1개당 평균 ${Math.round(ms / amount / 60000)}분으로 기록돼요(${sw.clock(ms)}).\n중간에 쉰 시간이 섞였다면 [취소]를 눌러 시간은 빼고 수량만 기록해요.`)) ms = 0;
      const result = storage.addEntry(goalId, amount, undefined, ms / 1000);
      if (!result) return;
      const data = storage.getData();
      const goal = data.goals.find((g) => g.id === goalId);
      if (result.rolled) announceRounds(goalId, result.rolled);
      const after = dayState();
      // v95 타격감: 숫자·불꽃·콤보 + 오늘 기록으로 당긴 완료 예정일, 절반(DOWN!)·완료(K.O.!) 순간 연출
      let pull = null;
      try { pull = todayPull(data, buildContext(data, today), goal, today); } catch (e) { pull = null; }
      hitFx({
        amount, unit: countUnit(goal.unit), subject: goal.subject, color: subjectColor(data, goal.subject), pull, ms,
        milestone: after === "full" && before !== "full" ? "ko" : after === "half" && before === "low" ? "down" : null
      });
      render();
    },
    "undo-entry"() {
      const removed = storage.removeLastEntryOn(storage.appToday());
      if (!removed) {
        toast("오늘 되돌릴 입력이 없어요");
        return;
      }
      const goal = storage.getData().goals.find((g) => g.id === removed.goalId);
      if (removed.sec > 0) sw.giveBack(removed.goalId, removed.sec * 1000);
      toast(`${goal ? goal.subject : "입력"} −${removed.amount}${goal ? countUnit(goal.unit) : ""} 취소했어요${removed.sec > 0 ? ` · ⏱ ${sw.clock(removed.sec * 1000)}는 시계로 돌려놨어요` : ""}`);
      render();
    },
    "sw-start"(btn) {
      const cur = sw.state();
      const goal = storage.getData().goals.find((g) => g.id === btn.dataset.id);
      if (cur && cur.goalId !== btn.dataset.id && cur.ms >= 60000) {
        const other = storage.getData().goals.find((g) => g.id === cur.goalId);
        if (!confirm(`${other ? other.subject : "다른 과목"} 시계에 ${sw.clock(cur.ms)}가 남아 있어요.\n기록하지 않고 버리고 ${goal ? goal.subject : ""} 시계를 시작할까요?`)) return;
      }
      sw.start(btn.dataset.id);
      render();
    },
    "sw-focus"() {
      ui.focusOpen = !ui.focusOpen;
      if (ui.focusOpen) ui.pickerOpen = false;
      render();
    },
    "sw-pause"() { sw.pause(); render(); },
    "sw-resume"() { sw.resume(); render(); },
    "sw-stop"() {
      const cur = sw.state();
      if (cur && cur.ms >= 60000 && !confirm(`${sw.clock(cur.ms)} 잰 시간을 기록하지 않고 끝낼까요?\n기록하려면 [취소] 후 문제 수를 추가하세요.`)) return;
      sw.stop();
      ui.focusOpen = false;
      render();
    },
    "sw-open"() {
      const cur = sw.state();
      if (!cur) return;
      ui.view = "today";
      ui.focusOpen = false;
      ui.selectedGoalId = cur.goalId;
      ui.pickerOpen = true;
      ui.pickerAnim = true;
      ui.revealSelected = true;
      render();
    },
    "toggle-edit"() {
      ui.editing = !ui.editing;
      render();
    },
    "days-step"(btn) {
      const goal = storage.getData().goals.find((g) => g.id === btn.dataset.id);
      if (!goal) return;
      const next = Math.max(1, Math.min(7, goal.daysPerWeek + Number(btn.dataset.step)));
      if (next === goal.daysPerWeek) return;
      if (!confirmReplan(`${goal.subject} 주 ${goal.daysPerWeek}일 → ${next}일로 바꿀까요?`)) return;
      storage.updateGoal(goal.id, { daysPerWeek: next });
      render();
    },
    "toggle-skip-workout"(btn) {
      const goal = storage.getData().goals.find((g) => g.id === btn.dataset.id);
      if (!goal) return;
      const next = !goal.skipWorkout;
      if (!confirmReplan(`${goal.subject} 운동일에 ${next ? "빼기" : "다시 넣기"}로 바꿀까요?`)) return;
      storage.updateGoal(goal.id, { skipWorkout: next });
      render();
    },
    "flip-card"(btn) {
      if (btn.dataset.key === "all") btn.dataset.keys.split(",").forEach((k) => ui.revealed.add(k));
      else ui.revealed.add(btn.dataset.key);
      render();
    },
    "archive-goal"(btn) {
      if (!confirmReplan("이 목표를 삭제할까요? 지난 기록은 남아요.")) return;
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
