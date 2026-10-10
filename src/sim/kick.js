// 蹴りのソルバー：「ticks 刻み後にボールが target に来る」初速を、物理を試し撃ちして求める。
// 試し撃ちの前後は Rapier のスナップショットで世界を丸ごと戻すので、本番の進行には一切影響しない。

import { SIM_DT } from './loop.js';

const GRAVITY = 9.81;
const GROUND_GAIN = 1.4; // 滑りから転がりに移るとき速度は約 5/7 になるので、修正量を大きめにする

/**
 * @param ball createBallWorld の戻り値
 * @param opts.target 目標位置 [x, y, z]
 * @param opts.ticks 何刻み後に届かせるか
 * @param opts.loft true なら浮き球（3次元で解く）、false ならゴロ（上向きの初速 0 で水平だけ解く）
 * @param opts.spin 回転 [x, y, z]
 * @returns { vel, spin, error } error は最後の試し撃ちでのずれ [m]
 */
export function solveKick(ball, { target, ticks, loft = false, spin = [0, 0, 0], tolerance = 0.005, maxIter = 16 }) {
  const snap = ball.snapshot();
  const start = ball.state().pos;
  const T = ticks * SIM_DT;
  const dx = target[0] - start[0];
  const dy = target[1] - start[1];
  const dz = target[2] - start[2];
  let vel = loft ? [dx / T, dy / T + 0.5 * GRAVITY * T, dz / T] : [(dx / T) * GROUND_GAIN, 0, (dz / T) * GROUND_GAIN];
  const gain = loft ? 1 : GROUND_GAIN;
  let error = Infinity;

  for (let iter = 0; iter < maxIter; iter++) {
    ball.restore(snap);
    ball.kick({ vel, spin });
    for (let i = 0; i < ticks; i++) ball.step();
    const p = ball.state().pos;
    const e = [target[0] - p[0], target[1] - p[1], target[2] - p[2]];
    error = loft ? Math.hypot(e[0], e[1], e[2]) : Math.hypot(e[0], e[2]);
    if (error < tolerance) break;
    vel = [vel[0] + (e[0] / T) * gain, loft ? vel[1] + e[1] / T : 0, vel[2] + (e[2] / T) * gain];
  }
  ball.restore(snap);
  return { vel, spin, error };
}
