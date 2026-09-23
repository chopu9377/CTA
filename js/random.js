// 결정적 난수: 같은 시드 문자열이면 어느 기기에서든 같은 수열이 나온다(랜덤 배치를 저장하지 않고 매번 다시 계산하기 위함).

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32
export function seededRandom(seed) {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomInt = (rand, n) => Math.floor(rand() * n);

export function shuffle(rand, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rand, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// length칸 중 count칸을 거의 같은 간격으로 고르되 시작 위치는 랜덤(공백이 한쪽에 몰리지 않게)
export function spreadPick(rand, count, length) {
  const n = Math.max(0, Math.min(count, length));
  if (!n) return [];
  const offset = rand() * length;
  const picked = new Set();
  for (let i = 0; i < n; i++) picked.add(Math.floor(offset + (i * length) / n) % length);
  return [...picked].sort((a, b) => a - b);
}
