import { getData, persist, uid } from "./store.js";
import { compressImage, saveImages, removeImages } from "./imagestore.js";

// 챕터는 트랙+과목 이름 기준(같은 과목의 목표가 여러 개여도 목록은 하나). 배열 순서가 곧 챕터 순서다.
export function chaptersOf(data, track, subject) {
  return data.chapters.filter((c) => c.track === track && c.subject === subject);
}

export function addChapters(track, subject, titles) {
  const data = getData();
  titles.forEach((title) => data.chapters.push({ id: uid(), track, subject, title, images: [] }));
  persist();
}

export function renameChapter(chapterId, title) {
  const chapter = getData().chapters.find((c) => c.id === chapterId);
  if (!chapter || !title) return;
  chapter.title = title;
  persist();
}

// 같은 과목 안에서 위(-1)/아래(+1)로 옮긴다
export function moveChapter(chapterId, dir) {
  const data = getData();
  const chapter = data.chapters.find((c) => c.id === chapterId);
  if (!chapter) return;
  const group = chaptersOf(data, chapter.track, chapter.subject);
  const neighbor = group[group.indexOf(chapter) + dir];
  if (!neighbor) return;
  const a = data.chapters.indexOf(chapter);
  const b = data.chapters.indexOf(neighbor);
  [data.chapters[a], data.chapters[b]] = [data.chapters[b], data.chapters[a]];
  persist();
}

export async function deleteChapter(chapterId) {
  const data = getData();
  const chapter = data.chapters.find((c) => c.id === chapterId);
  if (!chapter) return;
  data.chapters = data.chapters.filter((c) => c.id !== chapterId);
  persist();
  await removeImages(chapter.images);
}

// 고른 순서대로 챕터 끝에 컷을 추가한다
export async function addChapterImages(chapterId, files) {
  const blobs = [];
  for (const file of files) blobs.push(await compressImage(file));
  const ids = await saveImages(blobs, uid);
  const chapter = getData().chapters.find((c) => c.id === chapterId);
  if (!chapter) {
    await removeImages(ids);
    return 0;
  }
  chapter.images.push(...ids);
  persist();
  return ids.length;
}

export async function removeChapterImage(chapterId, imageId) {
  const chapter = getData().chapters.find((c) => c.id === chapterId);
  if (!chapter) return;
  chapter.images = chapter.images.filter((id) => id !== imageId);
  persist();
  await removeImages([imageId]);
}
