// ボールに触れる動作ごとの決まりごと（データ）。
// contact: 接触の瞬間にボールが選手の足元のどこにあるか（選手の向きを基準にした局所座標、メートル）
//   fwd = 前方、side = 右方向（+ が右）、up = 高さ（ボール中心）
// windup: モーションの開始から接触までの秒数。アニメーションはこの分だけ早く動作を始める
// follow: 接触から動作の終わりまでの秒数
// 本番のモーションが入ったら、tools/ のスクリプトでクリップから接触位置を測ってこの値を置き換える。

import { BALL } from './field.js';

export const ACTIONS = Object.freeze({
  touch: { contact: { fwd: 0.42, side: 0.1, up: BALL.radius }, windup: 0.22, follow: 0.2 },
  trap: { contact: { fwd: 0.36, side: 0.12, up: BALL.radius }, windup: 0.3, follow: 0.3 },
  pass: { contact: { fwd: 0.3, side: 0.14, up: BALL.radius }, windup: 0.42, follow: 0.42 },
  cross: { contact: { fwd: 0.3, side: 0.16, up: BALL.radius }, windup: 0.5, follow: 0.5 },
  shot: { contact: { fwd: 0.32, side: 0.16, up: BALL.radius }, windup: 0.52, follow: 0.6 },
});

/** 向き a（ラジアン。前方 = (cos a, sin a) を (x, z) で表す）のときの右方向 */
export function rightOf(a) {
  return [-Math.sin(a), Math.cos(a)];
}

/** 選手の位置 (x, z) と向き a から、動作 type の接触点（ボール中心の位置）を返す。foot が 'L' なら左右を反転 */
export function contactPoint(type, x, z, a, foot = 'R') {
  const c = ACTIONS[type].contact;
  const side = foot === 'L' ? -c.side : c.side;
  const [rx, rz] = rightOf(a);
  return [x + Math.cos(a) * c.fwd + rx * side, c.up, z + Math.sin(a) * c.fwd + rz * side];
}
