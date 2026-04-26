import React, { useMemo, useRef, useState } from "react";

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

function orientationPerms() {
  const turnPerms = [
    BASE.x,
    permPower(BASE.x, 3),
    BASE.y,
    permPower(BASE.y, 3),
    BASE.z,
    permPower(BASE.z, 3),
  ];

  const identity = Array.from({ length: 54 }, (_, i) => i);
  const seen = new Map();
  const queue = [identity];
  seen.set(identity.join(","), identity);

  while (queue.length) {
    const current = queue.shift();

    for (const turn of turnPerms) {
      const next = composePerm(current, turn);
      const key = next.join(",");

      if (!seen.has(key)) {
        seen.set(key, next);
        queue.push(next);
      }
    }
  }

  return [...seen.values()];
}

const ORIENTATION_PERMS = orientationPerms();

function orientationStates(state) {
  return ORIENTATION_PERMS.map((perm) => applyPerm(state, perm));
}

const SOLVED_ORIENTATIONS = orientationStates(SOLVED);
const SOLVED_ORIENTATION_KEYS = new Set(SOLVED_ORIENTATIONS.map(stateKey));

function isSolvedUpToRotation(state) {
  return SOLVED_ORIENTATION_KEYS.has(stateKey(state));
}

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

const PARALLEL_GROUP = {
  U: "UD",
  D: "UD",
  R: "RL",
  L: "RL",
  F: "FB",
  B: "FB",
};

const PARALLEL_GROUP_FACES = {
  UD: ["U", "D"],
  RL: ["R", "L"],
  FB: ["F", "B"],
};

function parallelGroup(move) {
  return PARALLEL_GROUP[move[0]] || null;
}

function isParallelPair(a, b) {
  const ga = parallelGroup(a);
  const gb = parallelGroup(b);
  return ga !== null && ga === gb && a[0] !== b[0];
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

function compressParallelRuns(moves) {
  const result = [];
  let i = 0;

  while (i < moves.length) {
    const group = parallelGroup(moves[i]);

    if (!group) {
      result.push(moves[i]);
      i++;
      continue;
    }

    const powers = {};
    for (const face of PARALLEL_GROUP_FACES[group]) {
      powers[face] = 0;
    }

    while (i < moves.length && parallelGroup(moves[i]) === group) {
      const [face, power] = moveToFacePower(moves[i]);
      powers[face] += power;
      i++;
    }

    for (const face of PARALLEL_GROUP_FACES[group]) {
      const move = facePowerToMove(face, powers[face]);
      if (move) result.push(move);
    }
  }

  return result;
}

function cleanMoves(moves) {
  let current = [...moves];

  for (;;) {
    const old = current.join(" ");
    current = simplifySameFace(current);
    current = compressParallelRuns(current);
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
    if (i + 1 < moves.length && isParallelPair(moves[i], moves[i + 1])) {
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
  if (isParallelPair(last, move)) return 0;
  return 1;
}

function formatWithSimulUD(moves) {
  moves = cleanMoves(moves);
  const parts = [];
  let i = 0;

  while (i < moves.length) {
    if (i + 1 < moves.length && isParallelPair(moves[i], moves[i + 1])) {
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

function matchesPatternUpToRotation(state, patternArr) {
  for (const perm of ORIENTATION_PERMS) {
    if (matchesPattern(applyPerm(state, perm), patternArr)) {
      return true;
    }
  }
  return false;
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
  const goalStates = goal === SOLVED ? SOLVED_ORIENTATIONS : orientationStates(goal);
  const goalKeys = new Set(goalStates.map(stateKey));

  if (goalKeys.has(stateKey(start))) return [[]];

  const sideEffectiveLimitA = Math.ceil(maxEffectiveDepth / 2);
  const sideEffectiveLimitB = Math.floor(maxEffectiveDepth / 2);
  const sideSymbolLimitA = Math.ceil(maxSymbolDepth / 2);
  const sideSymbolLimitB = Math.floor(maxSymbolDepth / 2);

  const movePerms = buildMovePerms(moves);
  const startKey = stateKey(start);

  let frontA = new Map([[startKey, { state: start, path: [], effCost: 0, symCost: 0 }]]);
  let frontB = new Map();

  for (const goalState of goalStates) {
    frontB.set(stateKey(goalState), { state: goalState, path: [], effCost: 0, symCost: 0 });
  }

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

function compareSolutions(a, b) {
  const ka = [effectiveMoveCount(a), symbolMoveCount(a), quarterTurnCount(a), algToString(a)];
  const kb = [effectiveMoveCount(b), symbolMoveCount(b), quarterTurnCount(b), algToString(b)];
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] < kb[i]) return -1;
    if (ka[i] > kb[i]) return 1;
  }
  return 0;
}

function insertSolutionSorted(list, solution, maxLen = Infinity) {
  const normalized = cleanMoves(solution);
  const key = algToString(normalized);
  if (list.some((x) => algToString(x) === key)) return list;

  const next = [...list];
  let inserted = false;

  for (let i = 0; i < next.length; i++) {
    if (compareSolutions(normalized, next[i]) < 0) {
      next.splice(i, 0, normalized);
      inserted = true;
      break;
    }
  }

  if (!inserted) next.push(normalized);
  if (next.length > maxLen) next.length = maxLen;
  return next;
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function expandOneSideAsync({ front, seenSelf, seenOther, movePerms, moves, sideEffectiveLimit, sideSymbolLimit, solutionSet, expandingFromStart, hardLimit, shouldStop, onSolution }) {
  const newFront = new Map();
  let work = 0;

  for (const [, data] of front.entries()) {
    if (shouldStop()) break;
    const { state, path, effCost, symCost } = data;

    for (const move of moves) {
      if (shouldStop()) break;
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

        const solutionKey = algToString(solution);
        if (solutionSet.has(solutionKey)) continue;

        solutionSet.add(solutionKey);
        onSolution(solution);
      }

      work++;
      if (work % 1200 === 0) await yieldToBrowser();
    }
  }

  return newFront;
}

async function bidirectionalBfsCollectAsync({ start, goal = SOLVED, moves, maxEffectiveDepth = 16, maxSymbolDepth = 16, shouldStop, onSolution }) {
  const goalStates = goal === SOLVED ? SOLVED_ORIENTATIONS : orientationStates(goal);
  const goalKeys = new Set(goalStates.map(stateKey));

  if (goalKeys.has(stateKey(start))) {
    onSolution([]);
    return;
  }

  const sideEffectiveLimitA = Math.ceil(maxEffectiveDepth / 2);
  const sideEffectiveLimitB = Math.floor(maxEffectiveDepth / 2);
  const sideSymbolLimitA = Math.ceil(maxSymbolDepth / 2);
  const sideSymbolLimitB = Math.floor(maxSymbolDepth / 2);

  const movePerms = buildMovePerms(moves);
  const startKey = stateKey(start);

  let frontA = new Map([[startKey, { state: start, path: [], effCost: 0, symCost: 0 }]]);
  let frontB = new Map();

  for (const goalState of goalStates) {
    frontB.set(stateKey(goalState), { state: goalState, path: [], effCost: 0, symCost: 0 });
  }

  const seenA = new Map(frontA);
  const seenB = new Map(frontB);
  const solutionSet = new Set();

  while ((frontA.size || frontB.size) && !shouldStop()) {
    if (frontA.size && (frontA.size <= frontB.size || !frontB.size)) {
      frontA = await expandOneSideAsync({
        front: frontA,
        seenSelf: seenA,
        seenOther: seenB,
        movePerms,
        moves,
        sideEffectiveLimit: sideEffectiveLimitA,
        sideSymbolLimit: sideSymbolLimitA,
        solutionSet,
        expandingFromStart: true,
        hardLimit: { maxEffectiveDepth, maxSymbolDepth },
        shouldStop,
        onSolution,
      });
    } else {
      frontB = await expandOneSideAsync({
        front: frontB,
        seenSelf: seenB,
        seenOther: seenA,
        movePerms,
        moves,
        sideEffectiveLimit: sideEffectiveLimitB,
        sideSymbolLimit: sideSymbolLimitB,
        solutionSet,
        expandingFromStart: false,
        hardLimit: { maxEffectiveDepth, maxSymbolDepth },
        shouldStop,
        onSolution,
      });
    }

    await yieldToBrowser();
  }
}

async function bfsPatternCollectAsync({ pattern, moves, maxEffectiveDepth = 16, maxSymbolDepth = 16, shouldStop, onSolution }) {
  validatePattern(pattern);

  const patternArr = patternToArray(pattern);
  const movePerms = buildMovePerms(moves);
  const start = SOLVED;

  if (matchesPatternUpToRotation(start, patternArr)) {
    onSolution([]);
    return;
  }

  let currentFront = new Map([[stateKey(start), { state: start, path: [], effCost: 0, symCost: 0 }]]);
  const seen = new Map(currentFront);
  const solutionSet = new Set();
  let work = 0;

  while (currentFront.size && !shouldStop()) {
    const newFront = new Map();

    for (const [, data] of currentFront.entries()) {
      if (shouldStop()) break;
      const { state, path, effCost, symCost } = data;

      for (const move of moves) {
        if (shouldStop()) break;
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

        if (matchesPatternUpToRotation(newState, patternArr)) {
          const solution = cleanMoves(newPath);
          const solutionKey = algToString(solution);
          if (!solutionSet.has(solutionKey)) {
            solutionSet.add(solutionKey);
            onSolution(solution);
          }
        }

        work++;
        if (work % 1200 === 0) await yieldToBrowser();
      }
    }

    currentFront = newFront;
    await yieldToBrowser();
  }
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
      className={[
        "aspect-square w-full rounded-md border border-slate-300 transition duration-150",
        locked ? "cursor-not-allowed ring-2 ring-slate-500" : "hover:scale-105 active:scale-95",
      ].join(" ")}
      style={{ background: FACE_COLOR_STYLE[color] }}
      title={FACE_LABEL[color] || color}
    >
      {color === DONT_CARE ? (
        <span className="text-xs font-bold text-white">?</span>
      ) : null}
    </button>
  );
}

function FaceGrid({ stickers, onStickerClick }) {
  return (
    <div className="grid w-full grid-cols-3 gap-1">
      {stickers.map((color, idx) => (
        <Sticker
          key={idx}
          color={color}
          locked={idx === 4}
          onClick={() => onStickerClick(idx)}
        />
      ))}
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

  const spacer = <div />;

  return (
    <div className="mx-auto grid w-full max-w-[520px] grid-cols-4 gap-1.5 py-2 sm:gap-3">
      {spacer}
      <FaceGrid stickers={pattern.U} onStickerClick={(idx) => setSticker("U", idx)} />
      {spacer}
      {spacer}

      <FaceGrid stickers={pattern.L} onStickerClick={(idx) => setSticker("L", idx)} />
      <FaceGrid stickers={pattern.F} onStickerClick={(idx) => setSticker("F", idx)} />
      <FaceGrid stickers={pattern.R} onStickerClick={(idx) => setSticker("R", idx)} />
      <FaceGrid stickers={pattern.B} onStickerClick={(idx) => setSticker("B", idx)} />

      {spacer}
      <FaceGrid stickers={pattern.D} onStickerClick={(idx) => setSticker("D", idx)} />
      {spacer}
      {spacer}
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-500">#{index}</div>
        <button onClick={copy} className="rounded-xl border px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-50 active:scale-95">コピー</button>
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

function ThinkingCard({ foundCount }) {
  return (
    <div className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-indigo-50 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-sky-500 [animation-delay:0ms]" />
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-sky-500 [animation-delay:120ms]" />
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-sky-500 [animation-delay:240ms]" />
        </div>
        <div>
          <div className="font-semibold text-slate-900">考え中…</div>
          <div className="text-sm text-slate-600">見つけた手順から順に表示中。今 {foundCount} 件見つかってる。</div>
        </div>
      </div>
    </div>
  );
}

function EmptyCard({ text }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">{text}</div>;
}

export default function App() {
  const [inputMode, setInputMode] = useState("alg");
  const [targetAlg, setTargetAlg] = useState("R' U R' U' y R' F' R2 U' R' U R' F R F y'");
  const [targetPattern, setTargetPattern] = useState(solvedPattern());
  const [selectedColor, setSelectedColor] = useState("F");
  const [searchMovesText, setSearchMovesText] = useState("R U D");
  const [maxEffectiveDepth, setMaxEffectiveDepth] = useState(16);
  const [maxSymbolDepth, setMaxSymbolDepth] = useState(16);
  const [limit, setLimit] = useState(5);
  const [solutions, setSolutions] = useState([]);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchSessionRef = useRef(0);

  const searchMovesPreview = useMemo(() => {
    try {
      return makeSearchMoves(searchMovesText).join(" ");
    } catch {
      return "";
    }
  }, [searchMovesText]);


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
    searchSessionRef.current += 1;
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
    setIsSearching(false);
    setHasSearched(false);
  }

  function stopSearch() {
    searchSessionRef.current += 1;
    setIsSearching(false);
  }

  async function runSearch(mode) {
    const currentSession = searchSessionRef.current + 1;
    searchSessionRef.current = currentSession;
    setInputMode(mode);
    setError("");
    setSolutions([]);
    setHasSearched(true);
    setIsSearching(true);

    try {
      const moves = makeSearchMoves(searchMovesText);
      const maxResults = Number(limit);
      const shouldStop = () => searchSessionRef.current !== currentSession;

      const onSolution = (solution) => {
        if (shouldStop()) return;
        let reachedLimit = false;
        setSolutions((prev) => {
          const next = insertSolutionSorted(prev, solution, maxResults);
          if (next.length >= maxResults) reachedLimit = true;
          return next;
        });
        if (reachedLimit) searchSessionRef.current += 1;
      };

      if (mode === "alg") {
        const start = applyAlg(SOLVED, targetAlg);
        await bidirectionalBfsCollectAsync({
          start,
          goal: SOLVED,
          moves,
          maxEffectiveDepth: Number(maxEffectiveDepth),
          maxSymbolDepth: Number(maxSymbolDepth),
          shouldStop,
          onSolution,
        });
      } else {
        await bfsPatternCollectAsync({
          pattern: targetPattern,
          moves,
          maxEffectiveDepth: Number(maxEffectiveDepth),
          maxSymbolDepth: Number(maxSymbolDepth),
          shouldStop,
          onSolution,
        });
      }
    } catch (e) {
      if (searchSessionRef.current === currentSession) {
        setSolutions([]);
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4">
            <div className="grid gap-4">
              <label className="grid gap-2">
                <textarea
                  value={targetAlg}
                  onChange={(e) => setTargetAlg(e.target.value)}
                  placeholder="スクランブルを入力..."
                  className="h-12 resize-none rounded-2xl border border-slate-300 bg-white px-3 py-3 font-mono text-sm leading-5 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-slate-400"
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <button onClick={loadAlgToPattern} className="rounded-xl border border-slate-300 px-3 py-2 text-sm transition hover:bg-slate-50 active:scale-95">下の展開図に反映</button>
                  <button onClick={() => runSearch("alg")} disabled={isSearching} className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition active:scale-95 ${isSearching ? "cursor-not-allowed bg-slate-500" : "bg-slate-900 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"}`}>{isSearching ? "探索中…" : "手順から探索"}</button>
                </div>
              </label>

              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                <div className="mb-4 flex flex-wrap gap-2">
                  {[...FACE_ORDER, DONT_CARE].map((face) => (
                    <button key={face} onClick={() => setSelectedColor(face)} className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition active:scale-95 ${selectedColor === face ? "border-slate-900 bg-white shadow-md ring-2 ring-slate-400" : "border-slate-300 bg-white hover:bg-slate-50"}`}>
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-400 text-[10px] font-bold text-white" style={{ background: FACE_COLOR_STYLE[face] }}>{face === DONT_CARE ? "?" : ""}</span>
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
              </div>
            </div>

            <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1">
                <span className="text-sm font-semibold">探索に使う生成系</span>
                <input value={searchMovesText} onChange={(e) => setSearchMovesText(e.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-5 outline-none focus:ring-2 focus:ring-slate-400" placeholder="例: R U D / R U f / R U S / R U x" />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-semibold">同時回し上限</span>
                <input type="number" value={maxEffectiveDepth} onChange={(e) => setMaxEffectiveDepth(Number(e.target.value))} className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-5 outline-none focus:ring-2 focus:ring-slate-400" />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-semibold">記号手数上限</span>
                <input type="number" value={maxSymbolDepth} onChange={(e) => setMaxSymbolDepth(Number(e.target.value))} className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-5 outline-none focus:ring-2 focus:ring-slate-400" />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-semibold">表示上限</span>
                <input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-5 outline-none focus:ring-2 focus:ring-slate-400" />
              </label>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
              {isSearching ? (
                <button onClick={stopSearch} className="rounded-2xl border border-rose-300 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 active:scale-95">停止する</button>
              ) : null}
              <button onClick={() => runSearch("pattern")} disabled={isSearching} className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:opacity-60">{isSearching ? "探索中…" : "展開図から探索"}</button>
            </div>
          </div>
        </div>

        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <div className="mb-4">
          {isSearching ? <ThinkingCard foundCount={solutions.length} /> : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {solutions.map((solution, i) => <SolutionCard key={`${i}-${algToString(solution)}`} index={i + 1} solution={solution} />)}
        </div>

        {!isSearching && !error && hasSearched && solutions.length === 0 ? (
          <div className="mt-4"><EmptyCard text="見つからんかった。" /></div>
        ) : null}

        {!hasSearched && !isSearching ? (
          <div className="mt-4"><EmptyCard text="条件を入れて探索してな。" /></div>
        ) : null}
      </div>
    </div>
  );
}
