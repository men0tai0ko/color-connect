/**
 * マッチ3・カラーコネクト — script.js  v1.9.1
 * 修正: WC出現時にヒント表示が消えたままになるバグを修正
 */
'use strict';

/* ============================================================
   難易度設定
   ============================================================ */
const DIFFICULTY = {
  easy: {
    label: 'EASY',
    time:  90,
    colors: ['red','blue','green','yellow'],   // 4色（繋がりやすい）
    scoreMulti: 0.8,
    desc: '90秒 ／ 4色 ／ スコア×0.8',
  },
  normal: {
    label: 'NORMAL',
    time:  60,
    colors: ['red','blue','green','yellow','purple'],
    scoreMulti: 1.0,
    desc: '60秒 ／ 5色 ／ スコア×1.0',
  },
  hard: {
    label: 'HARD',
    time:  45,
    colors: ['red','blue','green','yellow','purple'],
    scoreMulti: 1.5,
    desc: '45秒 ／ 5色 ／ スコア×1.5',
  },
};
let currentDiff = 'normal';

/* ============================================================
   定数
   ============================================================ */
// ワイルドカードブロックの色識別子
const WILD = 'wild';

// 手動シャッフルのタイムペナルティ（秒）
const MANUAL_SHUFFLE_PENALTY = 10;

// 全デバイス共通グリッドサイズ（6列×7行固定）
// スマホでも44px以上のタップサイズを確保しつつ、
// PCでも寂しくないバランスの取れた設定。
const GRID_COLS = 6;
const GRID_ROWS = 7;

function calcBaseScore(n) {
  if (n < 3)  return 0;
  if (n === 3) return 100;
  if (n === 4) return 250;
  if (n === 5) return 450;
  return 450 + (n - 5) * 100;
}

/* ============================================================
   SoundManager — Web Audio API
   ============================================================ */
const SoundManager = {
  ctx: null,
  enabled: true,

  _getCtx() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch { this.enabled = false; }
    }
    // モバイルでは初回ユーザー操作後に resume が必要
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  // 基本音生成ユーティリティ
  _tone(freq, type, duration, gainVal, startDelay = 0) {
    if (!this.enabled) return;
    const ctx = this._getCtx();
    if (!ctx) return;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelay);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime + startDelay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration);
    osc.start(ctx.currentTime + startDelay);
    osc.stop(ctx.currentTime + startDelay + duration + 0.01);
  },

  // ブロック選択音（軽いクリック）
  playSelect(chainLen) {
    // チェーンが長いほど音程が上がる
    const freq = 440 + chainLen * 40;
    this._tone(freq, 'sine', 0.08, 0.15);
  },

  // 消去音（チェーン数に応じた和音）
  playRemove(chainLen, combo) {
    const base = 330 + chainLen * 20;
    this._tone(base,        'sine',   0.25, 0.2,  0);
    this._tone(base * 1.26, 'sine',   0.2,  0.15, 0.04);
    if (chainLen >= 5) {
      this._tone(base * 1.5, 'sine',  0.18, 0.12, 0.08);
    }
    if (combo >= 2) {
      // コンボ時は明るく追加音
      this._tone(880, 'triangle', 0.15, 0.12, 0.1);
    }
  },

  // コンボ音（連続消去の高揚感）
  playCombo(combo) {
    const freqs = [523, 659, 784, 1047]; // C5 E5 G5 C6
    const f = freqs[Math.min(combo - 2, freqs.length - 1)];
    this._tone(f,       'square', 0.15, 0.1, 0);
    this._tone(f * 1.5, 'square', 0.12, 0.08, 0.06);
  },

  // タイムアップ警告音
  playTimerWarning() {
    this._tone(220, 'sawtooth', 0.1, 0.08);
  },

  // ゲームオーバー
  playGameOver() {
    this._tone(330, 'sawtooth', 0.3, 0.15, 0);
    this._tone(247, 'sawtooth', 0.4, 0.12, 0.2);
    this._tone(196, 'sawtooth', 0.5, 0.10, 0.45);
  },

  // NEW RECORD
  playNewRecord() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => this._tone(f, 'sine', 0.18, 0.14, i * 0.07));
  },

  // キャンセル
  playCancel() {
    this._tone(300, 'triangle', 0.1, 0.08);
    this._tone(250, 'triangle', 0.1, 0.06, 0.07);
  },

  // カウントダウンビープ（3・2・1 共通）— F1風の低く短いビープ
  playCountBeep() {
    this._tone(220, 'sine', 0.12, 0.35);
    this._tone(220, 'square', 0.08, 0.12);
  },

  // GO! — 上昇2音の短いファンファーレ
  playCountGo() {
    this._tone(660, 'sine', 0.18, 0.3,  0);
    this._tone(880, 'sine', 0.22, 0.35, 0.1);
  },
};

/* ============================================================
   StorageManager — LocalStorage ラッパー
   ============================================================ */
const StorageManager = {
  KEY_PREFIX:   'm3cc_best_',
  KEY_RANKING:  'm3cc_ranking_',
  KEY_PLAYER:   'm3cc_player',
  KEY_INIT:     'm3cc_initialized',

  _get(key)       { try { return localStorage.getItem(key); }         catch { return null; } },
  _set(key, val)  { try { localStorage.setItem(key, val); }           catch { /* ignore */ } },

  getBest(diff) {
    return parseInt(this._get(this.KEY_PREFIX + diff)) || 0;
  },
  setBest(diff, score) {
    this._set(this.KEY_PREFIX + diff, score);
  },

  // ── プレイヤー名 ──────────────────────────────────────────
  getPlayerName() {
    return this._get(this.KEY_PLAYER) || '';
  },
  setPlayerName(name) {
    this._set(this.KEY_PLAYER, name);
  },

  // 初回起動フラグ
  isInitialized() {
    return this._get(this.KEY_INIT) === '1';
  },
  setInitialized() {
    this._set(this.KEY_INIT, '1');
  },

  // ── ヒント設定 ────────────────────────────────────────────
  KEY_HINT: 'm3cc_hint',
  getHint() { return this._get(this.KEY_HINT) === '1'; },   // デフォルトOFF
  setHint(val) { this._set(this.KEY_HINT, val ? '1' : '0'); },

  // ── ランキング ────────────────────────────────────────────
  getRanking(diff) {
    try {
      const raw = this._get(this.KEY_RANKING + diff);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },
  setRanking(diff, list) {
    try { this._set(this.KEY_RANKING + diff, JSON.stringify(list)); }
    catch { /* ignore */ }
  },
};

/* ============================================================
   PlayerManager — プレイヤー名管理・バリデーション
   ============================================================ */
const PlayerManager = {
  MAX_WIDTH: 16, // 半角換算の最大幅（全角1文字＝2、半角1文字＝1）

  // 文字列の半角換算幅を計算
  calcWidth(str) {
    let w = 0;
    for (const ch of str) {
      w += ch.match(/[^-ÿ]/) ? 2 : 1; // 全角=2、半角=1
    }
    return w;
  },

  // バリデーション — OK なら '' 、エラーなら日本語メッセージを返す
  validate(str) {
    if (str.length === 0) return ''; // 空欄はOK（NO NAMEになる）
    // 使用可能文字チェック：日本語・半角大文字・数字・スペースのみ
    if (!/^[A-Z0-9　-鿿豈-﫿぀-ヿ！-｠ 　]*$/.test(str)) {
      return '使用できない文字が含まれています（半角大文字・数字・日本語のみ）';
    }
    if (this.calcWidth(str) > this.MAX_WIDTH) {
      return `文字数オーバーです（全角8文字・半角16文字まで）`;
    }
    return '';
  },

  // 入力を正規化（半角小文字→大文字変換）
  normalize(str) {
    return str.toUpperCase().trim();
  },

  // 表示名（空欄時は NO NAME）
  getDisplayName() {
    return StorageManager.getPlayerName() || 'NO NAME';
  },
};

/* ============================================================
   RankingManager — ランキング管理
   ============================================================ */
const RankingManager = {
  MAX_ENTRIES: 10,

  // エントリを追加してランクイン位置を返す（0-indexed）。圏外なら -1
  addEntry(diff, score, bestCombo, playerName) {
    const list = StorageManager.getRanking(diff);
    const entry = {
      name:      playerName || 'NO NAME',
      score,
      bestCombo,
      date:      this._formatDate(new Date()),
    };

    list.push(entry);
    list.sort((a, b) => b.score - a.score || b.bestCombo - a.bestCombo);

    const rank = list.findIndex(e => e === entry);
    const trimmed = list.slice(0, this.MAX_ENTRIES);
    StorageManager.setRanking(diff, trimmed);

    return rank < this.MAX_ENTRIES ? rank : -1;
  },

  // ランクインするか事前チェック（圏外なら false）
  willRankIn(diff, score) {
    const list = StorageManager.getRanking(diff);
    if (list.length < this.MAX_ENTRIES) return true;
    return score > list[list.length - 1].score;
  },

  _formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  },
};

/* ============================================================
   GameState
   ============================================================ */
const GameState = {
  score:    0,
  best:     0,
  timeLeft: 60,
  running:  false,
  cols:     6,
  rows:     8,
  grid:     [],
  combo:    0,       // 現在のコンボ数
  bestCombo: 0,      // このゲーム中の最高コンボ
  _comboTimer: null, // コンボリセットタイマー
  wildCount: 0,      // 現在グリッド上のワイルド数

  init(cols, rows, diff) {
    this.cols = cols;
    this.rows = rows;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.timeLeft = DIFFICULTY[diff].time;
    this.running = false;
    const colors = DIFFICULTY[diff].colors;
    this.grid = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => randomColor(colors))
    );
    if (this._comboTimer) clearTimeout(this._comboTimer);
    this._comboTimer = null;
    this.wildCount = 0;
  },

  addScore(n, timeLeft, diff) {
    const cfg = DIFFICULTY[diff];
    let pts = calcBaseScore(n);

    // タイムボーナス
    if (timeLeft >= Math.floor(cfg.time * 0.5)) pts += 20;
    if (timeLeft <= 10) pts = Math.floor(pts * 1.5);

    // 難易度倍率
    pts = Math.floor(pts * cfg.scoreMulti);

    // コンボボーナス（2コンボ目から +30% ずつ、最大3倍）
    this.combo++;
    if (this._comboTimer) clearTimeout(this._comboTimer);
    // コンボは次の消去が3秒以内に来ないとリセット
    this._comboTimer = setTimeout(() => { this.combo = 0; }, 3000);

    if (this.combo >= 2) {
      const multi = Math.min(1 + (this.combo - 1) * 0.3, 3.0);
      pts = Math.floor(pts * multi);
    }
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;

    this.score += pts;
    if (this.score > this.best) this.best = this.score;
    return { pts, combo: this.combo };
  },

  resetCombo() {
    if (this._comboTimer) clearTimeout(this._comboTimer);
    this.combo = 0;
  },

  removeBlocks(cells, diff) {
    const colors = DIFFICULTY[diff].colors;
    for (const [r, c] of cells) this.grid[r][c] = null;
    this._drop();
    this._fill(colors);
  },

  _drop() {
    for (let c = 0; c < this.cols; c++) {
      const stack = [];
      for (let r = 0; r < this.rows; r++) {
        if (this.grid[r][c] !== null) stack.push(this.grid[r][c]);
      }
      for (let r = 0; r < this.rows; r++) {
        const filled = r >= (this.rows - stack.length);
        this.grid[r][c] = filled ? stack[r - (this.rows - stack.length)] : null;
      }
    }
  },

  _fill(colors) {
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++)
        if (this.grid[r][c] === null) this.grid[r][c] = randomColor(colors);
  },

  // ── 詰まり判定 ──────────────────────────────────────────
  // 通常ブロックを起点に BFS し、WCを経由して異色も辿りながら
  // 通常ブロックが3個以上到達できるか判定
  //
  // queue の各要素: { r, c, activeColor, prevIsWild }
  //   activeColor : 直前の通常ブロックの色（WC連続時も最後の通常色を保持）
  //   prevIsWild  : 直前のセルがWCだったか（true のとき次は任意色を許可）
  hasValidMove() {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const startColor = this.grid[r][c];
        if (!startColor || startColor === WILD) continue;

        const visited = new Set([`${r},${c}`]);
        const queue = [{ r, c, activeColor: startColor, prevIsWild: false }];
        let normalCount = 1;

        while (queue.length) {
          const { r: cr, c: cc, activeColor, prevIsWild } = queue.shift();
          const curIsWild = this.grid[cr][cc] === WILD;
          for (const [dr, dc] of dirs) {
            const nr = cr + dr, nc = cc + dc;
            const key = `${nr},${nc}`;
            if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
            if (visited.has(key)) continue;
            const nc_color = this.grid[nr][nc];
            if (!nc_color) continue;

            // 進める条件:
            //   次がWC → 常に可
            //   現在がWC → 任意の通常色へ可（色切り替え）
            //   それ以外 → activeColor と同色のみ
            if (nc_color !== WILD && !curIsWild && nc_color !== activeColor) continue;

            visited.add(key);
            // WCを通過したら nextActiveColor は activeColor を引き継ぐ
            // 通常ブロックへ移動したらその色が新しい activeColor
            const nextActive = nc_color === WILD ? activeColor : nc_color;
            queue.push({ r: nr, c: nc, activeColor: nextActive, prevIsWild: curIsWild });
            if (nc_color !== WILD) normalCount++;
            if (normalCount >= 3) return true;
          }
        }
      }
    }
    return false;
  },

  // ── Fisher-Yates シャッフル（全ブロックの位置を入れ替え）──
  shuffle(colors) {
    // 全セルを1次元配列に
    const flat = [];
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++)
        flat.push(this.grid[r][c]);

    // Fisher-Yates
    for (let i = flat.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [flat[i], flat[j]] = [flat[j], flat[i]];
    }

    // 書き戻し
    let idx = 0;
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++)
        this.grid[r][c] = flat[idx++];

    // シャッフル後も詰まっている場合は再生成（最大5回試行）
    let tries = 0;
    while (!this.hasValidMove() && tries < 5) {
      this._fill_random(colors);
      tries++;
    }
  },

  // 全マスをランダム再生成（最終手段）
  _fill_random(colors) {
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++)
        this.grid[r][c] = randomColor(colors);
  },
};

/* ============================================================
   ChainManager
   ============================================================ */
const ChainManager = {
  chain: [],
  color: null, // チェーン開始色（UI表示・チェーンバードット色に使用）

  reset() { this.chain = []; this.color = null; },

  // チェーン末尾の「有効色」を返す
  // WCが末尾の場合はその手前の通常ブロックの色を返す（次に繋げる色の基準）
  _tailColor() {
    for (let i = this.chain.length - 1; i >= 0; i--) {
      const c = GameState.grid[this.chain[i].row][this.chain[i].col];
      if (c !== WILD) return c;
    }
    return null;
  },

  tryAdd(row, col) {
    const color = GameState.grid[row][col];
    if (!color) return 'invalid';

    const isWild = color === WILD;

    if (this.chain.length === 0) {
      if (isWild) return 'invalid'; // WC単体では開始不可
      this.chain.push({ row, col });
      this.color = color;
      return 'added';
    }

    // 先頭タップ判定
    const head = this.chain[0];
    if (head.row === row && head.col === col) {
      return (this.chain.length >= 3 && this.normalCount() >= 3) ? 'confirm' : 'cancel';
    }

    const tail = this.chain[this.chain.length - 1];
    if (tail.row === row && tail.col === col) return 'invalid';

    // 追加可能条件：WC、または末尾有効色と同色、または末尾がWCなら任意の通常色
    const tailColor = this._tailColor();
    const tailIsWild = GameState.grid[tail.row][tail.col] === WILD;
    if (!isWild && !tailIsWild && color !== tailColor) return 'invalid';

    // 1つ前のブロックへの巻き戻し
    if (this.chain.length >= 2) {
      const prev = this.chain[this.chain.length - 2];
      if (prev.row === row && prev.col === col) { this.chain.pop(); return 'added'; }
    }

    if (this.chain.findIndex(b => b.row === row && b.col === col) !== -1) return 'invalid';
    if (!this._isAdjacent(tail, { row, col })) return 'invalid';

    this.chain.push({ row, col });
    return 'added';
  },

  // チェーン内の通常ブロック数（ワイルド除く）
  normalCount() {
    return this.chain.filter(b => GameState.grid[b.row][b.col] !== WILD).length;
  },

  _isAdjacent(a, b) { return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1; },

  selectedSet() { return new Set(this.chain.map(b => `${b.row},${b.col}`)); },

  reachableSet() {
    if (this.chain.length === 0) return new Set();
    const tail = this.chain[this.chain.length - 1];
    const tailColor = this._tailColor();
    const tailIsWild = GameState.grid[tail.row][tail.col] === WILD;
    const result = new Set();
    const selSet = this.selectedSet();
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = tail.row + dr, nc = tail.col + dc;
      if (nr < 0 || nr >= GameState.rows || nc < 0 || nc >= GameState.cols) continue;
      if (selSet.has(`${nr},${nc}`)) continue;
      const nc_color = GameState.grid[nr][nc];
      // WCは常に到達可能
      // 末尾がWCなら任意の通常色も到達可能
      // それ以外は同色のみ
      if (nc_color === WILD) result.add(`${nr},${nc}`);
      else if (tailIsWild && nc_color) result.add(`${nr},${nc}`);
      else if (nc_color === tailColor) result.add(`${nr},${nc}`);
    }
    if (this.chain.length >= 3 && this.normalCount() >= 3)
      result.add(`${this.chain[0].row},${this.chain[0].col}`);
    return result;
  },
};

/* ============================================================
   WildcardManager — ワイルドカードブロック管理
   ============================================================ */
const WildcardManager = {
  MAX_WILD: 6,

  // 難易度の制限時間に応じたしきい値を計算（75%・50%・25%）
  getThresholds(diff) {
    const t = DIFFICULTY[diff].time;
    return [
      Math.round(t * 0.75),
      Math.round(t * 0.50),
      Math.round(t * 0.25),
    ];
  },

  // タイマー tick ごとに呼ばれる。しきい値を超えたら変化を試みる
  onTick(timeLeft, diff) {
    const thresholds = this.getThresholds(diff);
    if (!thresholds.includes(timeLeft)) return;
    if (GameState.wildCount >= this.MAX_WILD) return;
    this._spawnWild();
  },

  // (r,c) をWCに変えたとき、隣接する色Xで通常ブロック3個以上のチェーンが
  // 成立できるかを判定するヘルパー
  _wildBridgeCount(r, c) {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    const rows = GameState.rows, cols = GameState.cols;

    // 隣接する通常ブロックの色を収集（重複除去）
    const neighborColors = new Set();
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const col = GameState.grid[nr][nc];
      if (col && col !== WILD) neighborColors.add(col);
    }

    // 各隣接色について、(r,c) をWCと仮定してBFSで到達できる通常ブロック数を数える
    for (const color of neighborColors) {
      const visited = new Set([`${r},${c}`]); // WC位置は通過可能として登録
      const queue = [];
      // 起点：隣接する同色ブロック
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (GameState.grid[nr][nc] === color) {
          const key = `${nr},${nc}`;
          if (!visited.has(key)) { visited.add(key); queue.push([nr, nc]); }
        }
      }
      let normalCount = queue.length; // 隣接同色の数
      // BFSで同色またはWCを辿る
      while (queue.length) {
        const [cr, cc] = queue.shift();
        for (const [dr, dc] of dirs) {
          const nr = cr + dr, nc2 = cc + dc;
          if (nr < 0 || nr >= rows || nc2 < 0 || nc2 >= cols) continue;
          const key = `${nr},${nc2}`;
          if (visited.has(key)) continue;
          const nc_color = GameState.grid[nr][nc2];
          if (nc_color === color) {
            visited.add(key); queue.push([nr, nc2]); normalCount++;
          } else if (nc_color === WILD) {
            visited.add(key); queue.push([nr, nc2]); // WCは通過可能
          }
        }
      }
      if (normalCount >= 3) return true; // この色で橋渡し成立
    }
    return false;
  },

  // グリッド上のランダムな通常ブロックをワイルドに変化（2個同時・距離制約付き）
  _spawnWild() {
    const spawnCount = 2;
    for (let i = 0; i < spawnCount; i++) {
      if (GameState.wildCount >= this.MAX_WILD) break;
      this._spawnOne();
    }
    HintManager.refreshHint(); // WC出現でグリッドが変化したため表示中なら候補を更新
  },

  // 1個分の出現処理
  _spawnOne() {
    const chainSet = ChainManager.selectedSet();

    // 既存WCの位置を収集（距離計算用）
    const existingWilds = [];
    for (let r = 0; r < GameState.rows; r++)
      for (let c = 0; c < GameState.cols; c++)
        if (GameState.grid[r][c] === WILD) existingWilds.push([r, c]);

    // マンハッタン距離の最小値を返すヘルパー
    const minDist = (r, c) => {
      if (existingWilds.length === 0) return Infinity;
      return Math.min(...existingWilds.map(([wr, wc]) => Math.abs(r - wr) + Math.abs(c - wc)));
    };

    // 橋渡し成立マスを優先候補として収集
    const preferred3 = []; // 距離3以上 かつ 橋渡し成立
    const preferred2 = []; // 距離2以上 かつ 橋渡し成立
    const fallback3  = []; // 距離3以上（橋渡し不問）
    const fallback2  = []; // 距離2以上（橋渡し不問）

    for (let r = 0; r < GameState.rows; r++) {
      for (let c = 0; c < GameState.cols; c++) {
        if (GameState.grid[r][c] === WILD || chainSet.has(`${r},${c}`)) continue;
        const d = minDist(r, c);
        if (d < 2) continue; // 隣接は除外
        const bridge = this._wildBridgeCount(r, c);
        if (d >= 3 && bridge)  preferred3.push([r, c]);
        if (d >= 2 && bridge)  preferred2.push([r, c]);
        if (d >= 3)            fallback3.push([r, c]);
        if (d >= 2)            fallback2.push([r, c]);
      }
    }

    // 優先度順に候補を選択
    const candidates =
      preferred3.length > 0 ? preferred3 :
      preferred2.length > 0 ? preferred2 :
      fallback3.length  > 0 ? fallback3  :
      fallback2;

    if (candidates.length === 0) return;

    const [r, c] = candidates[Math.floor(Math.random() * candidates.length)];
    GameState.grid[r][c] = WILD;
    GameState.wildCount++;

    // DOM を更新
    const el = UIManager.blockEl(r, c);
    if (el) {
      el.dataset.color = WILD;
      el.classList.add('wild', 'wild-flash');
      if (!el.querySelector('.wild-star')) {
        const star = document.createElement('span');
        star.className = 'wild-star';
        star.textContent = '★';
        el.appendChild(star);
      }
      el.addEventListener('animationend', () => el.classList.remove('wild-flash'), { once: true });
    }
  },

  // ワイルドが消去されたときの wildCount 減算
  onRemove(cells) {
    const removed = cells.filter(([r, c]) => GameState.grid[r][c] === WILD).length;
    GameState.wildCount = Math.max(0, GameState.wildCount - removed);
  },
};

/* ============================================================
   HintManager — 無操作ヒント表示
   ============================================================ */
const HintManager = {
  IDLE_SEC: 5,          // 無操作判定秒数（固定）
  _timer:   null,       // setTimeout ID
  _cells:   null,       // 表示中の候補座標 [row,col][] | null

  // ゲーム開始時に呼ぶ（タイマーをセット）
  start() {
    if (!StorageManager.getHint()) return;
    this._schedule();
  },

  // 操作発生時: reset=true → 解除＋タイマー再セット / false → 解除のみ
  cancel(reset) {
    this._clearTimer();
    this._hideHint();
    if (reset && StorageManager.getHint()) this._schedule();
  },

  _schedule() {
    this._clearTimer();
    this._timer = setTimeout(() => this._fire(), this.IDLE_SEC * 1000);
  },

  _clearTimer() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  },

  _fire() {
    // アニメーション中・ゲーム停止中は発火しない（タイマー再セットもしない）
    if (Game._animating || !GameState.running) return;
    const candidate = this._findCandidate();
    if (!candidate) return;
    this._cells = candidate;
    this._applyHint();
  },

  // ヒントをDOMに適用（座標ベースなのでbuildBoard後も再適用可能）
  _applyHint() {
    if (!this._cells) return;
    this._cells.forEach(([r, c]) => {
      const el = UIManager.blockEl(r, c);
      if (el) el.classList.add('hint');
    });
  },

  _hideHint() {
    if (!this._cells) return;
    this._cells.forEach(([r, c]) => {
      const el = UIManager.blockEl(r, c);
      if (el) el.classList.remove('hint');
    });
    this._cells = null;
  },

  // グリッドが外部要因（WC出現等）で変化したとき呼ぶ
  // 表示中なら候補を再探索して再表示。タイマーはそのまま継続。
  refreshHint() {
    if (!this._cells) return;      // 表示中でなければ何もしない
    this._hideHint();              // 古い候補のクラスを除去
    const candidate = this._findCandidate();
    if (!candidate) return;
    this._cells = candidate;
    this._applyHint();
  },

  // ランダムな消去可能候補チェーンを1件返す（ChainManagerの色判定ロジックに準拠）
  // 戻り値: [row,col][] (3個以上) | null
  _findCandidate() {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    const rows = GameState.rows, cols = GameState.cols;
    const groups = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const startColor = GameState.grid[r][c];
        if (!startColor || startColor === WILD) continue; // WC単体では開始不可

        // ChainManagerのtryAdd/reachableSetと同一ルールでBFS
        const visited = new Set([`${r},${c}`]);
        const queue = [{ r, c, tailColor: startColor, tailIsWild: false }];
        const cells = [[r, c]];
        let normalCount = 1;

        while (queue.length) {
          const { r: cr, c: cc, tailColor, tailIsWild } = queue.shift();
          for (const [dr, dc] of dirs) {
            const nr = cr + dr, nc = cc + dc;
            const key = `${nr},${nc}`;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (visited.has(key)) continue;
            const nColor = GameState.grid[nr][nc];
            if (!nColor) continue;
            // 進める条件: WC、末尾がWCなら任意通常色、それ以外は同色のみ
            if (nColor !== WILD && !tailIsWild && nColor !== tailColor) continue;
            visited.add(key);
            cells.push([nr, nc]);
            const nextTailIsWild = nColor === WILD;
            const nextTailColor  = nColor === WILD ? tailColor : nColor;
            if (nColor !== WILD) normalCount++;
            queue.push({ r: nr, c: nc, tailColor: nextTailColor, tailIsWild: nextTailIsWild });
          }
        }

        if (normalCount >= 3) groups.push(cells);
      }
    }

    if (groups.length === 0) return null;
    return groups[Math.floor(Math.random() * groups.length)];
  },
};

/* ============================================================
   TimerManager
   ============================================================ */
const TimerManager = {
  _id: null,
  start(onTick, onEnd) {
    this.stop();
    this._id = setInterval(() => {
      GameState.timeLeft--;
      onTick(GameState.timeLeft);
      if (GameState.timeLeft <= 0) { this.stop(); onEnd(); }
    }, 1000);
  },
  stop() { if (this._id) { clearInterval(this._id); this._id = null; } },
};

/* ============================================================
   UIManager
   ============================================================ */
const UIManager = {
  board:          document.getElementById('game-board'),
  scoreEl:        document.getElementById('score-display'),
  comboEl:        document.getElementById('combo-display'),
  timerEl:        document.getElementById('timer-display'),
  bestEl:         document.getElementById('best-display'),
  chainDots:      document.getElementById('chain-dots'),
  chainLabel:     document.getElementById('chain-label'),
  chainBar:       document.getElementById('chain-bar'),
  manualShuffleBtn: document.getElementById('manual-shuffle-btn'),
  scorePop:       document.getElementById('score-pop'),
  comboPop:       document.getElementById('combo-pop'),
  overlayStart:   document.getElementById('overlay-start'),
  overlayResult:  document.getElementById('overlay-result'),
  resultTitle:    document.getElementById('result-title'),
  resultScore:    document.getElementById('result-score'),
  resultBest:     document.getElementById('result-best'),
  resultCombo:    document.getElementById('result-combo'),
  resultDiffBadge:document.getElementById('result-diff-badge'),
  newRecordBadge: document.getElementById('new-record-badge'),
  timerHud:       document.getElementById('hud-timer'),
  comboHud:       document.getElementById('hud-combo'),

  buildBoard(onBlockClick) {
    this.board.innerHTML = '';
    for (let r = 0; r < GameState.rows; r++) {
      for (let c = 0; c < GameState.cols; c++) {
        const el = this._makeBlock(GameState.grid[r][c], r, c);
        this.board.appendChild(el);
      }
    }
    calcAndSetBlockSize(GameState.cols, GameState.rows);
    this.board.style.setProperty('--cols', GameState.cols);
    // ドラッグ／スワイプ選択はボード全体で管理（Game.initDragHandlers で設定）
  },

  _makeBlock(color, row, col) {
    const el = document.createElement('div');
    el.className = 'block' + (color === WILD ? ' wild' : '');
    el.dataset.color = color;
    el.dataset.row = row;
    el.dataset.col = col;
    el.setAttribute('role', 'gridcell');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', `${color === WILD ? 'ワイルド' : color} ブロック (行${row+1}, 列${col+1})`);
    if (color === WILD) {
      const star = document.createElement('span');
      star.className = 'wild-star';
      star.textContent = '★';
      el.appendChild(star);
    }
    return el;
  },

  blockEl(row, col) {
    return this.board.querySelector(`.block[data-row="${row}"][data-col="${col}"]`);
  },

  updateSelection(selectedSet, reachableSet) {
    this.board.querySelectorAll('.block').forEach(el => {
      el.classList.remove('selected', 'reachable');
      el.querySelector('.chain-num')?.remove();
    });
    ChainManager.chain.forEach(({ row, col }, idx) => {
      const el = this.blockEl(row, col);
      if (!el) return;
      el.classList.add('selected');
      const num = document.createElement('span');
      num.className = 'chain-num';
      num.textContent = idx + 1;
      el.appendChild(num);
    });
    reachableSet.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      const el = this.blockEl(r, c);
      if (el && !selectedSet.has(key)) el.classList.add('reachable');
    });
  },

  updateChainBar(chain, color, isValid) {
    this.chainDots.innerHTML = '';
    if (chain.length === 0) {
      this.chainBar.classList.remove('has-chain', 'valid-chain');
      this.chainLabel.textContent = 'ブロックをタップして繋げよう！';
      return;
    }
    chain.forEach(() => {
      const dot = document.createElement('div');
      dot.className = 'chain-dot';
      dot.style.background = `var(--color-${color})`;
      dot.style.boxShadow  = `0 0 6px var(--glow-${color})`;
      this.chainDots.appendChild(dot);
    });
    this.chainBar.classList.add('has-chain');
    if (isValid) {
      this.chainBar.classList.add('valid-chain');
      this.chainLabel.textContent = `${chain.length}個 — 先頭をタップして消去！`;
    } else {
      this.chainBar.classList.remove('valid-chain');
      this.chainLabel.textContent = `${chain.length}個選択中… あと${Math.max(0, 3 - chain.length)}個必要`;
    }
  },

  // 手動シャッフルボタンの活性状態を更新
  // running: ゲーム中か / timeLeft: 残り時間
  updateManualShuffleBtn(running, timeLeft) {
    const btn = this.manualShuffleBtn;
    if (!btn) return;
    const disabled = !running || timeLeft <= MANUAL_SHUFFLE_PENALTY;
    btn.disabled = disabled;
  },

  updateScore(score, best) {
    this.scoreEl.textContent = score;
    this.bestEl.textContent  = best;
  },

  updateCombo(combo) {
    this.comboEl.textContent = combo;
    this.comboHud.classList.remove('active');
    void this.comboHud.offsetWidth;
    if (combo > 0) this.comboHud.classList.add('active');
  },

  updateTimer(t, totalTime) {
    this.timerEl.textContent = t;
    this.timerHud.classList.toggle('warning', t <= Math.floor(totalTime * 0.33) && t > 10);
    this.timerHud.classList.toggle('danger',  t <= 10);
  },

  showScorePop(pts, row, col) {
    const el = this.scorePop;
    const boardRect = this.board.getBoundingClientRect();
    const blockSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--block-size')) || 60;
    const gap = 4, pad = 8;
    const x = boardRect.left + pad + col * (blockSize + gap) + blockSize / 2;
    const y = boardRect.top  + pad + row * (blockSize + gap);
    el.textContent = `+${pts}`;
    el.style.left = `${x - 20}px`;
    el.style.top  = `${y - 10}px`;
    el.classList.remove('animate');
    void el.offsetWidth;
    el.classList.add('animate');
  },

  showComboPop(combo, row, col) {
    if (combo < 2) return;
    const el = this.comboPop;
    const boardRect = this.board.getBoundingClientRect();
    const blockSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--block-size')) || 60;
    const gap = 4, pad = 8;
    const x = boardRect.left + pad + col * (blockSize + gap) + blockSize / 2;
    const y = boardRect.top  + pad + row * (blockSize + gap) - 30;

    // コンボ数に応じた色
    const colors = ['#FFD600','#FF9500','#FF3B5C','#C04DFF'];
    const c = colors[Math.min(combo - 2, colors.length - 1)];
    el.textContent = `${combo} COMBO!`;
    el.style.color = c;
    el.style.left  = `${x - 40}px`;
    el.style.top   = `${y}px`;
    el.classList.remove('animate');
    void el.offsetWidth;
    el.classList.add('animate');
  },

  async animateRemove(cells) {
    const els = cells.map(([r, c]) => this.blockEl(r, c)).filter(Boolean);
    els.forEach(el => el.classList.add('removing'));
    await delay(260);
  },

  async animateDrop(onBlockClick) {
    const oldEls = [...this.board.children];
    oldEls.forEach(el => el.classList.add('inactive'));
    await delay(50);
    this.buildBoard(onBlockClick);
    const blocks = this.board.querySelectorAll('.block');
    blocks.forEach((el, i) => {
      el.style.animationDelay = `${(i % GameState.cols) * 20}ms`;
      el.classList.add('spawning');
    });
    await delay(320);
    blocks.forEach(el => { el.classList.remove('spawning'); el.style.animationDelay = ''; });
  },

  setBlocksActive(active) {
    this.board.querySelectorAll('.block').forEach(el => el.classList.toggle('inactive', !active));
  },

  showStart() {
    this.overlayStart.classList.add('active');
    this.overlayResult.classList.remove('active');
  },
  hideStart() { this.overlayStart.classList.remove('active'); },

  // ── シャッフル通知バナー ───────────────────────────────
  showShuffleBanner() {
    let banner = document.getElementById('shuffle-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'shuffle-banner';
      banner.setAttribute('aria-live', 'polite');
      document.getElementById('app').appendChild(banner);
    }
    banner.textContent = '🔀 SHUFFLE!';
    banner.classList.remove('banner-show');
    void banner.offsetWidth;
    banner.classList.add('banner-show');
  },

  showResult(score, best, bestCombo, diff, isNewRecord, rankPos) {
    this.resultScore.textContent = score;
    this.resultBest.textContent  = best;
    this.resultCombo.textContent = bestCombo;
    this.resultTitle.textContent = isNewRecord ? 'NEW RECORD!!' : 'GAME OVER';
    this.resultTitle.style.color = isNewRecord ? 'var(--color-yellow)' : '';
    this.resultDiffBadge.textContent = DIFFICULTY[diff].label;
    this.newRecordBadge.classList.toggle('hidden', !isNewRecord);
    // ランクイン通知
    const rankInBadge = document.getElementById('rank-in-badge');
    if (rankPos >= 0) {
      rankInBadge.textContent = `🏆 RANK ${rankPos + 1} IN !`;
      rankInBadge.classList.remove('hidden');
    } else {
      rankInBadge.classList.add('hidden');
    }
    this.overlayResult.classList.add('active');
  },
  hideResult() { this.overlayResult.classList.remove('active'); },

  // ── カウントダウン ──────────────────────────────────────
  showCountdown(label, isGo) {
    const el = document.getElementById('countdown-display');
    // 一度クラスを外してアニメーションをリセット
    el.classList.remove('countdown-animate', 'countdown-go');
    el.textContent = label;
    // reflow を挟んでアニメーションを再トリガー
    void el.offsetWidth;
    el.classList.add('countdown-animate');
    if (isGo) el.classList.add('countdown-go');
  },
  hideCountdown() {
    const el = document.getElementById('countdown-display');
    el.classList.remove('countdown-animate', 'countdown-go');
    el.textContent = '';
  },

  // ── ランキング画面 ──────────────────────────────────────
  _rankingFrom: null, // 'title' | 'result'

  showRanking(diff, from = 'title') {
    this._rankingFrom = from;
    this._renderRanking(diff);
    document.getElementById('overlay-ranking').classList.add('active');
  },
  hideRanking() {
    document.getElementById('overlay-ranking').classList.remove('active');
  },
  _renderRanking(diff) {
    const list = StorageManager.getRanking(diff);
    const container = document.getElementById('ranking-list');
    container.innerHTML = '';

    // ヘッダー行
    const header = document.createElement('div');
    header.className = 'ranking-row-header';
    header.innerHTML = '<span>#</span><span>PLAYER / DATE</span><span style="text-align:right">SCORE</span><span style="text-align:right">COMBO</span>';
    container.appendChild(header);

    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ranking-empty';
      empty.textContent = 'NO RECORDS YET';
      container.appendChild(empty);
      return;
    }

    list.forEach((entry, i) => {
      const row = document.createElement('div');
      row.className = `ranking-row rank-${i + 1}`;
      row.innerHTML = `
        <span class="ranking-rank">${i + 1}</span>
        <div class="ranking-player">
          <span class="ranking-name">${this._esc(entry.name)}</span>
          <span class="ranking-date">${this._esc(entry.date)}</span>
        </div>
        <span class="ranking-score">${entry.score.toLocaleString()}</span>
        <span class="ranking-combo">x${entry.bestCombo}</span>
      `;
      container.appendChild(row);
    });
  },
  _esc(str) {
    return String(str).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
    );
  },

  // ── 設定画面 ────────────────────────────────────────────
  showSettings() {
    const input = document.getElementById('settings-name-input');
    input.value = StorageManager.getPlayerName();
    document.getElementById('settings-name-error').textContent = '';
    document.getElementById('overlay-settings').classList.add('active');
    setTimeout(() => input.focus(), 100);
  },
  hideSettings() {
    document.getElementById('overlay-settings').classList.remove('active');
  },

  // ── セットアップ（初回起動）画面 ────────────────────────
  showSetup() {
    document.getElementById('setup-name-error').textContent = '';
    document.getElementById('setup-name-input').value = '';
    document.getElementById('overlay-setup').classList.add('active');
    setTimeout(() => document.getElementById('setup-name-input').focus(), 100);
  },
  hideSetup() {
    document.getElementById('overlay-setup').classList.remove('active');
  },

  // タイトル画面のプレイヤー名を更新
  updatePlayerName() {
    const el = document.getElementById('title-player-name');
    if (el) el.textContent = PlayerManager.getDisplayName();
  },

  // ── ヒント表示トグル ─────────────────────────────────────
  updateHintToggle() {
    const toggle = document.getElementById('hint-toggle');
    if (toggle) toggle.checked = StorageManager.getHint();
  },
};

/* ============================================================
   GridManager
   ============================================================ */
const GridManager = {
  getConfig() {
    return { cols: GRID_COLS, rows: GRID_ROWS };
  },
};

/* ============================================================
   ユーティリティ
   ============================================================ */
function randomColor(colors) {
  return colors[Math.floor(Math.random() * colors.length)];
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function calcAndSetBlockSize(cols, rows) {
  const header   = document.getElementById('header');
  const chainBar = document.getElementById('chain-bar');
  const footer   = document.getElementById('footer');
  const boardWrap= document.getElementById('board-wrap');

  const headerH  = header   ? header.getBoundingClientRect().height  : 60;
  const chainH   = chainBar ? chainBar.getBoundingClientRect().height : 44;
  const footerH  = footer   ? footer.getBoundingClientRect().height   : 66;
  const mainPad  = 32;
  const boardPad = 18;
  const gapPx    = 4;

  const availH = window.innerHeight - headerH - chainH - footerH - mainPad - boardPad;
  const availW = (boardWrap ? boardWrap.getBoundingClientRect().width : window.innerWidth) - boardPad;

  const fromH = (availH - gapPx * (rows - 1)) / rows;
  const fromW = (availW - gapPx * (cols - 1)) / cols;
  const size = Math.max(36, Math.min(76, Math.floor(Math.min(fromH, fromW))));

  document.documentElement.style.setProperty('--block-size', `${size}px`);
  document.documentElement.style.setProperty('--cols', cols);
  document.documentElement.style.setProperty('--rows', rows);
}

/* ============================================================
   Game Controller
   ============================================================ */
const Game = {
  _animating: false,
  _dragging:  false,   // ドラッグ中フラグ
  _onBlockClick: null, // 現在のクリックハンドラ参照

  init() {
    GameState.best = StorageManager.getBest(currentDiff);
    UIManager.bestEl.textContent = GameState.best;

    // 難易度ボタン
    document.querySelectorAll('.btn-diff').forEach(btn => {
      btn.addEventListener('click', () => {
        currentDiff = btn.dataset.diff;
        document.querySelectorAll('.btn-diff').forEach(b => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        document.getElementById('diff-desc').textContent = DIFFICULTY[currentDiff].desc;
        GameState.best = StorageManager.getBest(currentDiff);
        UIManager.bestEl.textContent = GameState.best;
      });
    });

    // ゲーム操作ボタン
    document.getElementById('start-main-btn').addEventListener('click', () => this.start());
    document.getElementById('retry-btn').addEventListener('click',      () => this.start());
    document.getElementById('title-btn').addEventListener('click',      () => this.goTitle());
    document.getElementById('result-ranking-btn').addEventListener('click', () => {
      UIManager.hideResult();
      UIManager.showRanking(currentDiff, 'result');
    });
    // ランキングボタン
    document.getElementById('ranking-btn').addEventListener('click', () => {
      UIManager.showRanking(currentDiff);
    });
    // 手動シャッフルボタン
    document.getElementById('manual-shuffle-btn').addEventListener('click', () => {
      if (!GameState.running || this._animating) return;
      if (GameState.timeLeft <= MANUAL_SHUFFLE_PENALTY) return;
      this._doManualShuffle();
    });

    document.getElementById('ranking-close-btn').addEventListener('click', () => {
      UIManager.hideRanking();
      if (UIManager._rankingFrom === 'result') {
        UIManager.showResult(
          GameState.score, GameState.best, GameState.bestCombo,
          currentDiff,
          GameState.score > 0 && GameState.score === GameState.best,
          Game._lastRankPos
        );
      }
    });
    document.querySelectorAll('.btn-diff-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.btn-diff-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        UIManager._renderRanking(tab.dataset.diff);
      });
    });

    // 設定ボタン
    document.getElementById('settings-btn').addEventListener('click', () => {
      UIManager.showSettings();
    });
    document.getElementById('settings-close-btn').addEventListener('click', () => {
      UIManager.hideSettings();
    });
    document.getElementById('settings-save-btn').addEventListener('click', () => {
      this._saveName('settings-name-input', 'settings-name-error', () => {
        UIManager.hideSettings();
        UIManager.updatePlayerName();
      });
    });

    // ヒントトグル
    const hintToggle = document.getElementById('hint-toggle');
    if (hintToggle) {
      hintToggle.checked = StorageManager.getHint();
      hintToggle.addEventListener('change', () => {
        StorageManager.setHint(hintToggle.checked);
      });
    }

    // 初回セットアップ
    document.getElementById('setup-confirm-btn').addEventListener('click', () => {
      this._saveName('setup-name-input', 'setup-name-error', () => {
        StorageManager.setInitialized();
        UIManager.hideSetup();
        UIManager.updatePlayerName();
        UIManager.showStart();
      });
    });

    // キーボード
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !GameState.running) this.start();
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!GameState.running) this._buildPreview();
        else calcAndSetBlockSize(GameState.cols, GameState.rows);
      }, 200);
    });

    // バックグラウンド時にヒントタイマーをリセット（復帰時に意図しない即時発火を防ぐ）
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        HintManager.cancel(false);
      } else if (GameState.running && !Game._animating) {
        HintManager.start();
      }
    });

    this._initDragHandlers();
    this._buildPreview();

    // 初回起動判定
    if (!StorageManager.isInitialized()) {
      UIManager.showSetup();
    } else {
      UIManager.updatePlayerName();
      UIManager.showStart();
    }
  },

  // 名前入力の保存共通処理
  _saveName(inputId, errorId, onSuccess) {
    const input = document.getElementById(inputId);
    const errorEl = document.getElementById(errorId);
    const normalized = PlayerManager.normalize(input.value);
    const err = PlayerManager.validate(normalized);
    if (err) {
      errorEl.textContent = err;
      return;
    }
    errorEl.textContent = '';
    StorageManager.setPlayerName(normalized);
    onSuccess();
  },

  _buildPreview() {
    const { cols, rows } = GridManager.getConfig();
    GameState.init(cols, rows, currentDiff);
    UIManager.buildBoard(() => {});
    UIManager.setBlocksActive(false);
    UIManager.updateScore(0, StorageManager.getBest(currentDiff));
    UIManager.updateTimer(DIFFICULTY[currentDiff].time, DIFFICULTY[currentDiff].time);
    UIManager.updateCombo(0);
  },

  start() {
    HintManager.cancel(false); // 前回ゲームの残存タイマー・候補をリセット
    UIManager.hideStart();
    UIManager.hideResult();
    SoundManager._getCtx(); // AudioContext を早期初期化

    const { cols, rows } = GridManager.getConfig();
    GameState.init(cols, rows, currentDiff);
    GameState.best = StorageManager.getBest(currentDiff);
    ChainManager.reset();

    this._onBlockClick = (r, c) => this.onBlockClick(r, c);
    UIManager.buildBoard(this._onBlockClick);
    UIManager.updateScore(0, GameState.best);
    UIManager.updateTimer(DIFFICULTY[currentDiff].time, DIFFICULTY[currentDiff].time);
    UIManager.updateCombo(0);
    UIManager.updateChainBar([], null, false);
    // カウントダウン中はブロック操作を無効化
    UIManager.setBlocksActive(false);
    GameState.running = false;
    this._animating = false;

    // カウントダウン開始（終了後にゲームを起動）
    this._startCountdown();
  },

  // 3→2→1→GO! カウントダウン後にゲーム本体を起動
  _startCountdown() {
    const steps = ['3', '2', '1', 'GO!'];
    let i = 0;

    const tick = () => {
      const label = steps[i];
      const isGo  = label === 'GO!';

      // サウンド
      if (isGo) SoundManager.playCountGo();
      else      SoundManager.playCountBeep();

      // UI 表示
      UIManager.showCountdown(label, isGo);

      i++;
      if (i < steps.length) {
        setTimeout(tick, 1000);
      } else {
        // GO! 表示と同時にゲーム開始、アニメーションは背後で継続
        this._beginGame();
      }
    };

    tick();
  },

  // カウントダウン完了後のゲーム本体起動
  _beginGame() {
    UIManager.setBlocksActive(true);
    GameState.running = true;
    UIManager.updateManualShuffleBtn(true, GameState.timeLeft);
    HintManager.start(); // 無操作ヒントタイマー開始

    TimerManager.start(
      (t) => {
        UIManager.updateTimer(t, DIFFICULTY[currentDiff].time);
        UIManager.updateManualShuffleBtn(true, t);
        if (t === 10 || t === 5) SoundManager.playTimerWarning();
        WildcardManager.onTick(t, currentDiff);
      },
      () => this.endGame()
    );
  },

  onBlockClick(row, col) {
    if (!GameState.running || this._animating) return;
    const result = ChainManager.tryAdd(row, col);

    if (result === 'confirm') { HintManager.cancel(false); this.commitChain(); return; }
    if (result === 'cancel')  { HintManager.cancel(true);  this.cancelChain(); return; }

    if (result === 'added') {
      HintManager.cancel(true); // 操作あり：解除＋タイマー再セット
      SoundManager.playSelect(ChainManager.chain.length);
      UIManager.updateSelection(ChainManager.selectedSet(), ChainManager.reachableSet());
      UIManager.updateChainBar(ChainManager.chain, ChainManager.color, ChainManager.chain.length >= 3);
    }
  },

  // ドラッグ移動中のブロック追加（confirm/cancelは判定しない）
  onBlockDrag(row, col) {
    if (!GameState.running || this._animating) return;
    const result = ChainManager.tryAdd(row, col);
    if (result === 'added') {
      HintManager.cancel(true); // 操作あり：解除＋タイマー再セット
      SoundManager.playSelect(ChainManager.chain.length);
      UIManager.updateSelection(ChainManager.selectedSet(), ChainManager.reachableSet());
      UIManager.updateChainBar(ChainManager.chain, ChainManager.color, ChainManager.normalCount() >= 3);
    }
  },

  async commitChain() {
    if (this._animating) return;
    // 通常ブロックが3個未満なら確定不可
    if (ChainManager.normalCount() < 3) { this.cancelChain(); return; }
    this._animating = true;
    GameState.running = false;

    const cells = ChainManager.chain.map(b => [b.row, b.col]);
    const n     = cells.length;
    WildcardManager.onRemove(cells); // ワイルド消去前に wildCount 更新
    const { pts, combo } = GameState.addScore(n, GameState.timeLeft, currentDiff);

    // 効果音
    SoundManager.playRemove(n, combo);
    if (combo >= 2) SoundManager.playCombo(combo);

    // ポップ表示
    const [pr, pc] = cells[0];
    UIManager.showScorePop(pts, pr, pc);
    UIManager.showComboPop(combo, pr, pc);
    UIManager.updateCombo(combo);
    UIManager.updateChainBar([], null, false);

    await UIManager.animateRemove(cells);
    GameState.removeBlocks(cells, currentDiff);
    ChainManager.reset();
    this._onBlockClick = (r, c) => this.onBlockClick(r, c);
    await UIManager.animateDrop(this._onBlockClick);

    UIManager.updateScore(GameState.score, GameState.best);
    UIManager.updateSelection(new Set(), new Set());

    // ── 詰まり検出（タイムアップ後は実行しない）────────────
    if (GameState.timeLeft > 0 && !GameState.hasValidMove()) {
      await this._doShuffle();
      HintManager.cancel(true); // シャッフルあり：完了後タイマー再セット
    } else {
      HintManager.cancel(true); // シャッフルなし：補充完了後タイマー再セット
    }

    this._animating = false;
    GameState.running = GameState.timeLeft > 0;
  },

  // シャッフル演出
  async _doShuffle() {
    UIManager.showShuffleBanner();
    SoundManager.playCancel(); // シャッフル音（簡易）
    const colors = DIFFICULTY[currentDiff].colors;
    // 最大3回試行してvalidな配置になるまでシャッフル
    for (let attempt = 0; attempt < 3; attempt++) {
      GameState.shuffle(colors);
      if (GameState.hasValidMove()) break;
    }
    this._onBlockClick = (r, c) => this.onBlockClick(r, c);
    await UIManager.animateDrop(this._onBlockClick);
  },

  // 手動シャッフル（タイムペナルティ -10秒）
  async _doManualShuffle() {
    this._animating = true;
    ChainManager.reset();
    UIManager.updateSelection(new Set(), new Set());
    UIManager.updateChainBar([], null, false);

    // P1修正①: コンボリセット（cancelChain と同等の処理）
    GameState.resetCombo();
    UIManager.updateCombo(0);

    // タイムペナルティ適用
    GameState.timeLeft = Math.max(0, GameState.timeLeft - MANUAL_SHUFFLE_PENALTY);
    UIManager.updateTimer(GameState.timeLeft, DIFFICULTY[currentDiff].time);
    UIManager.updateManualShuffleBtn(true, GameState.timeLeft);

    // P1修正②: ペナルティで時間切れになった場合はゲームオーバーに委ねる
    if (GameState.timeLeft <= 0) {
      TimerManager.stop();
      this._animating = false;
      this.endGame(); // endGame冒頭でHintManager.cancel(false)が呼ばれる
      return;
    }

    // シャッフル実行
    await this._doShuffle();

    // P1修正②: シャッフル中にendGameが呼ばれていた場合は_animatingを戻さない
    if (!GameState.running) return;
    HintManager.cancel(true); // 手動シャッフル完了後タイマー再セット
    this._animating = false;
  },

  cancelChain() {
    if (!GameState.running) return;
    HintManager.cancel(true); // キャンセルも操作とみなしタイマー再セット
    SoundManager.playCancel();
    GameState.resetCombo();
    UIManager.updateCombo(0);
    ChainManager.reset();
    UIManager.updateSelection(new Set(), new Set());
    UIManager.updateChainBar([], null, false);
  },

  // ── ドラッグ／スワイプ選択ハンドラ初期化 ───────────────────
  // ボード全体にイベントを1度だけ設定する。
  // 個別ブロックへのイベントは不要（elementFromPoint で特定）。
  _initDragHandlers() {
    const board = UIManager.board;

    // 座標からブロック要素を取得するユーティリティ
    const blockAt = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el && el.classList.contains('block') ? el : null;
    };

    // ドラッグ開始（共通処理）
    const onStart = (x, y) => {
      document.body.classList.add('dragging');
      if (!GameState.running || this._animating) return;
      const el = blockAt(x, y);
      if (!el) return;
      this._dragging = true;
      const r = parseInt(el.dataset.row);
      const c = parseInt(el.dataset.col);
      this.onBlockClick(r, c);
    };

    // ドラッグ移動中（共通処理）
    const onMove = (x, y) => {
      if (!this._dragging || !GameState.running || this._animating) return;
      const el = blockAt(x, y);
      if (!el) return;
      const r = parseInt(el.dataset.row);
      const c = parseInt(el.dataset.col);
      // 現在のチェーン末尾と同じなら無視（連続イベント対策）
      const tail = ChainManager.chain[ChainManager.chain.length - 1];
      if (tail && tail.row === r && tail.col === c) return;
      this.onBlockDrag(r, c);
    };

    // ドラッグ終了（共通処理）
    const onEnd = () => {
      if (!this._dragging) return;
      this._dragging = false;
      document.body.classList.remove('dragging');
      if (!GameState.running || this._animating) return;
      // 3個以上で自動確定、未満は自動キャンセル
      if (ChainManager.chain.length >= 3) {
        this.commitChain();
      } else if (ChainManager.chain.length > 0) {
        this.cancelChain();
      }
    };

    // ── マウスイベント ──────────────────────────────────────
    board.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onStart(e.clientX, e.clientY);
    });
    document.addEventListener('mousemove', (e) => {
      if (this._dragging) onMove(e.clientX, e.clientY);
    });
    document.addEventListener('mouseup', () => onEnd());

    // ── タッチイベント ──────────────────────────────────────
    board.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      onStart(t.clientX, t.clientY);
    }, { passive: false });

    board.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      onMove(t.clientX, t.clientY);
    }, { passive: false });

    board.addEventListener('touchend', (e) => {
      e.preventDefault();
      onEnd();
    }, { passive: false });
  },

  goTitle() {
    HintManager.cancel(false); // タイトル遷移時はタイマー停止のみ
    TimerManager.stop();
    GameState.running = false;
    ChainManager.reset();
    UIManager.hideResult();
    this._initDragHandlers();
    this._buildPreview();
    UIManager.showStart();
  },

  endGame() {
    HintManager.cancel(false); // ゲーム終了時はタイマー停止のみ
    GameState.running = false;
    UIManager.updateManualShuffleBtn(false, 0);
    TimerManager.stop();
    this._animating = false;
    UIManager.setBlocksActive(false);

    const isNewRecord = GameState.score > 0 && GameState.score >= GameState.best;
    if (isNewRecord) StorageManager.setBest(currentDiff, GameState.score);

    // ランキング登録（スコアが0より大きい場合のみ）
    let rankPos = -1;
    if (GameState.score > 0) {
      const playerName = PlayerManager.getDisplayName();
      rankPos = RankingManager.addEntry(
        currentDiff, GameState.score, GameState.bestCombo, playerName
      );
    }
    Game._lastRankPos = rankPos; // ランキング画面から結果画面に戻るために保持

    if (isNewRecord) SoundManager.playNewRecord();
    else             SoundManager.playGameOver();

    setTimeout(() => {
      UIManager.showResult(
        GameState.score, GameState.best, GameState.bestCombo,
        currentDiff, isNewRecord, rankPos
      );
    }, 400);
  },
};

/* ============================================================
   起動
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => Game.init());
