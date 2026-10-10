import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics, createBallWorld } from '../src/sim/ball.js';
import { BALL, GOAL, PITCH } from '../src/sim/field.js';

let RAPIER;
before(async () => {
  RAPIER = await initPhysics();
});

const run = (ball, ticks) => {
  for (let i = 0; i < ticks; i++) ball.step();
};

test('落としたボールは弾み、だんだん低くなって芝の上で止まる', () => {
  const ball = createBallWorld(RAPIER);
  ball.place([0, 2, 0]);
  let peakAfterFirstBounce = 0;
  let bounced = false;
  let prevVy = 0;
  for (let i = 0; i < 240; i++) {
    ball.step();
    const s = ball.state();
    if (!bounced && prevVy < 0 && s.vel[1] > 0) bounced = true;
    if (bounced && s.pos[1] > peakAfterFirstBounce) peakAfterFirstBounce = s.pos[1];
    prevVy = s.vel[1];
  }
  assert.ok(bounced, '一度は弾む');
  assert.ok(peakAfterFirstBounce > 0.25 && peakAfterFirstBounce < 1.2, `弾みの高さ ${peakAfterFirstBounce}`);
  run(ball, 300);
  assert.ok(Math.abs(ball.state().pos[1] - BALL.radius) < 0.01, '最後は芝に乗っている');
});

test('転がしたボールは芝の抵抗で減速して止まる', () => {
  const ball = createBallWorld(RAPIER);
  ball.place([-30, BALL.radius, 0]);
  ball.kick({ vel: [12, 0, 0] });
  run(ball, 60 * 20);
  const s = ball.state();
  const dist = s.pos[0] + 30;
  assert.ok(dist > 20 && dist < 80, `転がった距離 ${dist}`);
  assert.ok(Math.hypot(...s.vel) < 0.05, '止まっている');
});

test('同じ入力なら毎回まったく同じ軌道になる', () => {
  const a = createBallWorld(RAPIER);
  const b = createBallWorld(RAPIER);
  for (const w of [a, b]) {
    w.place([0, BALL.radius, 0]);
    w.kick({ vel: [18, 6, 3], spin: [0, 20, 5] });
  }
  run(a, 300);
  run(b, 300);
  assert.deepEqual(a.state(), b.state());
});

test('回転をかけると曲がる（マグヌス効果）', () => {
  const straight = createBallWorld(RAPIER);
  const curved = createBallWorld(RAPIER);
  straight.place([0, BALL.radius, 0]);
  curved.place([0, BALL.radius, 0]);
  straight.kick({ vel: [25, 5, 0] });
  curved.kick({ vel: [25, 5, 0], spin: [0, 40, 0] });
  run(straight, 50);
  run(curved, 50);
  // ω=(0,+ωy,0) と v=(+vx,0,0) の外積は -z 向き
  assert.ok(Math.abs(straight.state().pos[2]) < 0.01);
  assert.ok(curved.state().pos[2] < -0.5, `曲がり ${curved.state().pos[2]}`);
});

test('ゴールの枠内にボール全体が入ると得点イベントが1回だけ出る', () => {
  const ball = createBallWorld(RAPIER);
  ball.place([PITCH.halfLength - 11, BALL.radius, 0]);
  ball.kick({ vel: [22, 2, 1] });
  const events = [];
  for (let i = 0; i < 120; i++) events.push(...ball.step());
  const goals = events.filter((e) => e.type === 'goal');
  assert.equal(goals.length, 1);
  assert.equal(goals[0].side, 1);
});

test('枠の外へのシュートは得点にならない', () => {
  const ball = createBallWorld(RAPIER);
  ball.place([PITCH.halfLength - 11, BALL.radius, 0]);
  ball.kick({ vel: [22, 2, 9] });
  const events = [];
  for (let i = 0; i < 120; i++) events.push(...ball.step());
  assert.equal(events.filter((e) => e.type === 'goal').length, 0);
});

test('ポストに当たると跳ね返る', () => {
  const ball = createBallWorld(RAPIER);
  const postZ = GOAL.width / 2 + GOAL.postRadius;
  ball.place([PITCH.halfLength - 5, 1, postZ]);
  ball.kick({ vel: [20, 0, 0] });
  const events = [];
  for (let i = 0; i < 40; i++) events.push(...ball.step());
  assert.ok(ball.state().vel[0] < 0, 'x 方向の速度が反転');
  assert.ok(events.some((e) => e.type === 'woodwork'));
});

test('ネットに入ったボールは勢いを失ってゴールの中に落ちる', () => {
  const ball = createBallWorld(RAPIER);
  ball.place([PITCH.halfLength - 11, BALL.radius, 0]);
  ball.kick({ vel: [28, 3, 0] });
  run(ball, 180);
  const s = ball.state();
  assert.ok(s.pos[0] > PITCH.halfLength && s.pos[0] < PITCH.halfLength + GOAL.depth, `x=${s.pos[0]}`);
  assert.ok(Math.hypot(...s.vel) < 1.5);
});

test('スナップショットから戻すと、そこから先がまったく同じになる', () => {
  const ball = createBallWorld(RAPIER);
  ball.place([0, BALL.radius, 0]);
  ball.kick({ vel: [15, 4, -2], spin: [3, -10, 0] });
  run(ball, 30);
  const snap = ball.snapshot();
  run(ball, 60);
  const expected = ball.state();
  ball.restore(snap);
  run(ball, 60);
  assert.deepEqual(ball.state(), expected);
});
