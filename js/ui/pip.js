// 떠 있는 작은 창(v98 실험): 스톱워치 시계를 캔버스에 그려 동영상 스트림으로 만들고 PiP(화면 속 화면)로 띄운다.
// 다른 앱을 써도 화면 구석에 시간이 보인다. 아이폰 웹앱은 iOS 버전에 따라 안 될 수 있어(백그라운드에서 그리기가 멈추는 등) 시험 기능이다.
// PiP 창의 재생/일시정지 버튼은 스톱워치 재생/일시정지와 같이 움직인다.
import * as sw from "../stopwatch.js";

let canvas = null;
let video = null;
let timer = null;
let label = { name: "", color: "#2a78d6" };
let syncing = false;

function draw() {
  if (!canvas) return;
  const cur = sw.state();
  const g = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  g.fillStyle = "#14161a";
  g.fillRect(0, 0, W, H);
  g.fillStyle = label.color;
  g.beginPath(); g.arc(34, 44, 12, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#cfd3da";
  g.font = "600 30px -apple-system, 'Apple SD Gothic Neo', sans-serif";
  g.textBaseline = "middle";
  g.fillText(label.name + (cur && !cur.running ? "  ⏸" : ""), 58, 46);
  g.fillStyle = cur && cur.running ? "#6ab0ff" : "#ffffff";
  g.font = "800 92px -apple-system, 'SF Pro Display', sans-serif";
  g.textAlign = "center";
  g.fillText(cur ? sw.clock(cur.ms) : "0:00", W / 2, 128);
  g.textAlign = "left";
}

// 탭 한 번으로 바로 띄울 수 있게 미리 만들어 둔다(PiP 요청은 사용자 동작 안에서 해야 해서)
export function prepare(name, color) {
  label = { name, color: color || "#2a78d6" };
  if (video) { draw(); return; }
  if (typeof HTMLCanvasElement === "undefined" || !HTMLCanvasElement.prototype.captureStream) return;
  canvas = document.createElement("canvas");
  canvas.width = 480; canvas.height = 180;
  draw();
  video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.className = "pip-video";
  video.srcObject = canvas.captureStream(4);
  document.body.appendChild(video);
  video.play().catch(() => {});
  timer = setInterval(draw, 250);
  // PiP 창의 ▶/⏸ = 스톱워치 재생/일시정지
  video.addEventListener("pause", () => { if (!syncing && inPip()) { sw.pause(); document.dispatchEvent(new Event("cta-sw-changed")); } });
  video.addEventListener("play", () => { if (!syncing && inPip()) { sw.resume(); document.dispatchEvent(new Event("cta-sw-changed")); } });
}

function inPip() {
  return document.pictureInPictureElement === video || (video && video.webkitPresentationMode === "picture-in-picture");
}

export function supported() {
  if (typeof HTMLCanvasElement === "undefined" || !HTMLCanvasElement.prototype.captureStream) return false;
  const v = document.createElement("video");
  return !!(document.pictureInPictureEnabled || (v.webkitSupportsPresentationMode && v.webkitSupportsPresentationMode("picture-in-picture")));
}

// 반환: "on" | "off" | 실패 사유 문자열
export async function toggle() {
  if (!video) return "이 기기에서는 작은 창을 만들 수 없어요(캔버스 스트림 미지원)";
  try {
    if (inPip()) {
      if (document.exitPictureInPicture && document.pictureInPictureElement) await document.exitPictureInPicture();
      else video.webkitSetPresentationMode("inline");
      return "off";
    }
    syncing = true;
    const playing = video.play();
    if (video.requestPictureInPicture && document.pictureInPictureEnabled) await video.requestPictureInPicture();
    else if (video.webkitSupportsPresentationMode && video.webkitSupportsPresentationMode("picture-in-picture")) video.webkitSetPresentationMode("picture-in-picture");
    else return "이 기기에서는 작은 창을 지원하지 않아요";
    await playing.catch(() => {});
    return "on";
  } catch (e) {
    return `작은 창을 띄우지 못했어요 (${e && e.name ? e.name : "오류"})`;
  } finally {
    setTimeout(() => { syncing = false; }, 300);
  }
}

export function close() {
  if (video && inPip()) {
    if (document.exitPictureInPicture && document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    else video.webkitSetPresentationMode("inline");
  }
}
