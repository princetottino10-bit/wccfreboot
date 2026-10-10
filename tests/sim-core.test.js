import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/sim/rng.js';
import { createFixedStep } from '../src/sim/loop.js';

test('同じ種の乱数は同じ列を返す', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('違う種の乱数は違う列を返す', () => {
  const a = createRng(1);
  const b = createRng(2);
  const same = Array.from({ length: 10 }, () => a.next() === b.next()).filter(Boolean).length;
  assert.ok(same < 3);
});

test('乱数は [0,1) に収まり、range は指定範囲に収まる', () => {
  const r = createRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1);
    const w = r.range(-2, 3);
    assert.ok(w >= -2 && w < 3);
  }
});

test('固定刻み：経過時間に応じた刻み数と補間係数を返す', () => {
  const loop = createFixedStep({ dt: 1 / 60 });
  let r = loop.advance(1 / 60 + 0.001);
  assert.equal(r.steps, 1);
  assert.ok(r.alpha > 0 && r.alpha < 0.1);
  r = loop.advance(2 / 60);
  assert.equal(r.steps, 2);
});

test('固定刻み：長い停止のあとでも刻み数に上限がかかる', () => {
  const loop = createFixedStep({ dt: 1 / 60, maxSteps: 5 });
  const r = loop.advance(3);
  assert.equal(r.steps, 5);
  assert.ok(r.alpha >= 0 && r.alpha < 1);
});

test('固定刻み：時間倍率でスロー再生できる', () => {
  const loop = createFixedStep({ dt: 1 / 60 });
  loop.timeScale = 0.25;
  const r = loop.advance(4.4 / 60);
  assert.equal(r.steps, 1);
});
