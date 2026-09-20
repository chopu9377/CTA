import * as storage from "./storage.js";
import { openViewer, closeViewer } from "./ui/comics.js";

// 진도율 탭 챕터/만화 관련 클릭·입력 처리
export function createComicActions({ ui, render, toast, overlay }) {
  const chapterOf = (id) => storage.getData().chapters.find((c) => c.id === id);

  return {
    actions: {
      "toggle-comics"(btn) {
        ui.comicGoalId = ui.comicGoalId === btn.dataset.id ? null : btn.dataset.id;
        ui.comicEdit = false;
        render();
      },
      "comic-edit"() {
        ui.comicEdit = !ui.comicEdit;
        render();
      },
      "comic-move"(btn) {
        storage.moveChapter(btn.dataset.id, Number(btn.dataset.dir));
        render();
      },
      async "comic-delete"(btn) {
        const chapter = chapterOf(btn.dataset.id);
        if (!chapter) return;
        const cuts = chapter.images.length;
        if (!confirm(`"${chapter.title}" 챕터를 삭제할까요?${cuts ? `\n올려 둔 만화 ${cuts}컷도 함께 지워져요(GitHub에서도).` : ""}`)) return;
        await storage.deleteChapter(chapter.id);
        render();
      },
      "open-viewer"(btn) {
        const chapter = chapterOf(btn.dataset.id);
        if (chapter && chapter.images.length) openViewer(overlay, chapter);
      },
      "close-viewer"() {
        closeViewer(overlay);
      },
      async "viewer-delete"(btn) {
        const chapter = chapterOf(btn.dataset.id);
        const track = overlay.querySelector("[data-viewer-track]");
        if (!chapter || !track) return;
        const index = Math.round(track.scrollLeft / track.clientWidth);
        const imageId = chapter.images[index];
        if (!imageId || !confirm(`${index + 1}번째 컷을 삭제할까요?`)) return;
        await storage.removeChapterImage(chapter.id, imageId);
        if (chapter.images.length) openViewer(overlay, chapter, index);
        else closeViewer(overlay);
        render();
      }
    },

    async uploadFiles(input) {
      const files = Array.from(input.files || []);
      const chapterId = input.dataset.chapterFile;
      input.value = "";
      if (!files.length) return;
      toast(`${files.length}장 올리는 중…`);
      try {
        const added = await storage.addChapterImages(chapterId, files);
        const chapter = chapterOf(chapterId);
        toast(added ? `${added}컷을 올렸어요 · 총 ${chapter.images.length}컷` : "챕터를 찾을 수 없어요");
      } catch (e) {
        toast(`올리지 못했어요: ${e.message}`);
      }
      render();
    },

    addChapters(form) {
      const fd = new FormData(form);
      const titles = String(fd.get("titles")).split("\n").map((t) => t.trim()).filter(Boolean);
      if (!titles.length) return;
      storage.addChapters(Number(fd.get("track")), String(fd.get("subject")), titles);
      toast(`챕터 ${titles.length}개를 추가했어요`);
      render();
    },

    renameChapter(input) {
      const title = input.value.trim();
      if (title) storage.renameChapter(input.dataset.chapterTitle, title);
      else input.value = (chapterOf(input.dataset.chapterTitle) || {}).title || "";
    }
  };
}
