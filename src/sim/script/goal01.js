// ゴールシーンの台本 goal01（フェーズ1の30秒シーン）。チームも選手もすべて架空。
//
// 流れ：最終ラインから組み立て → 左SBが運ぶ → 中盤から右ウイングへ大きなサイドチェンジ →
//       ウイングが内へ切り込み、外を回った右SBへ → 右SBの折り返しを10番がワンタッチで整えて、
//       ファーサイド上隅へ巻くシュート → 右コーナーへ走って膝スライディング
//
// 座標：X がピッチの長辺（ホームは +x へ攻める）、Z が短辺（+z がメインスタンド側＝中継カメラの手前）。
// paths: 選手ごとの経路 [[時刻, x, z], ...]。複数の区間を持てる。経路のない時間は布陣に沿って動く。
// contacts: ボールに触れる瞬間。ボールは次の接触点へ予定の時刻ちょうどに届くように蹴られる。
// actions: ボールに触れない動作（スライディング、GK の横っ飛びなど）。

const R = 0.11; // ボールの半径

const players = [
  // ホーム：SEIRAN FC（4-3-3）。base は「ボールがセンターにあるとき」の位置（攻める向き +x 基準）
  { id: 'H1', team: 'home', num: 1, name: 'KIRIYAMA', role: 'GK', base: [-50, 0] },
  { id: 'H2', team: 'home', num: 2, name: 'ASAKURA', role: 'RB', base: [-14, 24] },
  { id: 'H3', team: 'home', num: 3, name: 'HINO', role: 'LB', base: [-14, -24] },
  { id: 'H4', team: 'home', num: 4, name: 'MINAMI', role: 'CB', base: [-20, 8] },
  { id: 'H5', team: 'home', num: 5, name: 'KUROSE', role: 'CB', base: [-20, -8] },
  { id: 'H6', team: 'home', num: 6, name: 'TAKATSU', role: 'DM', base: [-8, 0] },
  { id: 'H7', team: 'home', num: 7, name: 'SAEKI', role: 'RW', base: [14, 25] },
  { id: 'H8', team: 'home', num: 8, name: 'NOGAMI', role: 'CM', base: [0, -11] },
  { id: 'H9', team: 'home', num: 9, name: 'ISURUGI', role: 'CF', base: [18, 0] },
  { id: 'H10', team: 'home', num: 10, name: 'TOWADA', role: 'CM', base: [2, 11] },
  { id: 'H11', team: 'home', num: 11, name: 'HAYAMI', role: 'LW', base: [14, -25] },
  // アウェイ：KUROGANE（4-4-2）。base は攻める向きを +x とみなした座標で書く（実際は -x へ攻める）
  { id: 'A1', team: 'away', num: 1, name: 'DRUMOND', role: 'GK', base: [-50, 0] },
  { id: 'A2', team: 'away', num: 2, name: 'KESSLER', role: 'RB', base: [-16, 22] },
  { id: 'A3', team: 'away', num: 3, name: 'OYELARAN', role: 'LB', base: [-16, -22] },
  { id: 'A4', team: 'away', num: 4, name: 'VANTERPOOL', role: 'CB', base: [-20, 7] },
  { id: 'A5', team: 'away', num: 5, name: 'MIKKELSTAD', role: 'CB', base: [-20, -7] },
  { id: 'A6', team: 'away', num: 6, name: 'RUIZABAL', role: 'CM', base: [-8, 6] },
  { id: 'A7', team: 'away', num: 7, name: 'TORRALBA', role: 'RM', base: [-6, 20] },
  { id: 'A8', team: 'away', num: 8, name: 'ESSIANE', role: 'CM', base: [-8, -6] },
  { id: 'A9', team: 'away', num: 9, name: 'KOVALENKO', role: 'ST', base: [6, 4] },
  { id: 'A10', team: 'away', num: 10, name: 'PELLEGRA', role: 'ST', base: [5, -5] },
  { id: 'A11', team: 'away', num: 11, name: 'ASHWORTH', role: 'LM', base: [-6, -20] },
];

const paths = {
  // 右CB：短く運んで左CBへ
  H4: [
    [0, -36, 6],
    [0.7, -34.4, 5.6],
    [1.3, -33.2, 5.3],
    [2.2, -32.5, 5.6],
    [3.0, -33, 6.5],
  ],
  // 左CB：受けて運び、アンカーへ
  H5: [
    [0, -37, -9],
    [1.2, -36, -8.6],
    [2.6, -34, -8],
    [3.3, -32.4, -7.8],
    [4.0, -31.0, -7.2],
    [4.6, -30.6, -6.8],
    [5.6, -31, -6],
  ],
  // アンカー：受けて前を向き、左SBへ
  H6: [
    [3.8, -25.8, -1.7],
    [5.2, -22.5, -1.5],
    [5.8, -21.2, -2.2],
    [6.6, -20.4, -2.8],
    [7.4, -20.5, -3.5],
  ],
  // 左SB：大外で受けて運び、中へ
  H3: [
    [6.2, -26.5, -24.8],
    [7.2, -20, -25.2],
    [8.2, -13, -25.5],
    [8.9, -9.8, -25.8],
    [9.6, -6.6, -26],
    [10.3, -3.4, -26],
    [11.1, -0.8, -25.6],
    [12.0, 0.5, -25],
  ],
  // 左CM：受けて逆サイドへ大きく蹴る
  H8: [
    [10.6, -3.1, -18.1],
    [11.4, -0.8, -15.0],
    [12.2, 2, -12],
    [12.8, 3.4, -12.3],
    [13.6, 4.4, -12.4],
    [14.6, 4.0, -11.5],
  ],
  // 右ウイング：サイドチェンジを受け、内へ切り込んで右SBへ
  H7: [
    [13.8, 15.9, 21.4],
    [14.7, 18.5, 24.5],
    [15.5, 21, 26.2],
    [16.15, 23.6, 25.0],
    [16.8, 25.8, 23.4],
    [17.45, 27.4, 21.4],
    [18.2, 28.6, 20.2],
    [19.0, 29, 20.5],
  ],
  // 右SB：外を回って追い越し、深い位置から折り返す
  H2: [
    [13.0, -12.9, 19.8],
    [14.5, -3.5, 24.5],
    [16.0, 7, 27.5],
    [17.2, 17, 28.2],
    [18.2, 25.5, 28.3],
    [19.2, 34.0, 27.6],
    [19.85, 37.6, 27.0],
    [20.5, 40.6, 26.2],
    [21.3, 43.0, 25.4],
    [22.2, 44.0, 25],
    [23.2, 44, 25],
  ],
  // 10番：ペナルティエリアの角へ入り、折り返しを整えてシュート
  H10: [
    [19.0, 18.3, 17.4],
    [20.5, 27.5, 12.5],
    [21.6, 34.5, 9.2],
    [22.4, 38.6, 7.2],
    [23.0, 39.8, 6.0],
    [23.7, 40.8, 4.8],
    [24.2, 42.0, 4.3],
  ],
  // CF：ニアへ走ってDFを引きつける
  H9: [
    [19.5, 35.5, 7.0],
    [21.5, 44, -1.5],
    [23.0, 48, -2.5],
    [24.0, 48.5, -3],
  ],
  // 相手の左SB：ゴール側へ戻りながらウイングに飛び込み、内へ切り返されてかわされる
  A3: [
    [15.0, 21.7, 22.5],
    [16.0, 25.5, 23.6],
    [16.6, 27.8, 24.4],
    [17.1, 27.6, 24.2],
    [17.6, 26.4, 24.4],
    [18.4, 25.8, 24.6],
  ],
  // 相手GK：ファーへ飛ぶが届かない
  A1: [
    [23.0, 50.1, 1.0],
    [23.75, 50.2, 0.6],
    [24.3, 50.5, -1.4],
    [25.2, 50.6, -1.6],
    [26.5, 50.6, -1.6],
  ],
};

const contacts = [
  { t: 0.0, p: 'H4', type: 'touch' },
  { t: 0.7, p: 'H4', type: 'touch' },
  { t: 1.3, p: 'H4', type: 'pass' },
  { t: 2.6, p: 'H5', type: 'trap', foot: 'L' },
  { t: 3.3, p: 'H5', type: 'touch', foot: 'L' },
  { t: 4.0, p: 'H5', type: 'pass', foot: 'L' },
  { t: 5.2, p: 'H6', type: 'trap' },
  { t: 5.8, p: 'H6', type: 'touch' },
  { t: 6.6, p: 'H6', type: 'pass' },
  { t: 8.2, p: 'H3', type: 'trap', foot: 'L' },
  { t: 8.9, p: 'H3', type: 'touch', foot: 'L' },
  { t: 9.6, p: 'H3', type: 'touch', foot: 'L' },
  { t: 10.3, p: 'H3', type: 'touch', foot: 'L' },
  { t: 11.1, p: 'H3', type: 'pass', foot: 'L' },
  { t: 12.2, p: 'H8', type: 'trap' },
  { t: 12.8, p: 'H8', type: 'touch' },
  { t: 13.6, p: 'H8', type: 'cross', loft: true },
  { t: 15.5, p: 'H7', type: 'trap', up: 0.35 }, // 落ちてくるボールを空中で止める
  { t: 16.15, p: 'H7', type: 'touch' },
  { t: 16.8, p: 'H7', type: 'touch' },
  { t: 17.45, p: 'H7', type: 'touch', foot: 'L' },
  { t: 18.2, p: 'H7', type: 'pass' },
  { t: 19.2, p: 'H2', type: 'trap' },
  { t: 19.85, p: 'H2', type: 'touch' },
  { t: 20.5, p: 'H2', type: 'touch' },
  { t: 21.3, p: 'H2', type: 'pass' },
  { t: 22.4, p: 'H10', type: 'trap' },
  { t: 23.0, p: 'H10', type: 'touch' },
  // ファーサイドの上隅へ巻くシュート。+y 回りの回転で -z（ファー）へ曲がる
  { t: 23.7, p: 'H10', type: 'shot', target: [52.85, 1.95, -3.05], flight: 0.62, spin: [0, 28, 0] },
];

const actions = [
  { t: 16.9, p: 'A3', type: 'slide', duration: 1.1 },
  { t: 23.8, p: 'A1', type: 'dive', dir: -1, duration: 1.4 },
];

// 得点後の動き（時刻は得点の瞬間からの秒数）
const celebration = {
  player: 'H10',
  path: [
    [0.4, 43.8, 4.6],
    [1.6, 46.5, 9.5],
    [3.0, 49.0, 17.5],
    [4.2, 50.0, 24.0],
    [5.0, 50.4, 27.0],
    [6.0, 50.5, 28.0],
  ],
  actions: [
    { t: 0.5, p: 'H10', type: 'celebrate_run', duration: 3.7 },
    { t: 4.2, p: 'H10', type: 'knee_slide', duration: 1.8 },
  ],
};

export default Object.freeze({
  id: 'goal01',
  seed: 20261011,
  duration: 31,
  teams: {
    home: { name: 'SEIRAN FC', short: 'SEI' },
    away: { name: 'KUROGANE', short: 'KRG' },
  },
  players,
  paths,
  contacts,
  actions,
  celebration,
  ballRadius: R,
});
