// 저장 데이터가 바뀔 때마다 올라가는 번호. 계산 결과 캐시(weekplan.js)가 낡은 값을 쓰지 않게 하는 용도다.
let version = 0;

export function bumpVersion() {
  version++;
}

export function dataVersion() {
  return version;
}
