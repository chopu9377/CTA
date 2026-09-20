import { isConfigured, repoFetch, httpError } from "./sync.js";

// 만화 이미지는 용량 때문에 localStorage 대신 IndexedDB(이 기기)에 두고, 같은 GitHub 저장소의
// comics/<id>.jpg 파일로도 올려 둔다. 데이터 JSON에는 이미지 id 목록만 들어간다.
// images: { id, blob, uploaded }  trash: { id }(GitHub에서 지워야 할 이미지)
const DB_NAME = "cta-comics";
const MAX_SIDE = 1800;
const JPEG_QUALITY = 0.8;

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("images", { keyPath: "id" });
        req.result.createObjectStore("trash", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const getRecord = (id) => run("images", "readonly", (s) => s.get(id));
const putRecord = (rec) => run("images", "readwrite", (s) => s.put(rec));
const allRecords = () => run("images", "readonly", (s) => s.getAll());
const trashAll = () => run("trash", "readonly", (s) => s.getAll());
const trashAdd = (id) => run("trash", "readwrite", (s) => s.put({ id }));
const trashRemove = (id) => run("trash", "readwrite", (s) => s.delete(id));

export function imagePath(id) {
  return `comics/${id}.jpg`;
}

// 긴 변 1800px, JPEG로 줄여서 챕터당 몇 MB 안에 들어오게 한다(투명 배경은 흰색으로)
export async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("이미지를 읽을 수 없어요"));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("이미지 변환에 실패했어요"))), "image/jpeg", JPEG_QUALITY)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function saveImages(blobs, makeId) {
  const ids = [];
  for (const blob of blobs) {
    const id = makeId();
    await putRecord({ id, blob, uploaded: false });
    ids.push(id);
  }
  return ids;
}

// 이 기기에서 지운다. 아직 GitHub에 안 올라간 이미지가 아니면 GitHub 파일도 다음 동기화 때 지운다.
export async function removeImages(ids) {
  for (const id of ids) {
    const rec = await getRecord(id);
    if (!rec || rec.uploaded) await trashAdd(id);
    await run("images", "readwrite", (s) => s.delete(id));
  }
}

// 이 기기에 없으면 GitHub에서 받아 저장해 두고 돌려준다. 못 구하면 null.
export async function loadImageBlob(id) {
  const rec = await getRecord(id);
  if (rec) return rec.blob;
  if (!isConfigured()) return null;
  try {
    const res = await repoFetch(imagePath(id), { headers: { Accept: "application/vnd.github.raw+json" } });
    if (!res.ok) return null;
    const blob = await res.blob();
    await putRecord({ id, blob, uploaded: true });
    return blob;
  } catch (e) {
    return null;
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function uploadOne(rec) {
  const body = { message: `CTA comic ${rec.id}`, content: await blobToBase64(rec.blob) };
  const res = await repoFetch(imagePath(rec.id), { method: "PUT", body: JSON.stringify(body) });
  // 422: 같은 id 파일이 이미 있다(내용도 같으니 올라간 것으로 본다)
  if (!res.ok && res.status !== 422) throw httpError(res);
  await putRecord({ ...rec, uploaded: true });
}

async function deleteRemote(id) {
  const res = await repoFetch(imagePath(id));
  if (res.status === 404) return;
  if (!res.ok) throw httpError(res);
  const { sha } = await res.json();
  const del = await repoFetch(imagePath(id), { method: "DELETE", body: JSON.stringify({ message: `CTA remove comic ${id}`, sha }) });
  if (!del.ok && del.status !== 404) throw httpError(del);
}

// 데이터 동기화가 끝난 뒤 호출: 올리지 못한 이미지를 올리고, 지운 이미지를 GitHub에서도 지운다.
// 지금 데이터(챕터)가 참조하는 이미지는 지우지 않고, 참조 안 하는 미업로드 이미지는 올리지 않는다.
export async function syncImages(data) {
  const used = new Set(data.chapters.flatMap((c) => c.images));
  for (const { id } of await trashAll()) {
    if (!used.has(id)) await deleteRemote(id);
    await trashRemove(id);
  }
  for (const rec of await allRecords()) {
    if (!rec.uploaded && used.has(rec.id)) await uploadOne(rec);
  }
}
