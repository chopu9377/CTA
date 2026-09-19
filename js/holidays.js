// data/holidays.json은 정기 작업(.github/workflows/update-holidays.yml)이 공공데이터포털
// 특일 정보 API에서 받아 갱신한다. 서비스워커가 미리 캐시해 두므로 오프라인에서도 쓸 수 있다.
let holidays = {};

export async function loadHolidays() {
  try {
    const res = await fetch("data/holidays.json");
    if (res.ok) holidays = await res.json();
  } catch (e) {
    console.warn("CTA: holidays.json unavailable", e);
  }
}

export function holidayName(dateStr) {
  return holidays[dateStr] || null;
}
