# 引き継ぎドキュメント — マッチ3・カラーコネクト

作成日: 2026-04-14 / 対応バージョン: v1.9.0

---

## 現在の状態

- **動作状態:** プレイ可能・リリース可能水準
- **最新バージョン:** v1.9.0
- **直近の実装:** ヒント機能（v1.9.0）、手動シャッフル機能（v1.8.0〜v1.8.1）
- **未解決の既知バグ:** なし（issues.md 参照）

---

## 直近の変更概要

| バージョン | 内容 |
|---|---|
| v1.9.0 | ヒント機能追加（無操作5秒・設定ON/OFF・白グローハイライト） |
| v1.8.1 | 手動シャッフルのP1バグ2件修正（コンボリセット漏れ・endGame競合） |
| v1.8.0 | 手動シャッフル機能追加（タイムペナルティ -10秒） |
| v1.7.0 | ゲーム開始前カウントダウン演出（3・2・1・GO!） |
| v1.6.x | WC異色橋渡し対応・ランキング遷移改善・hasValidMoveバグ修正 |

---

## 設計上の注意事項

### アニメーション排他制御
- `Game._animating` フラグで操作を排他。`true` 中はブロック操作・シャッフルボタンすべて無効
- `commitChain()` → `_doShuffle()` → `_doManualShuffle()` はすべて `async/await`
- `endGame()` が `_animating = false` を上書きするため、非同期処理の末尾で必ず `!GameState.running` チェックを行うこと

### HintManager
- 候補座標は `[row,col][]` で保持。DOMではなく座標で管理するため `buildBoard()` 後も状態が有効
- `cancel(reset)` の `reset=true/false` の使い分けが重要。呼び出し箇所リストは `architecture.md` を参照
- `_fire()` は `Game._animating` と `GameState.running` を直接参照するため古いクロージャ問題なし
- `_findCandidate()` は `ChainManager._tailColor()` と同一ロジック。変更時は両方を同期すること

### WildcardManager
- `_spawnWild()` 完了後に `HintManager.cancel(false)` を呼び出す。WC出現でグリッドが変化するため古いヒント候補を破棄する

### ランキング画面の遷移元管理
- `UIManager._rankingFrom` に `'title'` または `'result'` を設定
- `ranking-close-btn` の処理で分岐。`'result'` の場合は `showResult()` に `Game._lastRankPos` を渡して復元

### LocalStorage
- キープレフィックス: `m3cc_`
- ランキングは難易度ごとに最大10件。`RankingManager.addEntry()` が自動的に超過分を切り捨てる
- ヒント設定: `m3cc_hint`（`'1'`=ON / デフォルトOFF）

---

## 引き継ぎ時の確認事項

- [ ] `tasks.md` のUnreleasedタスクを確認
- [ ] `issues.md` の未解決課題を確認
- [ ] `CHANGELOG.md` の `[Unreleased]` セクションに追加予定機能があれば確認

---

## ファイル一覧（最新版）

| ファイル | 最終更新バージョン |
|---|---|
| `index.html` | v1.9.0（設定画面にヒントトグル追加） |
| `style.css` | v1.9.0（.block.hint・トグルUI追加） |
| `script.js` | v1.9.0 |
| `CHANGELOG.md` | v1.9.0 |
| `spec.md` | v1.9.0 |
| `README.md` | v1.8.1 |
| `architecture.md` | v1.9.0 |
| `HANDOVER.md` | v1.9.0（本ファイル） |
| `tasks.md` | v1.9.0 |
| `issues.md` | v1.8.1 |
