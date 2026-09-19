import { escapeHtml } from "./shared.js";

function whenText(iso) {
  return iso ? new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "기록 없음";
}

export function syncCardHTML(info) {
  const text = (label, value, field, extra = "") =>
    `<label class="field"><span>${label}</span><input type="text" value="${escapeHtml(value)}" data-sync-field="${field}" autocapitalize="off" autocorrect="off" spellcheck="false" ${extra} /></label>`;
  return `<div class="card">
    <div class="section-header-row"><h2 class="section-title">GitHub 동기화</h2><span class="chip" data-sync-status>${escapeHtml(info.status)}</span></div>
    <p class="hint" style="margin-top:0">앱을 열 때 GitHub의 데이터를 불러오고, 기록을 바꾸면 몇 초 뒤 자동으로 올려요. 기기 저장소가 지워져도 여기서 다시 불러올 수 있어요.</p>
    ${text("저장소 (소유자/이름)", info.repo, "repo")}
    ${text("파일 경로", info.path, "path")}
    <label class="field"><span>토큰 (fine-grained · 이 저장소 Contents 읽기/쓰기)</span>
      <input type="password" value="" placeholder="${info.hasToken ? "저장됨 · 바꾸려면 새로 입력" : "github_pat_..."}" data-sync-field="token" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" /></label>
    <div class="form-inline">
      <button class="btn btn-primary" data-action="sync-now" type="button">지금 동기화</button>
      ${info.hasToken ? `<button class="btn btn-secondary" data-action="sync-disconnect" type="button">연결 해제</button>` : ""}
    </div>
    <p class="hint">토큰은 이 기기에만 저장되고 백업 파일에는 들어가지 않아요. 비공개 저장소 하나에만 권한을 준 토큰을 쓰세요.</p>
  </div>`;
}

export function conflictSheetHTML({ local, remote }) {
  const row = (label, d) => `<div class="settle-item"><div class="settle-date">${label}</div>
    <div class="settle-what">마지막 변경 ${whenText(d.updatedAt)} · 입력 기록 ${d.entries}건</div></div>`;
  return `<div class="sheet-backdrop"><div class="sheet">
    <h3 class="sheet-title">이 기기와 GitHub 데이터가 달라요</h3>
    <p class="hint">둘 다 바뀐 상태예요. 어느 쪽을 쓸까요? 선택하지 않은 쪽은 덮어써져요(GitHub는 커밋 기록에서 되돌릴 수 있어요).</p>
    <div class="sheet-list">${row("이 기기", local)}${row("GitHub", remote)}</div>
    <div class="form-inline">
      <button class="btn btn-primary" data-action="conflict-choice" data-choice="local" type="button">이 기기 것 쓰기</button>
      <button class="btn btn-primary" data-action="conflict-choice" data-choice="remote" type="button">GitHub 것 쓰기</button>
    </div>
    <div class="form-inline settle-bulk"><button class="btn btn-secondary" data-action="conflict-choice" data-choice="later" type="button">나중에</button></div>
  </div></div>`;
}
