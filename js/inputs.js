import * as storage from "./storage.js";
import { buildContext, pendingSettlements, trackAt } from "./stats.js";
import { EXAM_SUBJECTS } from "./presets.js";
import { paceMissing } from "./plan.js";
import { paceSlotHTML, planTreeHTML } from "./ui.js";
import { confirmReplan, eul } from "./ui/shared.js";
import * as sync from "./sync.js";

function refreshLoadSlot() {
  const slot = document.querySelector("[data-slot-plan]");
  if (slot && slot.innerHTML.trim()) slot.innerHTML = planTreeHTML(storage.getData(), storage.appToday());
}

function refreshPaceSlot(goalId) {
  const slot = document.querySelector(`[data-slot-for="${goalId}"]`);
  const goal = storage.getData().goals.find((g) => g.id === goalId);
  if (slot && goal) slot.innerHTML = paceSlotHTML(storage.getData(), goal, storage.appToday());
  refreshLoadSlot();
}

function refreshAllPaceSlots() {
  document.querySelectorAll("[data-slot-for]").forEach((slot) => refreshPaceSlot(slot.dataset.slotFor));
}

// 폼 제출과 입력칸 변경 처리. 입력칸 값은 바로 저장만 하고 화면 전체는 다시 그리지 않는다
// (다음 칸 탭이 끊기지 않게). 권장량 영역만 그 자리에서 갱신하고, 다른 탭에 가면 나머지가 반영된다.
export function bindInputHandlers({ ui, render, toast, closeSheet, announceRounds }) {
  function applyGoalField(input) {
    const field = input.dataset.goalField;
    const goal0 = storage.getData().goals.find((g) => g.id === input.dataset.id);
    // 계획에 영향을 주는 값이 실제로 바뀔 때만 묻고, 취소하면 원래 값으로 다시 그린다
    if (goal0 && (field === "cumulative" || storage.PLAN_FIELDS.includes(field))) {
      const now = field === "cumulative" ? null : String(goal0[field]);
      const label = { cumulative: "누적 푼 양", planMode: "하루 목표 모드", total: "총 분량", targetRounds: "목표 회독", minutesPerUnit: "1개당 소요 시간" }[field] || "목표량";
      if (now !== String(input.value) && !confirmReplan(`${goal0.subject} ${eul(label)} 바꿀까요?`)) {
        render();
        return;
      }
    }
    if (field === "cumulative") {
      const result = storage.setCumulative(input.dataset.id, parseInt(input.value, 10) || 0);
      const goal = storage.getData().goals.find((g) => g.id === input.dataset.id);
      if (result && goal) toast(`${goal.subject}: ${result.round}회독 ${result.progress}${result.total ? `/${result.total}` : ""}로 반영`);
      refreshPaceSlot(input.dataset.id);
      return;
    }
    if (field === "planMode") {
      const goalId = input.dataset.id;
      const mode = input.value === "auto" || input.value === "fill" ? input.value : "fixed";
      storage.updateGoal(goalId, { planMode: mode, autoFrom: mode === "auto" ? storage.appToday() : null });
      const goal = storage.getData().goals.find((g) => g.id === goalId);
      const missing = goal ? paceMissing(storage.getData(), goal) : [];
      if (mode === "fill") toast("남는 시간 채우기로 바꿨어요 · 다른 과목을 배치하고 남는 시간을 하루 최대 2개까지 채워요");
      else toast(mode === "fixed" ? "고정 목표로 돌아왔어요" : missing.length ? "자동 계획을 켰어요 · 시험일·총 분량·목표 회독을 채우면 적용돼요" : "자동 계획을 켰어요 · 오늘부터 이번 주 계획이 적용돼요");
      render();
      return;
    }
    let value = input.value;
    if (field === "subject" || field === "unit") {
      value = value.trim();
      if (!value) return;
    } else if (field === "minutesPerUnit") {
      value = Math.max(1, Math.round((parseFloat(value) || 0) * 2) / 2); // 0.5분 단위(예: 17.5)
    } else {
      value = Math.max(0, parseInt(value, 10) || 0);
    }
    const { rolled } = storage.updateGoal(input.dataset.id, { [field]: value });
    if (rolled) {
      announceRounds(input.dataset.id, rolled);
      render();
    } else {
      refreshPaceSlot(input.dataset.id);
    }
  }

  function importBackup(input) {
    const file = input.files[0];
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
    input.value = "";
  }

  document.addEventListener("submit", (event) => {
    const form = event.target;
    const fd = new FormData(form);

    if (form.matches('[data-form="add-goal"]')) {
      event.preventDefault();
      const subject = String(fd.get("subject")).trim();
      const unit = String(fd.get("unit")).trim();
      if (!subject || !unit) return;
      if (!confirmReplan(`${subject} 목표를 추가할까요?`)) return;
      storage.addGoal(Number(fd.get("track")) || trackAt(storage.getData(), storage.appToday()), subject, unit);
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
      const days = pendingSettlements(data, buildContext(data), storage.appToday());
      days.forEach((day) => storage.settleDay(day.date, fd.get(`d:${day.date}`) || "carried", day.shortfalls));
      toast("반영했어요");
      closeSheet();
    }
  });

  document.addEventListener("change", (event) => {
    const el = event.target;

    // 설정 쪽 계획 변경도 먼저 묻는다(취소하면 원래 값으로 다시 그림)
    const replanWhat = el.dataset.trackField && storage.REPLAN_TRACK_FIELDS.includes(el.dataset.trackField)
      ? { examDate: "시험일", activeFrom: "1차 활성 시작일", maintain: "유지 모드" }[el.dataset.trackField]
      : el.dataset.settingNum && storage.REPLAN_SETTINGS.includes(el.dataset.settingNum)
        ? "공부 가능 시간·계획 설정"
        : el.dataset.workoutHours !== undefined
          ? "운동일 공부 가능 시간"
          : el.dataset.settingSelect && storage.REPLAN_SETTINGS.includes(el.dataset.settingSelect)
            ? "하루 구성"
            : el.dataset.setting && storage.REPLAN_SETTINGS.includes(el.dataset.setting)
              ? "공휴일 자동 휴식"
              : null;
    if (replanWhat && !confirmReplan(`${eul(replanWhat)} 바꿀까요?`)) {
      render();
      return;
    }

    if (el.dataset.goalField) applyGoalField(el);
    else if (el.dataset.syncField) {
      const value = el.value.trim();
      if (value) sync.saveConfig({ [el.dataset.syncField]: value });
      if (el.dataset.syncField === "token") {
        el.value = "";
        el.placeholder = "저장됨 · 바꾸려면 새로 입력";
      }
    } else if (el.dataset.trackField) {
      const field = el.dataset.trackField;
      const value = field === "examEstimated" || field === "maintain" ? el.checked : el.value || null;
      storage.setTrackInfo(Number(el.dataset.track), { [field]: value });
      refreshAllPaceSlots();
    } else if (el.dataset.settingNum) {
      storage.setSetting(el.dataset.settingNum, Math.max(0, Number(el.value) || 0));
      refreshAllPaceSlots();
    } else if (el.dataset.workoutHours !== undefined) {
      storage.setWorkout({ hours: Math.max(0, Number(el.value) || 0) });
      refreshAllPaceSlots();
    } else if (el.dataset.settingSelect) {
      storage.setSetting(el.dataset.settingSelect, el.value);
      const label = el.options[el.selectedIndex]?.textContent || el.value;
      toast(`하루 구성을 "${label}"(으)로 바꿨어요 · 오늘부터 남은 날이 다시 섞여요`);
      refreshAllPaceSlots();
    } else if (el.dataset.setting) {
      storage.setSetting(el.dataset.setting, el.checked);
    } else if (el.dataset.colorName) {
      storage.setSubjectColor(el.dataset.colorName, el.value);
    } else if (el.id === "import-file-input") {
      importBackup(el);
    }
  });
}
