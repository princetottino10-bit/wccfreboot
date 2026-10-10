// 種つき乱数（mulberry32）。sim の乱数はすべてこれを使い、Math.random は使わない。
// 同じ種なら同じ列になるので、リプレイは種を渡して再実行するだけで再現できる。

export function createRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    pick: (list) => list[Math.floor(next() * list.length)],
    get state() {
      return s;
    },
  };
}
