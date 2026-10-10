import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics } from '../src/sim/ball.js';
import { samplePath } from '../src/sim/path.js';
import { createMatch, bakeInputs, validateScript } from '../src/sim/match.js';
import { SIM_DT } from '../src/sim/loop.js';
import { PITCH } from '../src/sim/field.js';
import goal01 from '../src/sim/script/goal01.js';
import shippedInputs from '../src/sim/script/goal01.inputs.js';

let RAPIER;
let baked;
before(async () => {
  RAPIER = await initPhysics();
  baked = bakeInputs(RAPIER, goal01);
});

const runAll = (match) => {
  const frames = [];
  const events = [];
  while (!match.finished) {
    events.push(...match.step());
    frames.push(match.state());
  }
  return { frames, events };
};

test('経路は各通過点をその時刻に通り、速度が途切れない', () => {
  const pts = [
    [0, 0, 0],
    [1, 5, 0],
    [2, 8, 3],
    [3, 8, 8],
  ];
  for (const [t, x, z] of pts) {
    const { pos } = samplePath(pts, t);
    assert.ok(Math.abs(pos[0] - x) < 1e-9 && Math.abs(pos[1] - z) < 1e-9);
  }
  const a = samplePath(pts, 1 - 1e-6).vel;
  const b = samplePath(pts, 1 + 1e-6).vel;
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-3);
});

test('台本 goal01 に矛盾がない', () => {
  assert.deepEqual(validateScript(goal01), []);
});

test('ボールは毎回、次に触る選手の足元へ予定の時刻に届く', () => {
  const contacts = baked.events.filter((e) => e.type === 'contact');
  assert.equal(contacts.length, goal01.contacts.length);
  for (const c of contacts) {
    assert.ok(c.residual < 0.03, `${c.player} ${c.action} t=${c.time.toFixed(2)} のずれ ${c.residual.toFixed(3)}m`);
  }
});

test('シュートが決まり、得点イベントが台本の時間帯に出る', () => {
  const goal = baked.events.find((e) => e.type === 'goal');
  assert.ok(goal, '得点が入る');
  assert.equal(goal.side, 1);
  assert.equal(goal.scorer, 'H10');
  assert.ok(goal.time > 23 && goal.time < 27, `得点時刻 ${goal.time}`);
});

test('焼き込んだ入力で再実行すると、焼き込み時とまったく同じ試合になる（リプレイの土台）', () => {
  const live = runAll(createMatch({ RAPIER, script: goal01, inputs: baked.inputs }));
  const again = runAll(createMatch({ RAPIER, script: goal01, inputs: baked.inputs }));
  assert.equal(live.frames.length, baked.frames.length);
  for (let i = 0; i < live.frames.length; i += 7) {
    assert.deepEqual(live.frames[i].ball.pos, baked.frames[i].ball.pos, `tick ${i}`);
    assert.deepEqual(live.frames[i], again.frames[i], `tick ${i}`);
  }
});

test('同梱の inputs が台本と食い違っていない（台本を直したら tools/bake.js を実行する）', () => {
  assert.equal(shippedInputs.length, baked.inputs.length);
  for (let i = 0; i < baked.inputs.length; i++) {
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(shippedInputs[i].vel[k] - baked.inputs[i].vel[k]) < 1e-6, `接触 ${i}`);
  }
});

test('途中まで早送りした状態は、1刻みずつ進めた状態と一致する', () => {
  const a = createMatch({ RAPIER, script: goal01, inputs: baked.inputs });
  const b = createMatch({ RAPIER, script: goal01, inputs: baked.inputs });
  a.fastForward(900);
  for (let i = 0; i < 900; i++) b.step();
  assert.deepEqual(a.state(), b.state());
});

test('選手は人間の速さで動き、ピッチの周りから出ない', () => {
  for (const f of baked.frames) {
    for (const p of f.players) {
      const v = Math.hypot(p.vel[0], p.vel[1]);
      assert.ok(v < 9.6, `${p.id} の速さ ${v.toFixed(2)} m/s (t=${f.time.toFixed(2)})`);
      assert.ok(Math.abs(p.pos[0]) < PITCH.halfLength + PITCH.runoffX);
      assert.ok(Math.abs(p.pos[1]) < PITCH.halfWidth + PITCH.runoffZ);
    }
  }
});

test('選手同士が重ならない（中心間 0.6m 以上）', () => {
  let worst = Infinity;
  let where = '';
  for (const f of baked.frames) {
    if (f.phase !== 'play') continue;
    for (let i = 0; i < f.players.length; i++) {
      for (let j = i + 1; j < f.players.length; j++) {
        const a = f.players[i].pos;
        const b = f.players[j].pos;
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (d < worst) {
          worst = d;
          where = `${f.players[i].id}-${f.players[j].id} t=${f.time.toFixed(2)}`;
        }
      }
    }
  }
  assert.ok(worst > 0.6, `最接近 ${worst.toFixed(2)}m (${where})`);
});

test('動作の予告：接触の windup 秒前から選手に動作が付く', () => {
  const c = goal01.contacts.find((x) => x.type === 'shot');
  const tick = Math.round(c.t / SIM_DT) - 10;
  const p = baked.frames[tick].players.find((x) => x.id === c.p);
  assert.equal(p.action?.type, 'shot');
  assert.equal(p.action.contactTick, Math.round(c.t / SIM_DT));
});
