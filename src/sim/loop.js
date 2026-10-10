// 固定タイムステップ。描画のフレーム間隔がばらついても、sim は常に dt 刻みで進む。
// advance() は今回進めるべき刻み数と、描画が前後の刻みの間を補間するための係数 alpha を返す。

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

export function createFixedStep({ dt = SIM_DT, maxSteps = 8 } = {}) {
  let acc = 0;
  const loop = {
    dt,
    timeScale: 1,
    advance(frameSeconds) {
      acc += Math.max(0, frameSeconds) * loop.timeScale;
      let steps = Math.floor(acc / dt);
      if (steps > maxSteps) {
        // 長い停止（タブ切り替えなど）のあとに一気に追いつこうとしない
        steps = maxSteps;
        acc = acc % dt;
      } else {
        acc -= steps * dt;
      }
      return { steps, alpha: acc / dt };
    },
    reset() {
      acc = 0;
    },
  };
  return loop;
}
