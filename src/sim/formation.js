// 布陣に沿って位置を取る選手の動き（台本の経路を持たない時間帯）。
// フェーズ1は「基準位置をボールに合わせてずらす」だけの簡易版。フェーズ3でここに戦術（最終ラインの高さ、
// プレス開始位置、レーン、SB の絞り）が入る。そのため係数は tactics として外から渡せる形にしてある。

import { PITCH } from './field.js';

export const DEFAULT_TACTICS = Object.freeze({
  followX: 0.55, // ボールの前後の動きにどれだけついていくか
  followZ: 0.28, // ボールのいる側へどれだけ寄るか
  minX: -PITCH.halfLength + 3, // 自陣側の限界（攻める向きを +x としたときの座標）
  maxX: PITCH.halfLength - 9,
});

/**
 * 攻める向き dir（+1 なら +x へ攻める）のチームの選手が、ボール位置 ball に対して取る目標位置。
 * base は「ボールがセンターにあるとき」の位置で、攻める向き +x を前提に書く。
 */
export function formationTarget(base, role, dir, ball, tactics = DEFAULT_TACTICS) {
  // 攻める向きを +x にそろえて計算し、最後に戻す
  const bx = ball[0] * dir;
  const bz = ball[2] * dir;
  if (role === 'GK') {
    const gx = -PITCH.halfLength;
    const toBall = Math.atan2(bz, bx - gx);
    const dist = 1.2 + Math.min(Math.max((bx - gx) / 25, 0), 1) * 3;
    return [(gx + Math.cos(toBall) * dist) * dir, Math.sin(toBall) * dist * dir];
  }
  let x = base[0] + bx * tactics.followX;
  let z = base[1] + bz * tactics.followZ;
  x = Math.min(Math.max(x, tactics.minX), tactics.maxX);
  z = Math.min(Math.max(z, -PITCH.halfWidth + 1.5), PITCH.halfWidth - 1.5);
  return [x * dir, z * dir];
}

/**
 * 目標へ向かう単純な操舵。最高速度と加速度に上限をかけ、近づくと減速する。
 * 状態を書き換えず、新しい位置と速度を返す。
 */
export function steer(pos, vel, target, dt, { maxSpeed = 6.5, accel = 5, gain = 1.1 } = {}) {
  let dvx = (target[0] - pos[0]) * gain;
  let dvz = (target[1] - pos[1]) * gain;
  const ds = Math.hypot(dvx, dvz);
  if (ds > maxSpeed) {
    dvx = (dvx / ds) * maxSpeed;
    dvz = (dvz / ds) * maxSpeed;
  }
  let ax = (dvx - vel[0]) / dt;
  let az = (dvz - vel[1]) / dt;
  const as = Math.hypot(ax, az);
  if (as > accel) {
    ax = (ax / as) * accel;
    az = (az / as) * accel;
  }
  const nv = [vel[0] + ax * dt, vel[1] + az * dt];
  return { pos: [pos[0] + nv[0] * dt, pos[1] + nv[1] * dt], vel: nv };
}
