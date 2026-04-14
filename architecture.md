# アーキテクチャ — マッチ3・カラーコネクト

対応バージョン: v1.9.0

---

## ファイル構成

```
index.html   — DOM構造・オーバーレイ定義（ロジックなし）
style.css    — スタイル・アニメーション・レスポンシブ
script.js    — ゲームロジック全体（モジュール分割なし・単一ファイル）
```

---

## script.js モジュール構成

```
script.js
├── 定数
│   ├── DIFFICULTY        難易度設定（time / colors / scoreMulti）
│   ├── WILD              ワイルドカード識別子 ('wild')
│   ├── MANUAL_SHUFFLE_PENALTY  手動シャッフルペナルティ秒数 (10)
│   ├── GRID_COLS / GRID_ROWS   グリッドサイズ (6×7)
│   └── calcBaseScore()   チェーン数→基本スコア変換
│
├── SoundManager          Web Audio API サウンド生成
│   ├── playSelect()
│   ├── playRemove()
│   ├── playCombo()
│   ├── playTimerWarning()
│   ├── playGameOver()
│   ├── playNewRecord()
│   ├── playCancel()
│   ├── playCountBeep()   カウントダウン 3・2・1
│   └── playCountGo()     GO! ファンファーレ
│
├── StorageManager        LocalStorage ラッパー
│   ├── getBest / setBest
│   ├── getPlayerName / setPlayerName
│   ├── isInitialized / setInitialized
│   ├── getRanking / setRanking
│   └── getHint / setHint
│
├── RankingManager        ランキング管理
│   └── addEntry()        スコア登録・上位10件維持
│
├── PlayerManager         プレイヤー名管理・バリデーション
│   ├── validate()
│   ├── save()
│   └── getDisplayName()
│
├── GameState             グリッド状態・スコア・タイマー値の保持
│   ├── grid[][]          ブロック色の2次元配列
│   ├── init()            ゲーム開始時の初期化
│   ├── addScore()        スコア計算・コンボ加算
│   ├── removeBlocks()    消去→落下→補充
│   ├── hasValidMove()    有効手判定（BFS）
│   ├── shuffle()         Fisher-Yates シャッフル
│   └── wildCount         現在グリッド上のWC数
│
├── ChainManager          選択チェーンの管理
│   ├── tryAdd()          ブロック追加試行
│   ├── normalCount()     通常ブロック数カウント
│   ├── reachableSet()    到達可能セル計算
│   ├── selectedSet()     選択済みセル集合
│   └── _tailColor()      末尾有効色取得
│
├── WildcardManager       WCブロック出現制御
│   ├── MAX_WILD          上限数 (6)
│   ├── onTick()          タイマー毎秒呼び出し・しきい値判定
│   ├── _spawnWild()      2個同時出現ループ（完了後HintManager.cancel）
│   ├── _spawnOne()       1個出現処理（距離制約・橋渡し優先）
│   ├── _wildBridgeCount() 橋渡し成立判定
│   └── onRemove()        消去時のwildCount減算
│
├── HintManager           無操作ヒント表示制御
│   ├── IDLE_SEC          無操作判定秒数 (5)
│   ├── start()           ゲーム開始時にタイマーをセット
│   ├── cancel(reset)     ヒント解除（reset=true: タイマー再セット）
│   ├── _schedule()       setTimeoutでタイマーをセット
│   ├── _fire()           無操作タイムアウト時に候補探索→表示
│   ├── _applyHint()      座標リストからDOMにhintクラスを付与
│   ├── _hideHint()       hintクラスを除去・候補リセット
│   └── _findCandidate()  ChainManager同一ロジックでBFS候補探索
│
├── TimerManager          setInterval によるタイマー管理
│   ├── start()
│   └── stop()
│
├── UIManager             DOM操作・画面表示
│   ├── buildBoard()      グリッドDOM生成
│   ├── animateRemove()   消去アニメーション
│   ├── animateDrop()     落下アニメーション
│   ├── updateChainBar()  チェーンバー更新
│   ├── updateManualShuffleBtn()  手動シャッフルボタン状態
│   ├── updateHintToggle()        ヒントトグルUI状態更新
│   ├── showCountdown() / hideCountdown()
│   ├── showResult() / hideResult()
│   ├── showRanking() / hideRanking()
│   ├── showShuffleBanner()
│   └── _rankingFrom      ランキング遷移元フラグ ('title'|'result')
│
├── GridManager           グリッド設定値の提供
│
└── Game                  ゲームフロー制御（最上位コントローラ）
    ├── init()            イベント登録・初期表示
    ├── start()           ゲーム開始（グリッド構築→カウントダウン）
    ├── _startCountdown() 3→2→1→GO! 制御
    ├── _beginGame()      タイマー起動・操作有効化・HintManager起動
    ├── commitChain()     チェーン確定・消去・補充・詰まり検出
    ├── _doShuffle()      自動シャッフル演出
    ├── _doManualShuffle() 手動シャッフル（ペナルティ・競合制御）
    ├── cancelChain()     チェーンキャンセル
    ├── endGame()         ゲーム終了・スコア保存・結果表示
    ├── goTitle()         タイトルへ戻る
    ├── _lastRankPos      ランクイン位置保持（ランキング→結果画面復帰用）
    └── _animating        アニメーション中フラグ（操作排他制御）
```

---

## データフロー

```
ユーザー操作（タッチ/マウス）
  → _initDragHandlers()
    → onBlockClick() / onBlockDrag()
      → ChainManager.tryAdd()
        → 'added'   : UIManager.updateSelection / updateChainBar
        → 'confirm' : Game.commitChain()
        → 'cancel'  : Game.cancelChain()

commitChain()
  → WildcardManager.onRemove()
  → GameState.removeBlocks()
  → UIManager.animateRemove() → animateDrop()
  → hasValidMove() → false → _doShuffle()
  → UIManager.updateScore()
```

---

## 状態管理

| 状態 | 保持場所 | 型 |
|---|---|---|
| グリッド | `GameState.grid` | `string[][]` |
| スコア・コンボ | `GameState` | `number` |
| 残り時間 | `GameState.timeLeft` | `number` |
| 選択チェーン | `ChainManager.chain` | `{row,col}[]` |
| WC数 | `GameState.wildCount` | `number` |
| アニメーション中 | `Game._animating` | `boolean` |
| ランキング遷移元 | `UIManager._rankingFrom` | `'title'\|'result'` |
| ヒント候補座標 | `HintManager._cells` | `[number,number][]\|null` |
| ベストスコア | LocalStorage | `number` |
| ランキング | LocalStorage | `JSON配列` |
| ヒントON/OFF | LocalStorage | `'0'\|'1'` |

---

## 画面・オーバーレイ制御

オーバーレイは `.active` クラスの付与/除去で表示切替。同時に複数のオーバーレイが `active` になることは設計上ない。

| オーバーレイID | 制御メソッド |
|---|---|
| `overlay-setup` | `showSetup() / hideSetup()` |
| `overlay-start` | `showStart() / hideStart()` |
| `overlay-result` | `showResult() / hideResult()` |
| `overlay-ranking` | `showRanking() / hideRanking()` |
| `overlay-settings` | `showSettings() / hideSettings()` |
