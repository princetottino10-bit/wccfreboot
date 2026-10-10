// ボールの物理。Rapier の世界にはボールとピッチ・ゴール枠・ネットだけを置く（選手は物理で動かさない）。
// 空気抵抗、マグヌス効果、芝の転がり抵抗は Rapier の外で力として加える。
// three.js と DOM には依存しない。Node でも動く。

import RAPIER_MODULE from '../../vendor/rapier/rapier.mjs';
import { BALL, GOAL, PITCH } from './field.js';
import { SIM_DT } from './loop.js';

const AIR_DRAG = 0.0057; // 0.5 * 空気密度 * 抗力係数 * 断面積
const MAGNUS = 0.0016; // F = MAGNUS * (ω × v)
const ROLL_DECEL = 0.9; // 芝の上を転がるときの減速 [m/s²]
const ROLL_SPIN_DAMP = 0.3; // 芝の上での回転の減衰（大きいと摩擦を通じて転がりまで止まってしまう）
const NET_DAMPING = 5.0; // ネットに入ったあとの減衰
const GROUND_EPS = 0.02;

let rapierReady = null;

/** Rapier の wasm を初期化する。何度呼んでも初期化は1回だけ。 */
export function initPhysics() {
  rapierReady ??= RAPIER_MODULE.init().then(() => RAPIER_MODULE);
  return rapierReady;
}

function buildWorld(R) {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = SIM_DT;
  const kinds = new Map();
  const add = (desc, kind) => {
    const c = world.createCollider(desc);
    kinds.set(c.handle, kind);
    return c;
  };

  // 芝。上面が y = 0
  add(R.ColliderDesc.cuboid(200, 1, 200).setTranslation(0, -1, 0).setRestitution(0.5).setFriction(0.6), 'ground');

  for (const side of [1, -1]) {
    const lineX = side * PITCH.halfLength;
    const postZ = GOAL.width / 2 + GOAL.postRadius;
    const barY = GOAL.height + GOAL.postRadius;
    const wood = (desc) => add(desc.setRestitution(0.7).setFriction(0.3), 'woodwork');
    for (const z of [postZ, -postZ]) {
      wood(R.ColliderDesc.cylinder(barY / 2, GOAL.postRadius).setTranslation(lineX, barY / 2, z));
    }
    // クロスバー：円柱を X 軸まわりに 90° 回して Z 方向へ寝かせる
    const s = Math.SQRT1_2;
    wood(
      R.ColliderDesc.cylinder(postZ, GOAL.postRadius)
        .setTranslation(lineX, barY, 0)
        .setRotation({ x: s, y: 0, z: 0, w: s }),
    );

    // ネット：跳ね返らない薄い板で囲む。見た目の揺れは描画側が受け持つ
    const net = (desc) => add(desc.setRestitution(0).setFriction(1), 'net');
    const backX = lineX + side * GOAL.depth;
    const halfW = GOAL.width / 2 + 0.15;
    net(R.ColliderDesc.cuboid(0.05, GOAL.height / 2 + 0.1, halfW).setTranslation(backX + side * 0.05, GOAL.height / 2, 0));
    net(R.ColliderDesc.cuboid(GOAL.depth / 2, 0.05, halfW).setTranslation(lineX + side * GOAL.depth / 2, GOAL.height + 0.2, 0));
    for (const z of [halfW, -halfW]) {
      net(R.ColliderDesc.cuboid(GOAL.depth / 2, GOAL.height / 2 + 0.1, 0.05).setTranslation(lineX + side * GOAL.depth / 2, GOAL.height / 2, z + Math.sign(z) * 0.05));
    }
  }

  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic().setTranslation(0, BALL.radius, 0).setCcdEnabled(true).setCanSleep(false),
  );
  const ballCollider = world.createCollider(
    R.ColliderDesc.ball(BALL.radius)
      .setMass(BALL.mass)
      .setRestitution(0.6)
      .setFriction(0.5)
      .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
    body,
  );
  kinds.set(ballCollider.handle, 'ball');
  return { world, body, bodyHandle: body.handle, kinds };
}

const toArr = (v) => [v.x, v.y, v.z];

export function createBallWorld(R) {
  let { world, body, bodyHandle, kinds } = buildWorld(R);
  const queue = new R.EventQueue(true);
  let goalScored = 0; // 得点済みのゴールの向き（0 は未得点）
  let pendingEvents = [];

  const insideGoal = (p) => {
    const side = Math.sign(p.x);
    return (
      Math.abs(p.x) > PITCH.halfLength + BALL.radius &&
      Math.abs(p.z) < GOAL.width / 2 &&
      p.y < GOAL.height &&
      side !== 0
    );
  };

  const applyForces = () => {
    body.resetForces(true);
    body.resetTorques(true);
    const p = body.translation();
    const v = body.linvel();
    const w = body.angvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    const onGround = p.y < BALL.radius + GROUND_EPS && Math.abs(v.y) < 0.5;

    let fx = -AIR_DRAG * speed * v.x;
    let fy = -AIR_DRAG * speed * v.y;
    let fz = -AIR_DRAG * speed * v.z;

    if (!onGround) {
      fx += MAGNUS * (w.y * v.z - w.z * v.y);
      fy += MAGNUS * (w.z * v.x - w.x * v.z);
      fz += MAGNUS * (w.x * v.y - w.y * v.x);
    } else {
      const hs = Math.hypot(v.x, v.z);
      if (hs > 1e-4) {
        // 1刻みで止まりきる速度なら、逆向きに動かないよう力を弱める
        const decel = Math.min(ROLL_DECEL, hs / SIM_DT);
        fx -= (BALL.mass * decel * v.x) / hs;
        fz -= (BALL.mass * decel * v.z) / hs;
      }
    }
    body.addForce({ x: fx, y: fy, z: fz }, true);
    body.setAngularDamping(onGround ? ROLL_SPIN_DAMP : 0.05);
    body.setLinearDamping(insideGoal(p) ? NET_DAMPING : 0);
  };

  const collectEvents = () => {
    const events = pendingEvents;
    pendingEvents = [];
    queue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const other = kinds.get(h1) === 'ball' ? kinds.get(h2) : kinds.get(h1);
      const v = body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (other === 'woodwork') events.push({ type: 'woodwork', speed });
      else if (other === 'net') events.push({ type: 'net', pos: toArr(body.translation()), speed });
      else if (other === 'ground' && speed > 1) events.push({ type: 'bounce', speed });
    });
    const p = body.translation();
    if (!goalScored && insideGoal(p)) {
      goalScored = Math.sign(p.x);
      events.push({ type: 'goal', side: goalScored });
    }
    return events;
  };

  return {
    /** 1刻み進めて、その刻みで起きた出来事（得点、ポスト、ネット、弾み）を返す */
    step() {
      applyForces();
      world.step(queue);
      return collectEvents();
    },
    place(pos, vel = [0, 0, 0]) {
      body.setTranslation({ x: pos[0], y: pos[1], z: pos[2] }, true);
      body.setLinvel({ x: vel[0], y: vel[1], z: vel[2] }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    },
    kick({ vel, spin = [0, 0, 0] }) {
      body.setLinvel({ x: vel[0], y: vel[1], z: vel[2] }, true);
      body.setAngvel({ x: spin[0], y: spin[1], z: spin[2] }, true);
    },
    /** ボールの位置だけを少し動かす（接触の同期で使う。速度は変えない） */
    nudge(delta) {
      const p = body.translation();
      body.setTranslation({ x: p.x + delta[0], y: p.y + delta[1], z: p.z + delta[2] }, true);
    },
    state() {
      const r = body.rotation();
      return {
        pos: toArr(body.translation()),
        vel: toArr(body.linvel()),
        spin: toArr(body.angvel()),
        rot: [r.x, r.y, r.z, r.w],
        goalScored,
      };
    },
    snapshot() {
      return { bytes: world.takeSnapshot(), goalScored };
    },
    restore(snap) {
      world.free();
      world = R.World.restoreSnapshot(snap.bytes);
      body = world.getRigidBody(bodyHandle);
      goalScored = snap.goalScored;
      pendingEvents = [];
      queue.clear();
    },
    dispose() {
      world.free();
      queue.free();
    },
  };
}
