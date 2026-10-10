// 試合の進行（フェーズ1は台本の再生）。固定刻みで状態を進め、描画は state() を読むだけ。
//
// 決まりごと：
// - 台本の経路を持つ時間帯の選手は、位置が時刻だけで決まる（ボールに左右されない）
// - ボールに触れるたびに、次に触れる選手の接触点へ予定の時刻ちょうどに届く初速を求めて蹴る（先回り）
// - 求めた初速は inputs として記録する。同じ inputs で作り直せば、まったく同じ試合が再生される（リプレイ）

import { createBallWorld } from './ball.js';
import { SIM_DT } from './loop.js';
import { samplePath, maxSpeed } from './path.js';
import { ACTIONS, contactPoint } from './actions.js';
import { formationTarget, steer } from './formation.js';
import { solveKick } from './kick.js';

export const BLEND_IN = 0.8; // 経路に入るとき、元の位置から経路へ寄せきるまでの秒数
const MAX_PATH_SPEED = 9.3;
const TURN_RATE = 7; // 向きを変える速さ [rad/s]
const NUDGE_LIMIT = 0.5; // これ以上ずれていたら接触の補正をしない（台本の誤り）

const toTick = (t) => Math.round(t / SIM_DT);
const smoothstep = (a, b, x) => {
  const s = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return s * s * (3 - 2 * s);
};
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, w) => a + wrapAngle(b - a) * w;

function segmentsOf(script, id) {
  const raw = script.paths?.[id];
  if (!raw) return [];
  return Array.isArray(raw[0][0]) ? raw : [raw];
}

function segmentAt(segments, t) {
  return segments.find((s) => t >= s[0][0] && t <= s[s.length - 1][0]) ?? null;
}

/** 台本を読み、接触ごとの位置・向き・接触点・蹴りの目標を前もって決める（後ろから順に） */
function prepareContacts(script) {
  const contacts = script.contacts.map((c, i) => ({ ...c, index: i, foot: c.foot ?? 'R', tick: toTick(c.t) }));
  for (let i = contacts.length - 1; i >= 0; i--) {
    const c = contacts[i];
    const seg = segmentAt(segmentsOf(script, c.p), c.t);
    if (!seg) throw new Error(`台本の誤り: ${c.p} の t=${c.t} を含む経路がない`);
    const [x, z] = samplePath(seg, c.t).pos;
    const next = contacts[i + 1];
    const aim = c.type === 'shot' ? c.target : next.point;
    c.facing = Math.atan2(aim[2] - z, aim[0] - x);
    c.point = contactPoint(c.type, x, z, c.facing, c.foot);
    if (c.up !== undefined) c.point[1] = c.up; // 空中で触る場合（浮き球のトラップなど）
    c.kick = {
      target: aim,
      ticks: c.type === 'shot' ? toTick(c.flight) : next.tick - c.tick,
      loft: Boolean(c.loft) || c.type === 'shot',
      spin: c.spin ?? [0, 0, 0],
    };
  }
  return contacts;
}

function prepareActions(list = [], offset = 0) {
  return list.map((a) => ({
    ...a,
    startTick: toTick(a.t + offset),
    endTick: toTick(a.t + offset + a.duration),
  }));
}

export function validateScript(script) {
  const problems = [];
  const ids = new Set(script.players.map((p) => p.id));
  for (const team of ['home', 'away']) {
    const members = script.players.filter((p) => p.team === team);
    if (members.length !== 11) problems.push(`${team} の人数が ${members.length}`);
    if (new Set(members.map((p) => p.num)).size !== members.length) problems.push(`${team} の背番号が重複`);
  }
  let prev = -Infinity;
  for (const c of script.contacts) {
    if (!ids.has(c.p)) problems.push(`接触 t=${c.t}: 選手 ${c.p} がいない`);
    if (!ACTIONS[c.type]) problems.push(`接触 t=${c.t}: 動作 ${c.type} が未定義`);
    if (c.t <= prev) problems.push(`接触 t=${c.t}: 時刻が前の接触より後になっていない`);
    prev = c.t;
    const seg = segmentAt(segmentsOf(script, c.p), c.t);
    if (!seg) problems.push(`接触 t=${c.t}: ${c.p} の経路がこの時刻を含まない`);
    else if (seg[0][0] > 0 && c.t < seg[0][0] + BLEND_IN) problems.push(`接触 t=${c.t}: ${c.p} の経路の開始が接触の ${BLEND_IN} 秒前より遅い`);
  }
  const last = script.contacts[script.contacts.length - 1];
  if (last?.type !== 'shot' || !last.target || !last.flight) problems.push('最後の接触は target と flight を持つシュートにする');
  for (const [id, raw] of Object.entries(script.paths ?? {})) {
    if (!ids.has(id)) problems.push(`経路: 選手 ${id} がいない`);
    for (const seg of segmentsOf(script, id)) {
      const v = maxSpeed(seg);
      if (v > MAX_PATH_SPEED) problems.push(`経路: ${id} (t=${seg[0][0]}〜) の最高速度 ${v.toFixed(1)} m/s が速すぎる`);
      for (let i = 1; i < seg.length; i++) if (seg[i][0] <= seg[i - 1][0]) problems.push(`経路: ${id} の時刻が増えていない`);
    }
    void raw;
  }
  return problems;
}

/**
 * @param opts.RAPIER initPhysics() の戻り値
 * @param opts.script 台本
 * @param opts.inputs bakeInputs で求めた蹴りの初速。省略するとその場で解く（重い）
 */
export function createMatch({ RAPIER, script, inputs = null }) {
  const contacts = prepareContacts(script);
  const contactAt = new Map(contacts.map((c) => [c.tick, c]));
  const actions = prepareActions(script.actions);
  const solved = inputs ? null : [];
  const ball = createBallWorld(RAPIER);
  ball.place(contacts[0].point);

  let tick = 0;
  let phase = 'play';
  let goal = null;
  let lastToucher = null;
  let celebration = null;
  const endTick = toTick(script.duration);

  const players = script.players.map((def) => {
    const dir = def.team === 'home' ? 1 : -1;
    const segments = segmentsOf(script, def.id);
    const seg = segmentAt(segments, 0);
    const start = seg ? samplePath(seg, 0).pos : formationTarget(def.base, def.role, dir, ball.state().pos);
    const facing = dir === 1 ? 0 : Math.PI;
    return { def, dir, segments, pos: start, vel: [0, 0], baseFacing: facing, facing, active: seg, entry: null };
  });

  const contactsOf = new Map();
  for (const c of contacts) contactsOf.set(c.p, [...(contactsOf.get(c.p) ?? []), c]);

  function contactFacing(p, t) {
    let best = null;
    let bestW = 0;
    for (const c of contactsOf.get(p.def.id) ?? []) {
      const lead = ACTIONS[c.type].windup + 0.15;
      let w = 0;
      if (t >= c.t - lead && t <= c.t) w = smoothstep(c.t - lead, c.t, t);
      else if (t > c.t && t < c.t + 0.3) w = 1 - smoothstep(c.t, c.t + 0.3, t);
      if (w > bestW) {
        bestW = w;
        best = c;
      }
    }
    return best ? { dir: best.facing, w: bestW } : null;
  }

  function currentAction(p) {
    let found = null;
    for (const c of contactsOf.get(p.def.id) ?? []) {
      const a = ACTIONS[c.type];
      const start = c.tick - toTick(a.windup);
      const end = c.tick + toTick(a.follow);
      if (tick >= start && tick <= end && (!found || c.tick < found.contactTick)) {
        found = { type: c.type, foot: c.foot, contactTick: c.tick, startTick: start, endTick: end };
      }
    }
    if (found) return found;
    const all = celebration ? [...actions, ...celebration.actions] : actions;
    for (const a of all) {
      if (a.p === p.def.id && tick >= a.startTick && tick <= a.endTick) {
        return { type: a.type, dir: a.dir ?? 0, startTick: a.startTick, endTick: a.endTick };
      }
    }
    return null;
  }

  function agentTarget(p, ballPos) {
    if (phase === 'celebration' && celebration) {
      const scorer = players.find((q) => q.def.id === celebration.scorer);
      if (p.def.team === scorer.def.team && p !== scorer && p.def.role !== 'GK') {
        const ang = (p.def.num * 2.399) % (Math.PI * 2);
        return { target: [scorer.pos[0] + Math.cos(ang) * 1.6, scorer.pos[1] + Math.sin(ang) * 1.6], maxSpeed: 7.5 };
      }
      return { target: p.pos, maxSpeed: 1.2 };
    }
    const target = formationTarget(p.def.base, p.def.role, p.dir, ballPos, script.tactics?.[p.def.team]);
    return { target, maxSpeed: 6.5 };
  }

  function separation(p) {
    let sx = 0;
    let sz = 0;
    for (const q of players) {
      if (q === p) continue;
      const dx = p.pos[0] - q.pos[0];
      const dz = p.pos[1] - q.pos[1];
      const d = Math.hypot(dx, dz);
      if (d > 0.001 && d < 2.0) {
        const push = (2.0 - d) / d;
        sx += dx * push;
        sz += dz * push;
      }
    }
    return [sx, sz];
  }

  function updatePlayers(t, ballPos) {
    for (const p of players) {
      const seg = segmentAt(p.segments, t);
      let pos;
      let vel;
      if (seg) {
        if (p.active !== seg) {
          const s0 = samplePath(seg, t).pos;
          p.entry = { t, offset: [p.pos[0] - s0[0], p.pos[1] - s0[1]] };
          p.active = seg;
        }
        const s = samplePath(seg, t);
        const w = p.entry ? 1 - smoothstep(p.entry.t, p.entry.t + BLEND_IN, t) : 0;
        pos = p.entry ? [s.pos[0] + p.entry.offset[0] * w, s.pos[1] + p.entry.offset[1] * w] : s.pos;
        vel = tick === 0 ? s.vel : [(pos[0] - p.pos[0]) / SIM_DT, (pos[1] - p.pos[1]) / SIM_DT];
      } else {
        p.active = null;
        p.entry = null;
        const { target, maxSpeed: ms } = agentTarget(p, ballPos);
        const [sx, sz] = separation(p);
        ({ pos, vel } = steer(p.pos, p.vel, [target[0] + sx, target[1] + sz], SIM_DT, { maxSpeed: ms }));
      }
      p.pos = pos;
      p.vel = vel;

      const speed = Math.hypot(vel[0], vel[1]);
      const desired = speed > 1.0 ? Math.atan2(vel[1], vel[0]) : Math.atan2(ballPos[2] - pos[1], ballPos[0] - pos[0]);
      const diff = wrapAngle(desired - p.baseFacing);
      p.baseFacing = wrapAngle(p.baseFacing + Math.sign(diff) * Math.min(Math.abs(diff), TURN_RATE * SIM_DT));
      const cf = contactFacing(p, t);
      p.facing = cf ? wrapAngle(lerpAngle(p.baseFacing, cf.dir, cf.w)) : p.baseFacing;
    }
  }

  function startCelebration(goalTime) {
    const c = script.celebration;
    if (!c) return;
    const path = c.path.map(([dt, x, z]) => [goalTime + dt, x, z]);
    const scorer = players.find((p) => p.def.id === c.player);
    scorer.segments = [...scorer.segments, path];
    celebration = { scorer: c.player, actions: prepareActions(c.actions, goalTime) };
  }

  function step() {
    const t = tick * SIM_DT;
    const events = [];
    updatePlayers(t, ball.state().pos);

    const c = contactAt.get(tick);
    if (c) {
      const pos = ball.state().pos;
      const delta = [c.point[0] - pos[0], c.point[1] - pos[1], c.point[2] - pos[2]];
      const residual = Math.hypot(...delta);
      if (residual < NUDGE_LIMIT) ball.nudge(delta);
      let kick;
      if (inputs) {
        kick = inputs[c.index];
      } else {
        kick = solveKick(ball, c.kick);
        solved.push({ vel: kick.vel, spin: kick.spin });
      }
      ball.kick({ vel: kick.vel, spin: kick.spin });
      lastToucher = c.p;
      events.push({ type: 'contact', player: c.p, action: c.type, foot: c.foot, time: t, tick, residual, point: c.point });
    }

    for (const e of ball.step()) {
      if (e.type === 'goal' && !goal) {
        goal = { side: e.side, scorer: lastToucher, time: t, tick };
        phase = 'celebration';
        startCelebration(t);
        events.push({ type: 'goal', ...goal });
      } else {
        events.push({ ...e, time: t, tick });
      }
    }
    tick++;
    return events;
  }

  return {
    step,
    fastForward(targetTick) {
      while (tick < targetTick && tick < endTick) step();
    },
    get tick() {
      return tick;
    },
    get finished() {
      return tick >= endTick;
    },
    get inputs() {
      return inputs ?? solved;
    },
    state() {
      const b = ball.state();
      return {
        tick,
        time: tick * SIM_DT,
        phase,
        goal,
        ball: { pos: b.pos, vel: b.vel, spin: b.spin, rot: b.rot },
        players: players.map((p) => ({
          id: p.def.id,
          team: p.def.team,
          num: p.def.num,
          role: p.def.role,
          pos: [p.pos[0], p.pos[1]],
          vel: [p.vel[0], p.vel[1]],
          facing: p.facing,
          action: currentAction(p),
        })),
      };
    },
    dispose() {
      ball.dispose();
    },
  };
}

/** 台本を一度その場で解きながら最後まで進め、蹴りの初速（inputs）と全刻みの状態を返す */
export function bakeInputs(RAPIER, script) {
  const match = createMatch({ RAPIER, script });
  const frames = [];
  const events = [];
  while (!match.finished) {
    events.push(...match.step());
    frames.push(match.state());
  }
  const inputs = match.inputs;
  match.dispose();
  return { inputs, frames, events };
}
