import { chaptersOf } from "../chapters.js";
import { loadImageBlob } from "../imagestore.js";
import { escapeHtml } from "./shared.js";

// 진도율 탭에서 과목을 누르면 펼쳐지는 챕터 목록(챕터별 만화 올리기·보기)
export function comicBadgeHTML(data, goal) {
  const chapters = chaptersOf(data, goal.track, goal.subject);
  if (!chapters.length) return "";
  const done = chapters.filter((c) => c.images.length).length;
  return `<span class="comic-badge">만화 ${done}/${chapters.length}</span>`;
}

function chapterRowHTML(chapter, index, count, editing) {
  const id = escapeHtml(chapter.id);
  const no = `<span class="comic-no">${index + 1}</span>`;
  if (editing) {
    return `<div class="comic-ch">${no}
      <input type="text" class="comic-title-input" value="${escapeHtml(chapter.title)}" data-chapter-title="${id}" aria-label="챕터 이름" />
      <button class="icon-btn" data-action="comic-move" data-id="${id}" data-dir="-1" type="button" aria-label="위로"${index === 0 ? " disabled" : ""}>▲</button>
      <button class="icon-btn" data-action="comic-move" data-id="${id}" data-dir="1" type="button" aria-label="아래로"${index === count - 1 ? " disabled" : ""}>▼</button>
      <button class="btn-danger" data-action="comic-delete" data-id="${id}" type="button">삭제</button>
    </div>`;
  }
  const cuts = chapter.images.length;
  return `<div class="comic-ch">${no}
    <div class="comic-title">${escapeHtml(chapter.title)}<small>${cuts ? `${cuts}컷` : "만화 없음"}</small></div>
    ${cuts ? `<button class="btn btn-primary btn-sm" data-action="open-viewer" data-id="${id}" type="button">보기</button>` : ""}
    <label class="btn btn-secondary btn-sm comic-upload">${cuts ? "추가" : "올리기"}
      <input type="file" accept="image/*" multiple class="visually-hidden" data-chapter-file="${id}" /></label>
  </div>`;
}

export function comicsPanelHTML(data, goal, ui) {
  const chapters = chaptersOf(data, goal.track, goal.subject);
  const editing = ui.comicEdit && chapters.length > 0;
  return `<div class="comic-panel">
    <div class="comic-head">
      <b>${escapeHtml(goal.subject)} 챕터</b>
      ${chapters.length ? `<button class="btn btn-secondary btn-sm" data-action="comic-edit" type="button">${editing ? "완료" : "편집"}</button>` : ""}
    </div>
    ${chapters.length ? chapters.map((c, i) => chapterRowHTML(c, i, chapters.length, editing)).join("") : `<p class="hint">챕터를 추가하면 챕터마다 만화를 올릴 수 있어요.</p>`}
    <form class="comic-add" data-form="add-chapters">
      <input type="hidden" name="track" value="${goal.track}" />
      <input type="hidden" name="subject" value="${escapeHtml(goal.subject)}" />
      <textarea name="titles" rows="2" placeholder="챕터 이름 (여러 개는 한 줄에 하나씩, 순서대로)"></textarea>
      <button class="btn btn-primary btn-sm" type="submit">챕터 추가</button>
    </form>
  </div>`;
}

let objectUrls = [];

function releaseUrls() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
}

export function closeViewer(overlay) {
  releaseUrls();
  overlay.innerHTML = "";
}

// 전체 화면 뷰어: 좌우로 넘기고, 컷을 두 번 탭하면 확대/축소(확대하면 손가락으로 끌어서 본다)
export function openViewer(overlay, chapter, index = 0) {
  releaseUrls();
  const count = chapter.images.length;
  const start = Math.min(index, count - 1);
  overlay.innerHTML = `<div class="viewer">
    <div class="viewer-bar">
      <button class="viewer-btn" data-action="close-viewer" type="button" aria-label="닫기">✕</button>
      <span class="viewer-count" data-viewer-count>${start + 1} / ${count}</span>
      <button class="viewer-btn" data-action="viewer-delete" data-id="${escapeHtml(chapter.id)}" type="button">이 컷 삭제</button>
    </div>
    <div class="viewer-track" data-viewer-track>
      ${chapter.images.map((id) => `<div class="viewer-slide" data-image-id="${escapeHtml(id)}"><span class="viewer-msg">불러오는 중…</span></div>`).join("")}
    </div>
    <div class="viewer-title">${escapeHtml(chapter.title)}</div>
  </div>`;

  const track = overlay.querySelector("[data-viewer-track]");
  const counter = overlay.querySelector("[data-viewer-count]");
  track.scrollLeft = start * track.clientWidth;
  track.addEventListener("scroll", () => {
    const now = Math.round(track.scrollLeft / track.clientWidth) + 1;
    counter.textContent = `${Math.min(count, Math.max(1, now))} / ${count}`;
  });

  track.querySelectorAll(".viewer-slide").forEach((slide) => {
    let lastTap = 0;
    slide.addEventListener("click", () => {
      const now = Date.now();
      if (now - lastTap < 320 && slide.querySelector("img")) slide.classList.toggle("zoom");
      lastTap = now;
    });
    loadImageBlob(slide.dataset.imageId).then((blob) => {
      if (!slide.isConnected) return;
      if (!blob) {
        slide.innerHTML = `<span class="viewer-msg">이미지를 불러오지 못했어요<br>(GitHub 동기화·인터넷 연결 확인)</span>`;
        return;
      }
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      slide.innerHTML = `<img src="${url}" alt="" draggable="false" />`;
    });
  });
}
