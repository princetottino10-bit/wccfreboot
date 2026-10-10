// 台本の蹴りの初速を前もって求め、src/sim/script/<id>.inputs.js に書き出す。
// 台本（goal01.js）を直したら必ず実行する。テストが「同梱の inputs が古い」ことを検出する。
// 使い方: node tools/bake.js goal01

import { writeFile } from 'node:fs/promises';
import { initPhysics } from '../src/sim/ball.js';
import { bakeInputs } from '../src/sim/match.js';

const id = process.argv[2] ?? 'goal01';
const { default: script } = await import(`../src/sim/script/${id}.js`);
const RAPIER = await initPhysics();
const started = performance.now();
const { inputs, events } = bakeInputs(RAPIER, script);
const goal = events.find((e) => e.type === 'goal');
const worst = Math.max(...events.filter((e) => e.type === 'contact').map((e) => e.residual));

const body = `// tools/bake.js が生成するファイル。手で編集しない。
// 台本 ${id} の各接触での蹴りの初速 [m/s] と回転 [rad/s]。
export default ${JSON.stringify(inputs.map((k) => ({ vel: k.vel, spin: k.spin })))};
`;
const out = new URL(`../src/sim/script/${id}.inputs.js`, import.meta.url);
await writeFile(out, body);
console.log(
  `${id}: ${inputs.length} 回の蹴りを解いた (${(performance.now() - started).toFixed(0)}ms)。` +
    ` 接触点の最大のずれ ${(worst * 100).toFixed(1)}cm、得点 ${goal ? `${goal.time.toFixed(2)}秒 ${goal.scorer}` : 'なし'}`,
);
