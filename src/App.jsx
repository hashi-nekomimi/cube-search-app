import React, { useMemo, useEffect, useState } from "react";

// =========================
// 基本設定
// =========================

const FACE_ORDER = ["U", "R", "F", "D", "L", "B"];
const SOLVED = Uint8Array.from({ length: 54 }, (_, i) => i);
const DONT_CARE = "X";

const NORMAL = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  R: [1, 0, 0],
  L: [-1, 0, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};

const FACE_COLOR_STYLE = {
  U: "#f8fafc",
  R: "#ef4444",
  F: "#22c55e",
  D: "#facc15",
  L: "#fb923c",
  B: "#3b82f6",
  X: "#111827",
};

const FACE_LABEL = {
  U: "白",
  R: "赤",
  F: "緑",
  D: "黄",
  L: "橙",
  B: "青",
  X: "dont care",
};

function keyOf(pos, normal) {
  return `${pos.join(",")}|${normal.join(",")}`;
}

function facePos(face, r, c) {
  const map = {
    U: [c - 1, 1, r - 1],
    D: [c - 1, -1, 1 - r],
    F: [c - 1, 1 - r, 1],
    B: [1 - c, 1 - r, -1],
    R: [1, 1 - r, 1 - c],
    L: [-1, 1 - r, c - 1],
  };
  return map[face];
}

function buildStickers() {
  const stickers = [];
  const indexOf = new Map();

  for (const face of FACE_ORDER) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const pos = facePos(face, r, c);
        const normal = NORMAL[face];
        indexOf.set(keyOf(pos, normal), stickers.length);
        stickers.push([pos, normal]);
      }
    }
  }

  return { stickers, indexOf };
}

const { stickers: STICKERS, indexOf: INDEX_OF } = buildStickers();

// =========================
// 回転処理
// =========================

function rot(v, axis, direction) {
  const [x, y, z] = v;

  if (axis === "x") return [x, -direction * z, direction * y];
  if (axis === "y") return [direction * z, y, -direction * x];
  if (axis === "z") return [-direction * y, direction * x, z];

  throw new Error(`Unknown axis: ${axis}`);
}

function makePerm(axis, layers, direction) {
  const layerSet = new Set(layers);
  const perm = Array.from({ length: 54 }, (_, i) => i);
  const axisIndex = { x: 0, y: 1, z: 2 }[axis];

  for (let i = 0; i < STICKERS.length; i++) {
    const [pos, normal] = STICKERS[i];
    const coord = pos[axisIndex];

    if (layerSet.has(coord)) {
      const newPos = rot(pos, axis, direction);
      const newNormal = rot(normal, axis, direction);
      const j = INDEX_OF.get(keyOf(newPos, newNormal));
      perm[j] = i;
    }
  }

  return perm;
}

function applyPerm(state, perm) {
  const next = new Uint8Array(54);
  for (let i = 0; i < 54; i++) next[i] = state[perm[i]];
  return next;
}

function stateKey(state) {
  return String.fromCharCode(...state);
}

function composePerm(p, q) {
  return Array.from({ length: 54 }, (_, i) => p[q[i]]);
}

function permPower(p, n) {
  let result = Array.from({ length: 54 }, (_, i) => i);
  for (let i = 0; i < n; i++) result = composePerm(result, p);
  return result;
}

// =========================
// 回転記号
// =========================

const BASE = {
  U: makePerm("y", [1], -1),
  D: makePerm("y", [-1], 1),
  R: makePerm("x", [1], -1),
  L: makePerm("x", [-1], 1),
  F: makePerm("z", [1], -1),
  B: makePerm("z", [-1], 1),

  M: makePerm("x", [0], 1),
  E: makePerm("y", [0], 1),
  S: makePerm("z", [0], -1),

  x: makePerm("x", [-1, 0, 1], -1),
  y: makePerm("y", [-1, 0, 1], -1),
  z: makePerm("z", [-1, 0, 1], -1),

  u: makePerm("y", [0, 1], -1),
  d: makePerm("y", [-1, 0], 1),
  r: makePerm("x", [0, 1], -1),
  l: makePerm("x", [-1, 0], 1),
  f: makePerm("z", [0, 1], -1),
  b: makePerm("z", [-1, 0], 1),
};

// =========================
// 手順パース
// =========================

const TOKEN_RE = /([URFDLBMESxyzurfdlb](?:w)?)(2|')?/g;

function normalizeAlgText(alg) {
  return String(alg)
    .replaceAll("’", "'")
    .replaceAll("＇", "'")
    .replace(/([URFDLB])w/g, (_, face) => face.toLowerCase())
    .replaceAll(",", " ");
}

function parseAlg(alg) {
  alg = normalizeAlgText(alg);
  const moves = [];
  let pos = 0;
  TOKEN_RE.lastIndex = 0;

  for (;;) {
    const m = TOKEN_RE.exec(alg);
    if (!m) break;

    if (alg.slice(pos, m.index).trim()) {
      throw new Error(`解釈できない部分: ${alg.slice(pos, m.index)}`);
    }

    const move = m[1];
    const suffix = m[2] || "";
    moves.push(move + suffix);
    pos = TOKEN_RE.lastIndex;
  }

  if (alg.slice(pos).trim()) {
    throw new Error(`解釈できない部分: ${alg.slice(pos)}`);
  }

  return moves;
}

const MOVE_PERM_CACHE = new Map();

function moveToPerm(move) {
  if (MOVE_PERM_CACHE.has(move)) return MOVE_PERM_CACHE.get(move);

  const base = move[0];
  if (!BASE[base]) throw new Error(`未対応の回転: ${base}`);

  let perm;
  if (move.endsWith("2")) perm = permPower(BASE[base], 2);
  else if (move.endsWith("'")) perm = permPower(BASE[base], 3);
  else perm = BASE[base];

  MOVE_PERM_CACHE.set(move, perm);
  return perm;
}

function applyAlg(state, alg) {
  let current = state;
  for (const move of parseAlg(alg)) current = applyPerm(current, moveToPerm(move));
  return current;
}

function makeSearchMoves(text) {
  const faces = [];

  for (const move of parseAlg(text)) {
    const face = move[0];
    if (!BASE[face]) throw new Error(`未対応の回転: ${face}`);
    if (!faces.includes(face)) faces.push(face);
  }

  const result = [];
  for (const face of faces) {
    result.push(face);
    result.push(face + "'");
  }
  return result;
}

// =========================
// 手順操作
// =========================

function inverseMove(move) {
  if (move.endsWith("'")) return move[0];
  if (move.endsWith("2")) return move;
  return move + "'";
}

function inverseAlgList(moves) {
  return [...moves].reverse().map(inverseMove);
}

function algToString(moves) {
  return moves.join(" ");
}

function isUD(move) {
  return move[0] === "U" || move[0] === "D";
}

function moveToFacePower(move) {
  const face = move[0];
  let power = 1;
  if (move.endsWith("2")) power = 2;
  else if (move.endsWith("'")) power = 3;
  return [face, power];
}

function facePowerToMove(face, power) {
  power = ((power % 4) + 4) % 4;
  if (power === 0) return null;
  if (power === 1) return face;
  if (power === 2) return face + "2";
  if (power === 3) return face + "'";
  throw new Error(String(power));
}

function simplifySameFace(moves) {
  const result = [];

  for (const move of moves) {
    const [face, power] = moveToFacePower(move);

    if (result.length && result[result.length - 1][0] === face) {
      const [, prevPower] = moveToFacePower(result.pop());
      const newMove = facePowerToMove(face, prevPower + power);
      if (newMove) result.push(newMove);
    } else {
      result.push(move);
    }
  }

  return result;
}

function compressUDRuns(moves) {
  const result = [];
  let i = 0;

  while (i < moves.length) {
    if (!isUD(moves[i])) {
      result.push(moves[i]);
      i++;
      continue;
    }

    let uPower = 0;
    let dPower = 0;

    while (i < moves.length && isUD(moves[i])) {
      const [face, power] = moveToFacePower(moves[i]);
      if (face === "U") uPower += power;
      else dPower += power;
      i++;
    }

    const u = facePowerToMove("U", uPower);
    const d = facePowerToMove("D", dPower);
    if (u) result.push(u);
    if (d) result.push(d);
  }

  return result;
}

function cleanMoves(moves) {
  let current = [...moves];

  for (;;) {
    const old = current.join(" ");
    current = simplifySameFace(current);
    current = compressUDRuns(current);
    current = simplifySameFace(current);
    if (old === current.join(" ")) return current;
  }
}

function symbolMoveCount(moves) {
  return cleanMoves(moves).length;
}

function quarterTurnCount(moves) {
  return cleanMoves(moves).reduce((acc, move) => acc + (move.endsWith("2") ? 2 : 1), 0);
}

function effectiveMoveCount(moves) {
  moves = cleanMoves(moves);
  let count = 0;
  let i = 0;

  while (i < moves.length) {
    if (i + 1 < moves.length && isUD(moves[i]) && isUD(moves[i + 1]) && moves[i][0] !== moves[i + 1][0]) {
      count++;
      i += 2;
    } else {
      count++;
      i++;
    }
  }

  return count;
}

function symbolDelta(path, move) {
  if (!path.length) return 1;
  const last = path[path.length - 1];
  if (last[0] === move[0] && last === move) return 0;
  return 1;
}

function effectiveDelta(path, move) {
  if (!path.length) return 1;
  const last = path[path.length - 1];
  if (last[0] === move[0] && last === move) return 0;
  if (isUD(last) && isUD(move)) return 0;
  return 1;
}

function formatWithSimulUD(moves) {
  moves = cleanMoves(moves);
  const parts = [];
  let i = 0;

  while (i < moves.length) {
    if (i + 1 < moves.length && isUD(moves[i]) && isUD(moves[i + 1]) && moves[i][0] !== moves[i + 1][0]) {
      parts.push(`[${moves[i]}+${moves[i + 1]}]`);
      i += 2;
    } else {
      parts.push(moves[i]);
      i++;
    }
  }

  return parts.join(" ");
}

function canAddMove(path, move) {
  if (!path.length) return true;

  const last = path[path.length - 1];

  if (last[0] === move[0]) {
    if (inverseMove(last) === move) return false;
    if (path.length >= 2 && path[path.length - 2][0] === move[0]) return false;
    return last === move;
  }

  return true;
}

// =========================
// 状態パターン
// =========================

function stickerFaceAt(state, pos) {
  return FACE_ORDER[Math.floor(state[pos] / 9)];
}

function solvedPattern() {
  const pattern = {};
  for (const face of FACE_ORDER) pattern[face] = Array(9).fill(face);
  return pattern;
}

function stateToPattern(state) {
  const pattern = {};
  for (let f = 0; f < FACE_ORDER.length; f++) {
    const face = FACE_ORDER[f];
    pattern[face] = [];
    for (let i = 0; i < 9; i++) pattern[face].push(stickerFaceAt(state, f * 9 + i));
  }
  return pattern;
}

function patternToArray(pattern) {
  const arr = [];
  for (const face of FACE_ORDER) arr.push(...pattern[face]);
  return arr;
}

function arrayToPattern(arr) {
  const pattern = {};
  let k = 0;
  for (const face of FACE_ORDER) {
    pattern[face] = [];
    for (let i = 0; i < 9; i++) pattern[face].push(arr[k++] || DONT_CARE);
  }
  return pattern;
}

function countPatternColors(pattern) {
  const counts = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0, X: 0 };
  for (const face of FACE_ORDER) {
    for (const color of pattern[face]) counts[color]++;
  }
  return counts;
}

function validatePattern(pattern) {
  const counts = countPatternColors(pattern);

  for (const face of FACE_ORDER) {
    if (pattern[face][4] !== face) {
      throw new Error(`${face}面のセンターは${face}色固定にして。`);
    }
    if (counts[face] > 9) {
      throw new Error(`${face}色が${counts[face]}枚ある。最大9枚まで。`);
    }
  }
}

function matchesPattern(state, patternArr) {
  for (let i = 0; i < 54; i++) {
    const expected = patternArr[i];
    if (expected === DONT_CARE) continue;
    if (stickerFaceAt(state, i) !== expected) return false;
  }
  return true;
}

// =========================
// 探索
// =========================

function buildMovePerms(moves) {
  const out = new Map();
  for (const move of moves) out.set(move, moveToPerm(move));
  return out;
}

function sortSolutions(solutions) {
  return solutions
    .map(cleanMoves)
    .sort((a, b) => {
      const ka = [effectiveMoveCount(a), symbolMoveCount(a), quarterTurnCount(a), algToString(a)];
      const kb = [effectiveMoveCount(b), symbolMoveCount(b), quarterTurnCount(b), algToString(b)];
      for (let i = 0; i < ka.length; i++) {
        if (ka[i] < kb[i]) return -1;
        if (ka[i] > kb[i]) return 1;
      }
      return 0;
    });
}

function expandOneSide({ front, seenSelf, seenOther, movePerms, moves, sideEffectiveLimit, sideSymbolLimit, solutionSet, solutions, expandingFromStart, hardLimit }) {
  const newFront = new Map();

  for (const [, data] of front.entries()) {
    const { state, path, effCost, symCost } = data;

    for (const move of moves) {
      if (!canAddMove(path, move)) continue;

      const newEffCost = effCost + effectiveDelta(path, move);
      const newSymCost = symCost + symbolDelta(path, move);
      if (newEffCost > sideEffectiveLimit) continue;
      if (newSymCost > sideSymbolLimit) continue;

      const newState = applyPerm(state, movePerms.get(move));
      const key = stateKey(newState);
      if (seenSelf.has(key)) continue;

      const newPath = [...path, move];
      const record = { state: newState, path: newPath, effCost: newEffCost, symCost: newSymCost };
      seenSelf.set(key, record);
      newFront.set(key, record);

      if (seenOther.has(key)) {
        const otherPath = seenOther.get(key).path;
        const solution = cleanMoves(expandingFromStart ? [...newPath, ...inverseAlgList(otherPath)] : [...otherPath, ...inverseAlgList(newPath)]);

        if (effectiveMoveCount(solution) > hardLimit.maxEffectiveDepth) continue;
        if (symbolMoveCount(solution) > hardLimit.maxSymbolDepth) continue;

        const solutionKey = solution.join(" ");
        if (solutionSet.has(solutionKey)) continue;

        solutionSet.add(solutionKey);
        solutions.push(solution);
      }
    }
  }

  return newFront;
}

function bidirectionalBfsCollect({ start, goal = SOLVED, moves, maxEffectiveDepth = 16, maxSymbolDepth = 16 }) {
  if (stateKey(start) === stateKey(goal)) return [[]];

  const sideEffectiveLimitA = Math.ceil(maxEffectiveDepth / 2);
  const sideEffectiveLimitB = Math.floor(maxEffectiveDepth / 2);
  const sideSymbolLimitA = Math.ceil(maxSymbolDepth / 2);
  const sideSymbolLimitB = Math.floor(maxSymbolDepth / 2);

  const movePerms = buildMovePerms(moves);
  const startKey = stateKey(start);
  const goalKey = stateKey(goal);

  let frontA = new Map([[startKey, { state: start, path: [], effCost: 0, symCost: 0 }]]);
  let frontB = new Map([[goalKey, { state: goal, path: [], effCost: 0, symCost: 0 }]]);

  const seenA = new Map(frontA);
  const seenB = new Map(frontB);
  const solutions = [];
  const solutionSet = new Set();

  while (frontA.size || frontB.size) {
    if (frontA.size && (frontA.size <= frontB.size || !frontB.size)) {
      frontA = expandOneSide({
        front: frontA,
        seenSelf: seenA,
        seenOther: seenB,
        movePerms,
        moves,
        sideEffectiveLimit: sideEffectiveLimitA,
        sideSymbolLimit: sideSymbolLimitA,
        solutionSet,
        solutions,
        expandingFromStart: true,
        hardLimit: { maxEffectiveDepth, maxSymbolDepth },
      });
    } else if (frontB.size) {
      frontB = expandOneSide({
        front: frontB,
        seenSelf: seenB,
        seenOther: seenA,
        movePerms,
        moves,
        sideEffectiveLimit: sideEffectiveLimitB,
        sideSymbolLimit: sideSymbolLimitB,
        solutionSet,
        solutions,
        expandingFromStart: false,
        hardLimit: { maxEffectiveDepth, maxSymbolDepth },
      });
    }

    if (!frontA.size && !frontB.size) break;
  }

  return solutions;
}

function bfsPatternCollect({ pattern, moves, maxEffectiveDepth = 16, maxSymbolDepth = 16, maxSolutions = 500 }) {
  validatePattern(pattern);
  const patternArr = patternToArray(pattern);
  const movePerms = buildMovePerms(moves);
  const start = SOLVED;

  const front = new Map([[stateKey(start), { state: start, path: [], effCost: 0, symCost: 0 }]]);
  const seen = new Map(front);
  const solutions = [];
  const solutionSet = new Set();

  if (matchesPattern(start, patternArr)) return [[]];

  let currentFront = front;

  while (currentFront.size && solutions.length < maxSolutions) {
    const newFront = new Map();

    for (const [, data] of currentFront.entries()) {
      const { state, path, effCost, symCost } = data;

      for (const move of moves) {
        if (!canAddMove(path, move)) continue;

        const newEffCost = effCost + effectiveDelta(path, move);
        const newSymCost = symCost + symbolDelta(path, move);
        if (newEffCost > maxEffectiveDepth) continue;
        if (newSymCost > maxSymbolDepth) continue;

        const newState = applyPerm(state, movePerms.get(move));
        const key = stateKey(newState);
        if (seen.has(key)) continue;

        const newPath = [...path, move];
        const record = { state: newState, path: newPath, effCost: newEffCost, symCost: newSymCost };
        seen.set(key, record);
        newFront.set(key, record);

        if (matchesPattern(newState, patternArr)) {
          const solution = cleanMoves(newPath);
          const solutionKey = solution.join(" ");
          if (!solutionSet.has(solutionKey)) {
            solutionSet.add(solutionKey);
            solutions.push(solution);
            if (solutions.length >= maxSolutions) break;
          }
        }
      }
    }

    currentFront = newFront;
  }

  return solutions;
}

// =========================
// URL共有
// =========================

function encodeShareState(obj) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)));
}

function decodeShareState(text) {
  const json = decodeURIComponent(escape(atob(text)));
  return JSON.parse(json);
}

// =========================
// UI部品
// =========================

function Sticker({ color, onClick, locked = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      className={`h-9 w-9 rounded-md border border-slate-300 transition ${locked ? "cursor-not-allowed ring-2 ring-slate-500" : "hover:scale-105"}`}
      style={{ background: FACE_COLOR_STYLE[color] }}
      title={FACE_LABEL[color] || color}
    >
      {color === DONT_CARE ? <span className="text-xs font-bold text-white">?</span> : null}
    </button>
  );
}

function FaceGrid({ face, stickers, onStickerClick }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-xs font-semibold text-slate-600">{face}</div>
      <div className="grid grid-cols-3 gap-1">
        {stickers.map((color, idx) => (
          <Sticker key={idx} color={color} locked={idx === 4} onClick={() => onStickerClick(idx)} />
        ))}
      </div>
    </div>
  );
}

function NetEditor({ pattern, setPattern, selectedColor }) {
  function setSticker(face, idx) {
    if (idx === 4) return;
    setPattern((prev) => {
      const next = {};
      for (const f of FACE_ORDER) next[f] = [...prev[f]];
      next[face][idx] = selectedColor;
      return next;
    });
  }

  return (
    <div className="grid gap-3 justify-center overflow-x-auto py-2">
      <div className="flex justify-center">
        <FaceGrid face="U" stickers={pattern.U} onStickerClick={(idx) => setSticker("U", idx)} />
      </div>
      <div className="grid grid-cols-4 gap-3 justify-center">
        <FaceGrid face="L" stickers={pattern.L} onStickerClick={(idx) => setSticker("L", idx)} />
        <FaceGrid face="F" stickers={pattern.F} onStickerClick={(idx) => setSticker("F", idx)} />
        <FaceGrid face="R" stickers={pattern.R} onStickerClick={(idx) => setSticker("R", idx)} />
        <FaceGrid face="B" stickers={pattern.B} onStickerClick={(idx) => setSticker("B", idx)} />
      </div>
      <div className="flex justify-center">
        <FaceGrid face="D" stickers={pattern.D} onStickerClick={(idx) => setSticker("D", idx)} />
      </div>
    </div>
  );
}

function SolutionCard({ index, solution }) {
  const alg = algToString(solution);

  async function copy() {
    try {
      await navigator.clipboard.writeText(alg);
    } catch (_) {}
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-500">#{index}</div>
        <button onClick={copy} className="rounded-xl border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">コピー</button>
      </div>
      <div className="break-words font-mono text-base font-semibold text-slate-900">{alg || "(空)"}</div>
      <div className="mt-2 break-words font-mono text-sm text-slate-600">{formatWithSimulUD(solution)}</div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl bg-slate-100 p-2"><div className="text-slate-500">同時回し</div><div className="text-lg font-bold">{effectiveMoveCount(solution)}</div></div>
        <div className="rounded-xl bg-slate-100 p-2"><div className="text-slate-500">記号手数</div><div className="text-lg font-bold">{symbolMoveCount(solution)}</div></div>
        <div className="rounded-xl bg-slate-100 p-2"><div className="text-slate-500">90度手数</div><div className="text-lg font-bold">{quarterTurnCount(solution)}</div></div>
      </div>
    </div>
  );
}

export default function App() {
  const [inputMode, setInputMode] = useState("alg");
  const [targetAlg, setTargetAlg] = useState("R' U R' U' y R' F' R2 U' R' U R' F R F y'");
  const [targetPattern, setTargetPattern] = useState(solvedPattern());
  const [selectedColor, setSelectedColor] = useState("F");
  const [searchMovesText, setSearchMovesText] = useState("R U S");
  const [maxEffectiveDepth, setMaxEffectiveDepth] = useState(16);
  const [maxSymbolDepth, setMaxSymbolDepth] = useState(16);
  const [limit, setLimit] = useState(200);
  const [solutions, setSolutions] = useState([]);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [shareMessage, setShareMessage] = useState("");

  useEffect(() => {
    if (!window.location.hash.startsWith("#s=")) return;
    try {
      const data = decodeShareState(window.location.hash.slice(3));
      if (data.inputMode) setInputMode(data.inputMode);
      if (typeof data.targetAlg === "string") setTargetAlg(data.targetAlg);
      if (typeof data.searchMovesText === "string") setSearchMovesText(data.searchMovesText);
      if (Number.isFinite(data.maxEffectiveDepth)) setMaxEffectiveDepth(data.maxEffectiveDepth);
      if (Number.isFinite(data.maxSymbolDepth)) setMaxSymbolDepth(data.maxSymbolDepth);
      if (Number.isFinite(data.limit)) setLimit(data.limit);
      if (Array.isArray(data.pattern) && data.pattern.length === 54) setTargetPattern(arrayToPattern(data.pattern));
    } catch (_) {}
  }, []);

  const searchMovesPreview = useMemo(() => {
    try {
      return makeSearchMoves(searchMovesText).join(" ");
    } catch {
      return "";
    }
  }, [searchMovesText]);

  const counts = useMemo(() => countPatternColors(targetPattern), [targetPattern]);

  function loadAlgToPattern() {
    try {
      const state = applyAlg(SOLVED, targetAlg);
      setTargetPattern(stateToPattern(state));
      setInputMode("pattern");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function resetAll() {
    setInputMode("alg");
    setTargetAlg("R' U R' U' y R' F' R2 U' R' U R' F R F y'");
    setTargetPattern(solvedPattern());
    setSelectedColor("F");
    setSearchMovesText("R U D");
    setMaxEffectiveDepth(16);
    setMaxSymbolDepth(16);
    setLimit(5);
    setSolutions([]);
    setError("");
    setShareMessage("");
  }

  async function makeUrl() {
    const data = {
      inputMode,
      targetAlg,
      searchMovesText,
      maxEffectiveDepth: Number(maxEffectiveDepth),
      maxSymbolDepth: Number(maxSymbolDepth),
      limit: Number(limit),
      pattern: patternToArray(targetPattern),
    };
    const url = `${window.location.origin}${window.location.pathname}#s=${encodeShareState(data)}`;
    window.history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage("URLをコピーした");
    } catch (_) {
      setShareMessage("URLをアドレスバーに反映した");
    }
  }

  function runSearch() {
    setError("");
    setShareMessage("");
    setIsSearching(true);

    try {
      const moves = makeSearchMoves(searchMovesText);
      let found;

      if (inputMode === "alg") {
        const start = applyAlg(SOLVED, targetAlg);
        found = bidirectionalBfsCollect({
          start,
          goal: SOLVED,
          moves,
          maxEffectiveDepth: Number(maxEffectiveDepth),
          maxSymbolDepth: Number(maxSymbolDepth),
        });
      } else {
        found = bfsPatternCollect({
          pattern: targetPattern,
          moves,
          maxEffectiveDepth: Number(maxEffectiveDepth),
          maxSymbolDepth: Number(maxSymbolDepth),
          maxSolutions: Number(limit),
        });
      }

      setSolutions(sortSolutions(found).slice(0, Number(limit)));
    } catch (e) {
      setSolutions([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">手順探索アプリ</h1>
              <p className="mt-1 text-sm text-slate-600">探索は quarter turn のみ。出力では R2 / U2 などへ自動整理。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={makeUrl} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">URL化</button>
              <button onClick={resetAll} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">リセット</button>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setInputMode("alg")} className={`rounded-2xl px-4 py-2 text-sm font-semibold ${inputMode === "alg" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white"}`}>手順入力</button>
              <button onClick={() => setInputMode("pattern")} className={`rounded-2xl px-4 py-2 text-sm font-semibold ${inputMode === "pattern" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white"}`}>展開図入力</button>
            </div>

            {inputMode === "alg" ? (
              <label className="grid gap-2">
                <span className="text-sm font-semibold">対象手順</span>
                <textarea value={targetAlg} onChange={(e) => setTargetAlg(e.target.value)} className="min-h-24 rounded-2xl border border-slate-300 bg-white p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-slate-400" />
                <div><button onClick={loadAlgToPattern} className="rounded-xl border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">この手順を展開図に反映</button></div>
              </label>
            ) : (
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 text-sm text-slate-600">展開図は「このパターンを作る手順」を探すモード。黒は dont care。</div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {[...FACE_ORDER, DONT_CARE].map((face) => (
                    <button key={face} onClick={() => setSelectedColor(face)} className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold ${selectedColor === face ? "border-slate-900 ring-2 ring-slate-400" : "border-slate-300 bg-white"}`}>
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-400 text-[10px] font-bold text-white" style={{ background: FACE_COLOR_STYLE[face] }}>{face === DONT_CARE ? "?" : ""}</span>
                      {face}
                    </button>
                  ))}
                </div>
                <NetEditor pattern={targetPattern} setPattern={setTargetPattern} selectedColor={selectedColor} />
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => setTargetPattern(solvedPattern())} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">solved</button>
                  <button onClick={() => setTargetPattern((prev) => {
                    const next = {};
                    for (const f of FACE_ORDER) next[f] = prev[f].map((x, i) => i === 4 ? f : DONT_CARE);
                    return next;
                  })} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">センター以外dont care</button>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-sm md:grid-cols-7">
                  {[...FACE_ORDER, DONT_CARE].map((face) => (
                    <div key={face} className="rounded-xl bg-white px-3 py-2 text-center"><div className="font-semibold">{face}</div><div className="text-slate-600">{counts[face]}枚</div></div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-4">
              <label className="grid gap-2 md:col-span-2">
                <span className="text-sm font-semibold">探索に使う生成系</span>
                <input value={searchMovesText} onChange={(e) => setSearchMovesText(e.target.value)} className="rounded-2xl border border-slate-300 bg-white p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-slate-400" placeholder="例: R U D / R U f / R U S / R U x" />
                <span className="text-xs text-slate-500">実際の探索手: {searchMovesPreview || "未解釈"}</span>
              </label>
              <label className="grid gap-2"><span className="text-sm font-semibold">同時回し上限</span><input type="number" value={maxEffectiveDepth} onChange={(e) => setMaxEffectiveDepth(Number(e.target.value))} className="rounded-2xl border border-slate-300 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-slate-400" /></label>
              <label className="grid gap-2"><span className="text-sm font-semibold">記号手数上限</span><input type="number" value={maxSymbolDepth} onChange={(e) => setMaxSymbolDepth(Number(e.target.value))} className="rounded-2xl border border-slate-300 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-slate-400" /></label>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <label className="grid max-w-40 gap-2"><span className="text-sm font-semibold">表示上限</span><input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="rounded-2xl border border-slate-300 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-slate-400" /></label>
              <button onClick={runSearch} disabled={isSearching} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60">{isSearching ? "探索中..." : "探索する"}</button>
            </div>
          </div>
        </div>

        {shareMessage && <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">{shareMessage}</div>}
        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <div className="grid gap-4 md:grid-cols-2">
          {solutions.map((solution, i) => <SolutionCard key={`${i}-${algToString(solution)}`} index={i + 1} solution={solution} />)}
        </div>
      </div>
    </div>
  );
}
