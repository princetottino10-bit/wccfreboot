// ピッチとゴールの寸法（メートル）。座標系：X がピッチの長辺、Z が短辺、Y が上。
// センターマークが原点。ゴールは x = ±HALF_LENGTH にある。描画もこの値を読んで形を作る。

export const PITCH = Object.freeze({
  length: 105,
  width: 68,
  halfLength: 52.5,
  halfWidth: 34,
  lineWidth: 0.12,
  centerCircleRadius: 9.15,
  penaltyAreaDepth: 16.5,
  penaltyAreaWidth: 40.32,
  goalAreaDepth: 5.5,
  goalAreaWidth: 18.32,
  penaltySpot: 11,
  cornerArcRadius: 1,
  // ピッチの外側の芝（タッチラインからスタンドまで）
  runoffX: 6,
  runoffZ: 5,
});

export const GOAL = Object.freeze({
  width: 7.32, // ポストの内側の間隔
  height: 2.44, // クロスバーの下端まで
  postRadius: 0.06,
  depth: 2.0, // ゴールラインからネットの奥まで
  topDepth: 1.0, // ネットの屋根が水平に伸びる長さ（その先は奥へ斜めに下がる）
});

export const BALL = Object.freeze({
  radius: 0.11,
  mass: 0.43,
});

/** ゴールの向き：+1 は x 正側のゴール、-1 は x 負側のゴール */
export function goalLineX(side) {
  return side * PITCH.halfLength;
}
