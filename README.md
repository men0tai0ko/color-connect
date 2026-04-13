# マッチ3・カラーコネクト

ブラウザで動作するタイムアタック型パズルゲーム。同色ブロックを3個以上チェーンして消去しスコアを競う。

**現在バージョン: v1.8.1**

---

## プレイ方法

1. `index.html` をブラウザで開く
2. プレイヤー名を入力（初回のみ）
3. 難易度を選択して GAME START

**操作:** グリッド上のブロックをドラッグ・スワイプでなぞって繋げ、指を離すと消去。

---

## ファイル構成

```
index.html        HTMLマークアップ・オーバーレイ定義
style.css         CSS（レイアウト・アニメーション・レスポンシブ）
script.js         ゲームロジック全体（Vanilla JS）
README.md         本ファイル
spec.md           ゲーム仕様書
CHANGELOG.md      バージョン変更履歴
HANDOVER.md       引き継ぎ情報
architecture.md   コード構造・モジュール設計
tasks.md          実装予定・TODO
issues.md         既知課題・バグ記録
```

---

## 技術構成

| 項目 | 内容 |
|---|---|
| 言語 | HTML / CSS / Vanilla JavaScript（ES6+） |
| 外部依存 | Google Fonts（Orbitron・Noto Sans JP）のみ |
| ライブラリ | なし（Canvas不使用） |
| ストレージ | LocalStorage |
| サウンド | Web Audio API（外部ファイル不使用） |

---

## 難易度

| 難易度 | 制限時間 | 色数 | スコア倍率 |
|---|---|---|---|
| EASY | 90秒 | 4色 | ×0.8 |
| NORMAL | 60秒 | 5色 | ×1.0 |
| HARD | 45秒 | 5色 | ×1.5 |

---

## デプロイ

静的ファイルのためサーバー不要。GitHub Pages 等に3ファイル（index.html / style.css / script.js）を配置するだけで動作する。

---

## ドキュメント

- 仕様詳細 → `spec.md`
- 変更履歴 → `CHANGELOG.md`
- コード構造 → `architecture.md`
- 引き継ぎ → `HANDOVER.md`
