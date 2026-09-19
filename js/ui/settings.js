import { escapeHtml } from "./shared.js";

function backupStatusText(lastBackupAt) {
  if (!lastBackupAt) return "아직 백업한 적이 없어요. 데이터가 소중하다면 지금 내보내기를 눌러주세요.";
  const days = Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / 86400000);
  if (days <= 0) return "오늘 백업했어요.";
  return `마지막 백업: ${days}일 전`;
}

export function renderSettings(data) {
  const examName = data.meta.examName || "";
  const examDate = data.meta.examDate || "";

  return `
    <section class="view">
      <div class="card">
        <h2 class="section-title">시험 D-day</h2>
        <form data-form="set-exam" class="form">
          <label class="field"><span>시험 이름</span><input type="text" name="examName" value="${escapeHtml(examName)}" placeholder="예: 세무사 2차" /></label>
          <label class="field"><span>시험일</span><input type="date" name="examDate" value="${examDate}" /></label>
          <p class="field-hint">하루 목표 시간은 '목표' 탭에서 날짜별로 과목 시간을 배분하면 자동으로 계산돼요.</p>
          <button class="btn btn-primary" type="submit">저장</button>
        </form>
      </div>
      <div class="card">
        <h2 class="section-title">데이터 백업</h2>
        <p class="stat-sub">${backupStatusText(data.meta.lastBackupAt)}</p>
        <div class="form form-inline">
          <button class="btn btn-primary" data-action="export-data" type="button">JSON으로 내보내기</button>
          <button class="btn btn-secondary" data-action="import-data" type="button">JSON 불러오기</button>
        </div>
        <input type="file" id="import-file-input" accept="application/json" hidden />
      </div>
      <div class="card">
        <h2 class="section-title">앱 정보</h2>
        <p class="stat-sub">CTA · 개인용 공부 기록 트래커</p>
      </div>
    </section>
  `;
}
