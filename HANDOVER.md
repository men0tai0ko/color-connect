# 引き継ぎドキュメント — マッチ3・カラーコネクト

作成日: 2026-02-20 / 対応バージョン: v1.8.1

---

## 現在の状態

- **動作状態:** プレイ可能・リリース可能水準
- **最新バージョン:** v1.8.1
- **直近の実装:** 手動シャッフル機能（v1.8.0〜v1.8.1）、カウントダウン演出（v1.7.0）
- **未解決の既知バグ:** なし（issues.md 参照）

---

## 直近の変更概要

| バージョン | 内容 |
|---|---|
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

### WildcardManager
- `_spawnWild()` は `_spawnOne()` を最大2回呼ぶ。2回目は1回目の出現後に `existingWilds` を再収集するため位置が重複しない
- WCの `wildCount` は `GameState` が保持。消去時は `WildcardManager.onRemove()` で減算

### ランキング画面の遷移元管理
- `UIManager._rankingFrom` に `'title'` または `'result'` を設定
- `ranking-close-btn` の処理で分岐。`'result'` の場合は `showResult()` に `Game._lastRankPos` を渡して復元

### LocalStorage
- キープレフィックス: `m3cc_`
- ランキングは難易度ごとに最大10件。`RankingManager.addEntry()` が自動的に超過分を切り捨てる

---

## 引き継ぎ時の確認事項

- [ ] `tasks.md` のUnreleasedタスクを確認
- [ ] `issues.md` の未解決課題を確認
- [ ] `CHANGELOG.md` の `[Unreleased]` セクションに追加予定機能があれば確認

---

## ファイル一覧（最新版）

| ファイル | 最終更新バージョン |
|---|---|
| `index.html` | v1.8.0（chain-bar-inner構造追加） |
| `style.css` | v1.8.0（手動シャッフルボタン・カウントダウン） |
| `script.js` | v1.8.1 |
| `CHANGELOG.md` | v1.8.1 |
| `spec.md` | v1.8.1 |
| `README.md` | v1.8.1 |
| `architecture.md` | v1.8.1 |
| `HANDOVER.md` | v1.8.1（本ファイル） |
| `tasks.md` | v1.8.1 |
| `issues.md` | v1.8.1 |
