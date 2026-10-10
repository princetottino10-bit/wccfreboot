// 時刻つきの経路 [[t, x, z], ...] を、位置と速度が滑らかにつながる曲線として読む（3次エルミート補間）。
// 経路上の位置は時刻だけで決まる純粋な関数なので、先の時刻の位置を前もって計算できる。

function tangent(points, i) {
  const n = points.length;
  if (n < 2) return [0, 0];
  if (i === 0 || i === n - 1) {
    // 端点では止まっている（または一定速度で入ってくる）扱いにせず、隣との差から速度を決める
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const dt = b[0] - a[0];
    const v = [(b[1] - a[1]) / dt, (b[2] - a[2]) / dt];
    return points.stopAtEnds ? [0, 0] : v;
  }
  const a = points[i - 1];
  const b = points[i + 1];
  const dt = b[0] - a[0];
  return [(b[1] - a[1]) / dt, (b[2] - a[2]) / dt];
}

/** 経路を時刻 t で読む。範囲外では端点で止まる。返り値 { pos: [x, z], vel: [vx, vz] } */
export function samplePath(points, t) {
  const n = points.length;
  if (t <= points[0][0]) return { pos: [points[0][1], points[0][2]], vel: n > 1 && !points.stopAtEnds ? tangent(points, 0) : [0, 0] };
  if (t >= points[n - 1][0]) {
    return { pos: [points[n - 1][1], points[n - 1][2]], vel: points.stopAtEnds ? [0, 0] : tangent(points, n - 1) };
  }
  let i = 0;
  while (i < n - 2 && t > points[i + 1][0]) i++;
  const p0 = points[i];
  const p1 = points[i + 1];
  const h = p1[0] - p0[0];
  const s = (t - p0[0]) / h;
  const m0 = tangent(points, i);
  const m1 = tangent(points, i + 1);
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  const d00 = (6 * s2 - 6 * s) / h;
  const d10 = 3 * s2 - 4 * s + 1;
  const d01 = (-6 * s2 + 6 * s) / h;
  const d11 = 3 * s2 - 2 * s;
  const pos = [0, 0];
  const vel = [0, 0];
  for (let k = 0; k < 2; k++) {
    pos[k] = h00 * p0[k + 1] + h10 * h * m0[k] + h01 * p1[k + 1] + h11 * h * m1[k];
    vel[k] = d00 * p0[k + 1] + d10 * m0[k] + d01 * p1[k + 1] + d11 * m1[k];
  }
  return { pos, vel };
}

/** 経路の途中で出る最高速度（台本の検査用） */
export function maxSpeed(points, step = 1 / 60) {
  let best = 0;
  for (let t = points[0][0]; t <= points[points.length - 1][0]; t += step) {
    const { vel } = samplePath(points, t);
    best = Math.max(best, Math.hypot(vel[0], vel[1]));
  }
  return best;
}
