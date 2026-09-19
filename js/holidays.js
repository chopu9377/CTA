// data/holidays.json은 정기 작업(.github/workflows/update-holidays.yml)이 공공데이터포털
// 특일 정보 API에서 받아 갱신한다. 서비스워커가 미리 캐시해 두므로 오프라인에서도 쓸 수 있다.
import { bumpVersion } from "./version.js";

let holidays = {};
let loaded = false;

export async function loadHolidays() {
  try {
    const res = await fetch("data/holidays.json");
    if (res.ok) holidays = await res.json();
  } catch (e) {
    console.warn("CTA: holidays.json unavailable", e);
  }
  loaded = true;
  bumpVersion(); // 공휴일이 들어오면 주말/평일 판정이 달라지므로 계산 캐시(weekplan.js)를 비운다
}

// 공휴일 정보가 들어오기 전에는 평일/주말 판정이 틀릴 수 있으므로 그날 목표를 굳히지(스냅샷) 않는다.
export function holidaysLoaded() {
  return loaded;
}

export function holidayName(dateStr) {
  return holidays[dateStr] || null;
}
