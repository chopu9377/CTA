import { getData, replaceData, setChangeListener } from "./store.js";

// GitHub 저장소의 JSON 파일과 데이터를 맞춘다(서버 없이 브라우저에서 GitHub API 직접 호출).
// 토큰/저장소 설정은 앱 데이터와 별도 키에 저장해서 백업 파일에 섞이지 않는다.
const STATE_KEY = "cta-sync";
const DEBOUNCE_MS = 4000;
const TIMEOUT_MS = 10000;
const STALE_MS = 30000;

const DEFAULT_STATE = {
  token: "",
  repo: "chopu9377/cat-backup",
  path: "cta-data.json",
  sha: null,
  dirty: false,
  lastSyncAt: null,
  lastError: null
};

let state = loadState();
let hooks = { toast() {}, askConflict: async () => null, onApplied() {}, onStatus() {} };
let timer = null;
let running = null;
let changeVersion = 0;
let lastRunAt = 0;

function loadState() {
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(localStorage.getItem(STATE_KEY) || "{}") };
  } catch (e) {
    return { ...DEFAULT_STATE };
  }
}

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export function isConfigured() {
  return !!(state.token && state.repo && state.path);
}

function agoText(iso) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1440)}일 전`;
}

function statusText() {
  if (!isConfigured()) return "연결 안 됨";
  if (running) return "동기화 중…";
  if (state.lastError) return `실패: ${state.lastError}`;
  if (state.dirty) return "올릴 변경이 있어요";
  return state.lastSyncAt ? `동기화됨 · ${agoText(state.lastSyncAt)}` : "아직 동기화 전";
}

function emitStatus() {
  hooks.onStatus(statusText());
}

export function getSyncInfo() {
  return { hasToken: !!state.token, repo: state.repo, path: state.path, status: statusText() };
}

export function saveConfig(patch) {
  const before = `${state.repo}|${state.path}`;
  Object.assign(state, patch);
  if (`${state.repo}|${state.path}` !== before) {
    state.sha = null;
    state.dirty = false;
  }
  state.lastError = null;
  saveState();
  emitStatus();
}

export function disconnect() {
  Object.assign(state, { token: "", sha: null, dirty: false, lastError: null, lastSyncAt: null });
  saveState();
  emitStatus();
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function decodeBase64(b64) {
  const binary = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function contentsUrl() {
  const path = state.path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${state.repo}/contents/${path}`;
}

async function ghFetch(options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(contentsUrl(), {
      ...options,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${state.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

function httpError(res) {
  if (res.status === 401) return new Error("토큰이 올바르지 않거나 만료됐어요");
  if (res.status === 403) return new Error("권한이 없어요(토큰 권한 확인)");
  if (res.status === 404) return new Error("저장소를 찾을 수 없어요(이름·권한 확인)");
  return new Error(`GitHub 오류 ${res.status}`);
}

async function fetchRemote() {
  const res = await ghFetch();
  if (res.status === 404) return null;
  if (!res.ok) throw httpError(res);
  const json = await res.json();
  if (json.content && json.encoding === "base64") return { sha: json.sha, text: decodeBase64(json.content) };
  // 1MB를 넘는 파일은 본문이 비어 있어 raw로 다시 받는다
  const raw = await ghFetch({ headers: { Accept: "application/vnd.github.raw+json" } });
  if (!raw.ok) throw httpError(raw);
  return { sha: json.sha, text: await raw.text() };
}

function parseRemote(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error("GitHub 파일을 읽을 수 없어요");
  }
  if (!data || !Array.isArray(data.goals) || !Array.isArray(data.entries)) throw new Error("GitHub 파일 형식이 달라요");
  return data;
}

function describe(data) {
  return { updatedAt: (data.meta && data.meta.updatedAt) || null, entries: data.entries.length };
}

// 사용자가 한 번도 바꾸지 않은 초기 상태(새로 설치했거나 저장소가 지워진 경우)
function isPristine(data) {
  return !data.meta.updatedAt;
}

function markSynced() {
  state.lastSyncAt = new Date().toISOString();
  state.lastError = null;
}

function adopt(sha, remoteData) {
  replaceData(remoteData, { quiet: true });
  state.sha = sha;
  state.dirty = false;
  markSynced();
  hooks.onApplied();
}

async function pushLocal() {
  const version = changeVersion;
  const body = {
    message: `CTA sync ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    content: encodeBase64(JSON.stringify(getData()))
  };
  if (state.sha) body.sha = state.sha;
  const res = await ghFetch({ method: "PUT", body: JSON.stringify(body) });
  if (res.status === 409 || res.status === 422) return "conflict";
  if (!res.ok) throw httpError(res);
  const json = await res.json();
  state.sha = json.content.sha;
  if (changeVersion === version) state.dirty = false;
  markSynced();
  return "pushed";
}

async function reconcile(depth = 0) {
  const remote = await fetchRemote();
  if (!remote) {
    state.sha = null;
    return pushOrRetry(depth);
  }
  const local = getData();
  // 초기 상태(새로 설치했거나 데이터가 지워진 경우)는 GitHub 데이터가 항상 우선.
  // 빈 데이터가 나중에 GitHub의 정상 데이터를 덮어쓰는 사고를 막는다.
  if (isPristine(local)) {
    adopt(remote.sha, parseRemote(remote.text));
    return "adopted";
  }
  if (remote.sha === state.sha) {
    if (!state.dirty) {
      markSynced();
      return "same";
    }
    return pushOrRetry(depth);
  }

  // 마지막으로 맞춘 뒤 GitHub 쪽이 바뀌었다(다른 기기에서 올렸거나 처음 연결)
  const remoteData = parseRemote(remote.text);
  const localChanged = state.sha ? state.dirty : true;
  if (!localChanged) {
    adopt(remote.sha, remoteData);
    return "adopted";
  }

  const choice = await hooks.askConflict({ local: describe(local), remote: describe(remoteData) });
  if (choice === "remote") {
    adopt(remote.sha, remoteData);
    return "adopted";
  }
  if (choice === "local") {
    state.sha = remote.sha;
    return pushOrRetry(depth);
  }
  return "deferred";
}

async function pushOrRetry(depth) {
  const result = await pushLocal();
  if (result === "conflict" && depth < 2) return reconcile(depth + 1);
  return result;
}

function friendlyError(e) {
  if (e.name === "AbortError") return "응답이 없어요(오프라인?)";
  if (e instanceof TypeError) return "오프라인이거나 연결에 실패했어요";
  return e.message;
}

export function syncNow() {
  if (!isConfigured()) return Promise.resolve("off");
  if (running) return running;
  clearTimeout(timer);
  lastRunAt = Date.now();
  running = (async () => {
    try {
      return await reconcile();
    } catch (e) {
      state.lastError = friendlyError(e);
      return "error";
    } finally {
      saveState();
      running = null;
      emitStatus();
    }
  })();
  emitStatus();
  return running;
}

function onLocalChange() {
  if (!isConfigured()) return;
  changeVersion++;
  state.dirty = true;
  saveState();
  emitStatus();
  clearTimeout(timer);
  timer = setTimeout(syncNow, DEBOUNCE_MS);
}

export function lastError() {
  return state.lastError;
}

// 앱을 열 때 한 번 맞추고, 이후 변경·앱 복귀·백그라운드 전환·온라인 복귀 때 맞춘다.
export function initSync(h) {
  hooks = { ...hooks, ...h };
  setChangeListener(onLocalChange);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (state.dirty) syncNow();
    } else if (Date.now() - lastRunAt > STALE_MS) {
      syncNow();
    }
  });
  window.addEventListener("online", () => syncNow());
  return syncNow();
}
