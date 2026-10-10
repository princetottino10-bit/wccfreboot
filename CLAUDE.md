# CLAUDE.md

iPhone の Safari（横持ち・ホーム画面に追加）で遊ぶ 3D サッカー育成ゲーム。three.js 製。
設計書は [docs/design.md](docs/design.md)。全フェーズの前提なので、設計判断の前に必ず読む。

## いまのフェーズ

フェーズ1「見栄えの縦切り」：台本どおりに動く 30 秒のゴールシーンと、ゴール後の 3 アングルリプレイを中継風の画で再生する。遊べなくてよい。
計画は [docs/phase1-plan.md](docs/phase1-plan.md)。完了基準を満たすまでフェーズ2に進まない。

## 技術構成

| 役割 | 使うもの |
| --- | --- |
| 描画 | three.js `WebGPURenderer`（iOS 26 未満は同じレンダラーの WebGL2 バックエンド）。シェーダーは TSL で書き、両バックエンドで動かす |
| 後処理 | three.js の TSL ポストエフェクト（ブルーム、色調補正、被写界深度はリプレイ時のみ） |
| ボール物理 | Rapier（`@dimforge/rapier3d-compat`）。選手は物理で動かさない |
| 試合の進行 | 自作。固定タイムステップ（60Hz）で状態を進める。フェーズ1は台本再生がこの役 |
| 選手アニメーション | 自作。モーションマッチング、足の IK、ボール接触の同期、首・上半身のひねり |
| 3D データ | glTF（.glb）、テクスチャは KTX2 |
| 公開 | GitHub Pages ＋ サービスワーカー。ビルドなしの素の HTML/CSS/JS。ライブラリは `vendor/` に同梱し import map で読む |
| テスト | `node --test`。描画に依存しない部分は画面なしでテストを先に書く |
| セーブ | Supabase（フェーズ3から） |

## フォルダ構成

```
index.html            エントリ。import map はここ
sw.js                 サービスワーカー
manifest.webmanifest
vendor/               three.js, Rapier などの同梱ライブラリ（手で編集しない）
src/
  sim/                試合の状態と進行。DOM・three.js を import しない（Node で動く）
    loop.js           固定タイムステップ
    rng.js            種つき乱数
    ball.js           Rapier によるボール物理
    script/           ゴールシーンの台本データと台本再生
  anim/               骨格・モーションマッチング・IK・接触同期（sim の状態を読む側）
  render/             three.js の描画。sim の状態を読むだけ
    stadium/ pitch/ players/ crowd/ net/ camera/ post/
    quality.js        画質プリセット（WebGPU 高 / WebGL 中 / 低）
  audio/              歓声・キック音・ホイッスル
  ui/                 開発用の FPS・描画数表示
assets/               差し替え可能な素材。ファイルを置き換えるだけで反映される
  CREDITS.md          使った素材の出典とライセンス
tests/                node --test
docs/
```

## 守ること

- 実在のクラブ名・選手名・エンブレム・リーグロゴ・スポンサーを、コードにも素材にも入れない。選手は全員架空
- 試合の進行（`src/sim/`）と描画（`src/render/`）を切り離す。描画側に試合のルールや判定を書かない。描画は sim の状態を読むだけ
- `src/sim/` は Node で動くこと。three.js・DOM・Web Audio を import しない
- リプレイは「同じ入力と乱数の種で sim を再実行する」方式で作る
- 大きな設計判断（ライブラリの追加、フォルダ構成の変更、仕様にない機能）は実装前にユーザーに確認する
- ライセンスが不明な素材は使わない。使った素材は `assets/CREDITS.md` に書く
- 仮素材は `assets/` 配下のファイルを差し替えるだけで本番素材に切り替わるように作る
- 作業の区切りごとに、できたこと・残っていること・iPhone 実機で確認してほしい点を短く報告する
- iPhone の性能が基準。目標は実機で 30fps 以上
