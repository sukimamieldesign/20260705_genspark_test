/* =========================================================
 * app.js - あみだくじ本体
 *  - 設定画面（本数 2〜20、賞のカスタム設定、参加者名）
 *  - あみだ生成（横線ランダム、賞はシャッフル配置）
 *  - 一人ずつ選んでドラマチックにたどるアニメーション
 *  - 結果まとめ表示
 * ========================================================= */

"use strict";

/* ---------- 定数 ---------- */
const EFFECT_LABELS = {
  jackpot: "🏆 大当たり（豪華宝箱）",
  win: "🎉 あたり（紙吹雪）",
  normal: "😊 普通",
  lose: "😞 ハズレ（がっかり）",
  biglose: "💣 大外れ（爆発）",
};
const SPEED = { slow: 90, normal: 55, fast: 25 }; // px/frame相当の逆：1セグメントms係数
const DENSITY = { low: 0.55, mid: 1.0, high: 1.6 };

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const setupScreen = $("setup-screen");
const gameScreen = $("game-screen");
const lineCountInput = $("line-count");
const lineCountLabel = $("line-count-label");
const prizeTbody = $("prize-tbody");
const restCountEl = $("rest-count");
const prizeError = $("prize-error");
const playerNamesDiv = $("player-names");
const canvas = $("amida-canvas");
const cx = canvas.getContext("2d");
const statusEl = $("game-status");
const summaryPanel = $("summary-panel");
const summaryTbody = document.querySelector("#summary-table tbody");
const modal = $("result-modal");
const effectLayer = $("effect-layer");

/* ---------- 状態 ---------- */
let game = null; // { n, bridges, prizes[], players[], results[], done[], anim }
let animating = false;

/* =========================================================
 * 設定画面
 * ======================================================= */
function addPrizeRow(name = "", count = 1, effect = "win") {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="p-name" maxlength="10" placeholder="例：大吉" value="${name}"></td>
    <td><input type="number" class="p-count" min="1" max="20" value="${count}"></td>
    <td><select class="p-effect">${Object.entries(EFFECT_LABELS)
      .map(([v, l]) => `<option value="${v}" ${v === effect ? "selected" : ""}>${l}</option>`)
      .join("")}</select></td>
    <td><button class="del-btn" title="削除">✕</button></td>`;
  tr.querySelector(".del-btn").onclick = () => { tr.remove(); refreshSetup(); };
  tr.querySelector(".p-count").oninput = refreshSetup;
  prizeTbody.appendChild(tr);
  refreshSetup();
}

function getPrizeRows() {
  return [...prizeTbody.querySelectorAll("tr")].map((tr) => ({
    name: tr.querySelector(".p-name").value.trim() || "あたり",
    count: Math.max(1, parseInt(tr.querySelector(".p-count").value, 10) || 1),
    effect: tr.querySelector(".p-effect").value,
  }));
}

function refreshSetup() {
  const n = parseInt(lineCountInput.value, 10);
  lineCountLabel.textContent = n + "本";
  const used = getPrizeRows().reduce((s, p) => s + p.count, 0);
  const rest = n - used;
  restCountEl.textContent = Math.max(0, rest);
  if (rest < 0) {
    prizeError.textContent = `⚠ 賞の合計が ${used} 本で、くじの本数 ${n} 本を超えています！`;
    prizeError.classList.remove("hidden");
  } else {
    prizeError.classList.add("hidden");
  }
  // 参加者名入力欄
  const current = [...playerNamesDiv.querySelectorAll("input")].map((i) => i.value);
  playerNamesDiv.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.maxLength = 10;
    inp.placeholder = `プレイヤー${i + 1}`;
    if (current[i]) inp.value = current[i];
    playerNamesDiv.appendChild(inp);
  }
}

lineCountInput.addEventListener("input", refreshSetup);
$("add-prize-btn").onclick = () => addPrizeRow();

/* 初期の賞（例：大吉1・中吉2・凶1） */
addPrizeRow("大吉", 1, "jackpot");
addPrizeRow("中吉", 2, "win");
addPrizeRow("凶", 1, "biglose");

/* =========================================================
 * あみだ生成
 * ======================================================= */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildGame() {
  const n = parseInt(lineCountInput.value, 10);
  const rows = getPrizeRows();
  const used = rows.reduce((s, p) => s + p.count, 0);
  if (used > n) { refreshSetup(); return null; }

  // 賞リスト（デフォルト賞で埋める → シャッフル）
  const defName = $("default-prize-name").value.trim() || "小吉";
  const defEffect = $("default-prize-effect").value;
  const prizes = [];
  rows.forEach((p) => { for (let i = 0; i < p.count; i++) prizes.push({ name: p.name, effect: p.effect }); });
  while (prizes.length < n) prizes.push({ name: defName, effect: defEffect });
  shuffle(prizes);

  // 横線生成：行ごとに隣接ペアからランダム選択（同じ行で隣接横線が重ならないように）
  const density = DENSITY[$("bridge-density").value];
  const rowCount = Math.max(8, Math.round(n * 1.6));
  const bridges = []; // {row, col} col=左側の縦線index
  for (let r = 0; r < rowCount; r++) {
    const cols = shuffle([...Array(n - 1).keys()]);
    const usedCols = new Set();
    const perRow = Math.max(1, Math.round((n - 1) * 0.35 * density * (0.6 + Math.random() * 0.8)));
    let placed = 0;
    for (const c of cols) {
      if (placed >= perRow) break;
      if (usedCols.has(c - 1) || usedCols.has(c) || usedCols.has(c + 1)) continue;
      usedCols.add(c);
      bridges.push({ row: r, col: c });
      placed++;
    }
  }
  // 全縦線に最低1本の横線が接続していることを保証
  for (let c = 0; c < n - 1; c++) {
    if (!bridges.some((b) => b.col === c || b.col === c - 1)) {
      bridges.push({ row: Math.floor(Math.random() * rowCount), col: c });
    }
  }

  const players = [...playerNamesDiv.querySelectorAll("input")].map(
    (inp, i) => inp.value.trim() || `プレイヤー${i + 1}`
  );

  // 経路と結果を事前計算
  const results = [];
  for (let start = 0; start < n; start++) {
    results.push(tracePath(start, bridges, rowCount));
  }

  return { n, rowCount, bridges, prizes, players, results, done: new Array(n).fill(false), revealedAll: false };
}

/** 経路計算：[{col,row}...] のポイント列と最終到達col */
function tracePath(startCol, bridges, rowCount) {
  const pts = [{ col: startCol, row: -1 }];
  let col = startCol;
  for (let r = 0; r < rowCount; r++) {
    const right = bridges.find((b) => b.row === r && b.col === col);
    const left = bridges.find((b) => b.row === r && b.col === col - 1);
    if (right) {
      pts.push({ col, row: r });
      col = col + 1;
      pts.push({ col, row: r });
    } else if (left) {
      pts.push({ col, row: r });
      col = col - 1;
      pts.push({ col, row: r });
    }
  }
  pts.push({ col, row: rowCount });
  return { path: pts, goal: col };
}

/* =========================================================
 * 描画
 * ======================================================= */
const M = { top: 70, bottom: 60, side: 40 };
let geo = null; // {colX(i), rowY(r), w, h}

function setupCanvas() {
  const n = game.n;
  const minGap = 52;
  const wrapW = $("canvas-wrap").clientWidth - 20;
  const w = Math.max(wrapW, M.side * 2 + minGap * (n - 1));
  const rowGap = 34;
  const h = M.top + M.bottom + rowGap * (game.rowCount + 1);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gap = (w - M.side * 2) / (n - 1);
  geo = {
    w, h,
    colX: (i) => M.side + gap * i,
    rowY: (r) => M.top + rowGap * (r + 1),
    topY: M.top,
    bottomY: h - M.bottom,
  };
}

function ptXY(p) {
  return {
    x: geo.colX(p.col),
    y: p.row < 0 ? geo.topY : p.row >= game.rowCount ? geo.bottomY : geo.rowY(p.row),
  };
}

const PATH_COLORS = ["#e53935", "#1e88e5", "#43a047", "#fb8c00", "#8e24aa", "#00acc1", "#d81b60", "#7cb342", "#5e35b1", "#f4511e"];

function draw(highlight = null) {
  cx.clearRect(0, 0, geo.w, geo.h);
  const n = game.n;

  // 縦線・横線
  cx.strokeStyle = "#8d6e63";
  cx.lineWidth = 3;
  cx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    cx.beginPath();
    cx.moveTo(geo.colX(i), geo.topY);
    cx.lineTo(geo.colX(i), geo.bottomY);
    cx.stroke();
  }
  for (const b of game.bridges) {
    cx.beginPath();
    cx.moveTo(geo.colX(b.col), geo.rowY(b.row));
    cx.lineTo(geo.colX(b.col + 1), geo.rowY(b.row));
    cx.stroke();
  }

  // 確定済みの経路
  for (let i = 0; i < n; i++) {
    if (game.done[i]) drawPath(game.results[i].path, PATH_COLORS[i % PATH_COLORS.length], 0.45);
  }
  // ハイライト経路（アニメ中の軌跡）
  if (highlight) drawPath(highlight.pts, highlight.color, 1, highlight.partial);

  // 上部：スタートボタン（番号 or 名前）
  for (let i = 0; i < n; i++) {
    const x = geo.colX(i);
    const isDone = game.done[i];
    cx.beginPath();
    cx.arc(x, geo.topY - 26, 18, 0, Math.PI * 2);
    cx.fillStyle = isDone ? "#bdbdbd" : PATH_COLORS[i % PATH_COLORS.length];
    cx.fill();
    cx.fillStyle = "#fff";
    cx.font = "bold 14px sans-serif";
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.fillText(String(i + 1), x, geo.topY - 26);
    // 名前（縦に短く）
    cx.fillStyle = isDone ? "#aaa" : "#5d4037";
    cx.font = "11px sans-serif";
    const nm = game.players[i].length > 5 ? game.players[i].slice(0, 5) + "…" : game.players[i];
    cx.fillText(nm, x, geo.topY - 52);
  }

  // 下部：ゴール（伏せ or 公開）
  for (let i = 0; i < n; i++) {
    const x = geo.colX(i);
    const y = geo.bottomY + 26;
    const owner = game.results.findIndex((r, pi) => r.goal === i && game.done[pi]);
    const show = game.revealedAll || owner >= 0;
    cx.fillStyle = show ? "#fff3e0" : "#795548";
    roundRect(x - 26, y - 14, 52, 28, 8);
    cx.fill();
    cx.strokeStyle = "#8d6e63";
    cx.lineWidth = 1.5;
    roundRect(x - 26, y - 14, 52, 28, 8);
    cx.stroke();
    cx.fillStyle = show ? "#5d4037" : "#fff";
    cx.font = show ? "bold 12px sans-serif" : "bold 14px sans-serif";
    const label = show ? game.prizes[i].name : "？";
    cx.fillText(label.length > 5 ? label.slice(0, 5) : label, x, y);
  }

  // アニメ中の玉
  if (highlight && highlight.ball) {
    const { x, y } = highlight.ball;
    const grad = cx.createRadialGradient(x, y, 2, x, y, 14);
    grad.addColorStop(0, "#fffde7");
    grad.addColorStop(0.5, highlight.color);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    cx.beginPath();
    cx.arc(x, y, 14, 0, Math.PI * 2);
    cx.fillStyle = grad;
    cx.fill();
    cx.beginPath();
    cx.arc(x, y, 7, 0, Math.PI * 2);
    cx.fillStyle = highlight.color;
    cx.fill();
  }
}

function roundRect(x, y, w, h, r) {
  cx.beginPath();
  cx.moveTo(x + r, y);
  cx.arcTo(x + w, y, x + w, y + h, r);
  cx.arcTo(x + w, y + h, x, y + h, r);
  cx.arcTo(x, y + h, x, y, r);
  cx.arcTo(x, y, x + w, y, r);
  cx.closePath();
}

function drawPath(pts, color, alpha = 1, partialLen = null) {
  cx.save();
  cx.globalAlpha = alpha;
  cx.strokeStyle = color;
  cx.lineWidth = 5;
  cx.lineCap = "round";
  cx.lineJoin = "round";
  cx.beginPath();
  let remaining = partialLen;
  let prev = ptXY(pts[0]);
  cx.moveTo(prev.x, prev.y);
  for (let i = 1; i < pts.length; i++) {
    const cur = ptXY(pts[i]);
    if (remaining == null) {
      cx.lineTo(cur.x, cur.y);
    } else {
      const seg = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      if (seg >= remaining) {
        const t = remaining / seg;
        cx.lineTo(prev.x + (cur.x - prev.x) * t, prev.y + (cur.y - prev.y) * t);
        break;
      }
      cx.lineTo(cur.x, cur.y);
      remaining -= seg;
    }
    prev = cur;
  }
  cx.stroke();
  cx.restore();
}

/* =========================================================
 * アニメーション（ドラマチック演出）
 * ======================================================= */
function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = ptXY(pts[i - 1]), b = ptXY(pts[i]);
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

function pointAt(pts, dist) {
  let remaining = dist;
  for (let i = 1; i < pts.length; i++) {
    const a = ptXY(pts[i - 1]), b = ptXY(pts[i]);
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg >= remaining) {
      const t = remaining / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, segIdx: i };
    }
    remaining -= seg;
  }
  const last = ptXY(pts[pts.length - 1]);
  return { x: last.x, y: last.y, segIdx: pts.length - 1 };
}

async function animatePlayer(idx) {
  animating = true;
  const res = game.results[idx];
  const color = PATH_COLORS[idx % PATH_COLORS.length];
  const total = pathLength(res.path);
  const speedMs = SPEED[$("anim-speed").value];
  const durMs = Math.max(1400, (total / 60) * speedMs); // 距離に応じた所要時間
  statusEl.textContent = `🎲 ${game.players[idx]} さんの運命は…！？`;

  let lastSeg = -1;
  const t0 = performance.now();
  await new Promise((resolve) => {
    function frame(now) {
      const t = Math.min(1, (now - t0) / durMs);
      // ease-in-out で緩急をつけてドラマチックに
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const dist = eased * total;
      const pos = pointAt(res.path, dist);
      if (pos.segIdx !== lastSeg) { Effects.tick(); lastSeg = pos.segIdx; }
      draw({ pts: res.path, color, partial: dist, ball: pos });
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });

  game.done[idx] = true;
  draw();
  await showResult(idx);
  animating = false;
  updateStatus();
}

/* 結果モーダル（ためて→ドン！） */
function showResult(idx) {
  return new Promise((resolve) => {
    const prize = game.prizes[game.results[idx].goal];
    const effect = prize.effect;
    modal.className = "modal"; // reset fx-class
    $("result-player").textContent = `${game.players[idx]} さんの結果`;
    $("result-drumroll").classList.remove("hidden");
    $("result-prize").classList.add("hidden");
    $("result-close").classList.add("hidden");
    effectLayer.innerHTML = "";
    modal.classList.remove("hidden");

    // ドラムロールでためる
    const waitMs = 1600;
    Effects.drumroll(waitMs / 1000);
    let dots = 0;
    const dotIv = setInterval(() => {
      dots = (dots + 1) % 4;
      $("result-drumroll").textContent = "結果は" + "・".repeat(dots + 1);
    }, 220);

    let cleanupFx = () => {};
    setTimeout(() => {
      clearInterval(dotIv);
      $("result-drumroll").classList.add("hidden");
      const prizeEl = $("result-prize");
      prizeEl.textContent = prize.name;
      prizeEl.classList.remove("hidden");
      modal.classList.add("fx-" + effect);
      cleanupFx = Effects.play(effect, effectLayer);
      $("result-close").classList.remove("hidden");
    }, waitMs);

    $("result-close").onclick = () => {
      cleanupFx();
      modal.classList.add("hidden");
      resolve();
    };
  });
}

function updateStatus() {
  const remaining = game.done.filter((d) => !d).length;
  statusEl.textContent = remaining === 0
    ? "🎊 全員終了！おつかれさまでした"
    : `残り ${remaining} 人｜上の番号をタップしてスタート`;
}

/* =========================================================
 * まとめ表示
 * ======================================================= */
function revealAll() {
  if (animating) return;
  game.revealedAll = true;
  game.done.fill(true);
  draw();
  summaryTbody.innerHTML = "";
  game.results.forEach((r, i) => {
    const prize = game.prizes[r.goal];
    const tr = document.createElement("tr");
    tr.className = "rank-" + prize.effect;
    const icon = { jackpot: "🏆", win: "🎉", normal: "😊", lose: "😞", biglose: "💣" }[prize.effect] || "";
    tr.innerHTML = `<td>${escapeHtml(game.players[i])}</td><td>${icon} ${escapeHtml(prize.name)}</td>`;
    summaryTbody.appendChild(tr);
  });
  summaryPanel.classList.remove("hidden");
  statusEl.textContent = "📋 全結果を公開しました";
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* =========================================================
 * イベント
 * ======================================================= */
$("start-btn").onclick = () => {
  const g = buildGame();
  if (!g) return;
  game = g;
  Effects.setSound($("sound-enabled").checked);
  setupScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  summaryPanel.classList.add("hidden");
  summaryTbody.innerHTML = "";
  setupCanvas();
  draw();
  updateStatus();
};

$("back-btn").onclick = () => {
  if (animating) return;
  gameScreen.classList.add("hidden");
  setupScreen.classList.remove("hidden");
};

$("reveal-all-btn").onclick = revealAll;

canvas.addEventListener("click", (ev) => {
  if (!game || animating) return;
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  // 上部の丸ボタン判定
  for (let i = 0; i < game.n; i++) {
    const bx = geo.colX(i), by = geo.topY - 26;
    if (Math.hypot(x - bx, y - by) <= 22 && !game.done[i]) {
      animatePlayer(i);
      return;
    }
  }
});

window.addEventListener("resize", () => {
  if (game && !gameScreen.classList.contains("hidden") && !animating) {
    setupCanvas();
    draw();
  }
});

refreshSetup();
