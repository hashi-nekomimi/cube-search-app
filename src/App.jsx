import React, { useMemo, useRef, useState } from "react";

// =========================
// Core settings
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
// Rotation utilities
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
// Move definitions
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
// Algorithm parser
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
      throw new Error(`入力に読み取れない部分があります: ${alg.slice(pos, m.index)}`);
    }

    const move = m[1];
    const suffix = m[2] || "";
    moves.push(move + suffix);
    pos = TOKEN_RE.lastIndex;
  }

  if (alg.slice(pos).trim()) {
    throw new Error(`入力に読み取れない部分があります: ${alg.slice(pos)}`);
  }

  return moves;
}

const MOVE_PERM_CACHE = new Map();

function moveToPerm(move) {
  if (MOVE_PERM_CACHE.has(move)) return MOVE_PERM_CACHE.get(move);

  const base = move[0];
  if (!BASE[base]) throw new Error(`対応していない記号です: ${base}`);

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
    if (!BASE[face]) throw new Error(`対応していない記号です: ${face}`);
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
// Algorithm utilities
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
      parts.push(`( ${moves[i]} ${moves[i + 1]} )`);
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
// Pattern matching
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
      throw new Error(`${face}面の中央ステッカーは${face}色で固定してください。`);
    }
    if (counts[face] > 9) {
      throw new Error(`${face}色が${counts[face]}枚あります。各色は9枚以内にしてください。`);
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
// Search
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

function expandOneSide({ front, seenSelf, seenOther, movePerms, moves, sideSymbolLimit, solutionSet, solutions, expandingFromStart, hardLimit }) {
  const newFront = new Map();

  for (const [, data] of front.entries()) {
    const { state, path, symCost } = data;

    for (const move of moves) {
      if (!canAddMove(path, move)) continue;

      const newSymCost = symCost + symbolDelta(path, move);
      if (newSymCost > sideSymbolLimit) continue;

      const newState = applyPerm(state, movePerms.get(move));
      const key = stateKey(newState);
      if (seenSelf.has(key)) continue;

      const newPath = [...path, move];
      const record = { state: newState, path: newPath, symCost: newSymCost };
      seenSelf.set(key, record);
      newFront.set(key, record);

      if (seenOther.has(key)) {
        const otherPath = seenOther.get(key).path;
        const solution = cleanMoves(expandingFromStart ? [...newPath, ...inverseAlgList(otherPath)] : [...otherPath, ...inverseAlgList(newPath)]);

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

function bidirectionalBfsCollect({ start, goal = SOLVED, moves, maxSymbolDepth = 16 }) {
  const goalStates = goal === SOLVED ? SOLVED_ORIENTATIONS : orientationStates(goal);
  const goalKeys = new Set(goalStates.map(stateKey));

  if (goalKeys.has(stateKey(start))) return [[]];

  const sideSymbolLimitA = Math.ceil(maxSymbolDepth / 2);
  const sideSymbolLimitB = Math.floor(maxSymbolDepth / 2);

  const movePerms = buildMovePerms(moves);
  const startKey = stateKey(start);

  let frontA = new Map([[startKey, { state: start, path: [], symCost: 0 }]]);
  let frontB = new Map();

  for (const goalState of goalStates) {
    frontB.set(stateKey(goalState), { state: goalState, path: [], symCost: 0 });
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
        moves,        sideSymbolLimit: sideSymbolLimitA,
        solutionSet,
        solutions,
        expandingFromStart: true,
        hardLimit: { maxSymbolDepth },
      });
    } else if (frontB.size) {
      frontB = expandOneSide({
        front: frontB,
        seenSelf: seenB,
        seenOther: seenA,
        movePerms,
        moves,        sideSymbolLimit: sideSymbolLimitB,
        solutionSet,
        solutions,
        expandingFromStart: false,
        hardLimit: { maxSymbolDepth },
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

async function expandOneSideAsync({ front, seenSelf, seenOther, movePerms, moves, sideSymbolLimit, solutionSet, expandingFromStart, hardLimit, shouldStop, onSolution }) {
  const newFront = new Map();
  let work = 0;

  for (const [, data] of front.entries()) {
    if (shouldStop()) break;
    const { state, path, symCost } = data;

    for (const move of moves) {
      if (shouldStop()) break;
      if (!canAddMove(path, move)) continue;

      const newSymCost = symCost + symbolDelta(path, move);
      if (newSymCost > sideSymbolLimit) continue;

      const newState = applyPerm(state, movePerms.get(move));
      const key = stateKey(newState);
      if (seenSelf.has(key)) continue;

      const newPath = [...path, move];
      const record = { state: newState, path: newPath, symCost: newSymCost };
      seenSelf.set(key, record);
      newFront.set(key, record);

      if (seenOther.has(key)) {
        const otherPath = seenOther.get(key).path;
        const solution = cleanMoves(expandingFromStart ? [...newPath, ...inverseAlgList(otherPath)] : [...otherPath, ...inverseAlgList(newPath)]);

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

async function bidirectionalBfsCollectAsync({ start, goal = SOLVED, moves, maxSymbolDepth = 16, shouldStop, onSolution }) {
  const goalStates = goal === SOLVED ? SOLVED_ORIENTATIONS : orientationStates(goal);
  const goalKeys = new Set(goalStates.map(stateKey));

  if (goalKeys.has(stateKey(start))) {
    onSolution([]);
    return;
  }

  const sideSymbolLimitA = Math.ceil(maxSymbolDepth / 2);
  const sideSymbolLimitB = Math.floor(maxSymbolDepth / 2);

  const movePerms = buildMovePerms(moves);
  const startKey = stateKey(start);

  let frontA = new Map([[startKey, { state: start, path: [], symCost: 0 }]]);
  let frontB = new Map();

  for (const goalState of goalStates) {
    frontB.set(stateKey(goalState), { state: goalState, path: [], symCost: 0 });
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
        moves,        sideSymbolLimit: sideSymbolLimitA,
        solutionSet,
        expandingFromStart: true,
        hardLimit: { maxSymbolDepth },
        shouldStop,
        onSolution,
      });
    } else {
      frontB = await expandOneSideAsync({
        front: frontB,
        seenSelf: seenB,
        seenOther: seenA,
        movePerms,
        moves,        sideSymbolLimit: sideSymbolLimitB,
        solutionSet,
        expandingFromStart: false,
        hardLimit: { maxSymbolDepth },
        shouldStop,
        onSolution,
      });
    }

    await yieldToBrowser();
  }
}

async function bfsPatternCollectAsync({ pattern, moves, maxSymbolDepth = 16, shouldStop, onSolution }) {
  validatePattern(pattern);

  const patternArr = patternToArray(pattern);
  const movePerms = buildMovePerms(moves);
  const start = SOLVED;

  if (matchesPatternUpToRotation(start, patternArr)) {
    onSolution([]);
    return;
  }

  let currentFront = new Map([[stateKey(start), { state: start, path: [], symCost: 0 }]]);
  const seen = new Map(currentFront);
  const solutionSet = new Set();
  let work = 0;

  while (currentFront.size && !shouldStop()) {
    const newFront = new Map();

    for (const [, data] of currentFront.entries()) {
      if (shouldStop()) break;
      const { state, path, symCost } = data;

      for (const move of moves) {
        if (shouldStop()) break;
        if (!canAddMove(path, move)) continue;
        const newSymCost = symCost + symbolDelta(path, move);
        if (newSymCost > maxSymbolDepth) continue;

        const newState = applyPerm(state, movePerms.get(move));
        const key = stateKey(newState);
        if (seen.has(key)) continue;

        const newPath = [...path, move];
        const record = { state: newState, path: newPath, symCost: newSymCost };
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
// UI components
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

function SolutionCard({ index, solution, t, showMoveCounts }) {
  const displayAlg = formatWithSimulUD(solution);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="mb-2 text-sm font-semibold text-slate-500">#{index}</div>
      <div className="break-words font-mono text-base font-semibold text-slate-900">
        {displayAlg || "(空)"}
      </div>

      {showMoveCounts ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-slate-100 p-2">
            <div className="text-slate-500">{t.simultaneous}</div>
            <div className="text-lg font-bold">{effectiveMoveCount(solution)}</div>
          </div>
          <div className="rounded-xl bg-slate-100 p-2">
            <div className="text-slate-500">{t.symbolMoves}</div>
            <div className="text-lg font-bold">{symbolMoveCount(solution)}</div>
          </div>
          <div className="rounded-xl bg-slate-100 p-2">
            <div className="text-slate-500">{t.quarterTurns}</div>
            <div className="text-lg font-bold">{quarterTurnCount(solution)}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ThinkingCard({ foundCount, t }) {
  return (
    <div className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-indigo-50 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-sky-500 [animation-delay:0ms]" />
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-sky-500 [animation-delay:120ms]" />
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-sky-500 [animation-delay:240ms]" />
        </div>
        <div>
          <div className="font-semibold text-slate-900">{t.thinkingTitle}</div>
          <div className="text-sm text-slate-600">{t.thinkingBody(foundCount)}</div>
        </div>
      </div>
    </div>
  );
}

function EmptyCard({ text }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">{text}</div>;
}

const TEXT = {
  ja: {
    darkMode: "ダークモード",
    showMoveCounts: "手数を表示",
    language: "言語",
    inputPlaceholder: "既存の手順を入力…",
    applyToNet: "展開図に反映",
    searchFromAlg: "手順から探索",
    searching: "探索中…",    searchFromNet: "展開図から探索",
    generator: "生成系",
    depthLimit: "手数上限",
    resultLimit: "表示件数",
    copy: "コピー",
    simultaneous: "同時回し",
    symbolMoves: "記号手数",
    quarterTurns: "90度手数",
    thinkingTitle: "探索中…",
    thinkingBody: (n) => `見つかった手順から順に表示しています。現在 ${n} 件。`,
    noResults: "条件に一致する手順が見つかりませんでした。",
    initialHelp: "条件を入力して、探索を開始してください。",
  },
  en: {
    darkMode: "Dark mode",
    showMoveCounts: "Show move counts",
    language: "Language",
    inputPlaceholder: "Enter an existing solution…",
    applyToNet: "Apply to net",
    searchFromAlg: "Search from algorithm",
    searching: "Searching…",    searchFromNet: "Search from net",
    generator: "Generator",
    depthLimit: "Move limit",
    resultLimit: "Results",
    copy: "Copy",
    simultaneous: "Simul moves",
    symbolMoves: "Move count",
    quarterTurns: "Quarter turns",
    thinkingTitle: "Searching…",
    thinkingBody: (n) => `Showing results as they are found. ${n} found so far.`,
    noResults: "No matching algorithms found.",
    initialHelp: "Enter conditions and start searching.",
  },
  ur: {
    darkMode: "ڈارک موڈ",
    showMoveCounts: "چالوں کی گنتی دکھائیں",
    language: "زبان",
    inputPlaceholder: "موجودہ حل کا طریقہ درج کریں…",
    applyToNet: "نیٹ پر لگائیں",
    searchFromAlg: "طریقے سے تلاش",
    searching: "تلاش جاری…",    searchFromNet: "نیٹ سے تلاش",
    generator: "جنریٹر",
    depthLimit: "چالوں کی حد",
    resultLimit: "نتائج",
    copy: "کاپی",
    simultaneous: "ساتھ چالیں",
    symbolMoves: "چالوں کی گنتی",
    quarterTurns: "کوارٹر ٹرنز",
    thinkingTitle: "تلاش جاری…",
    thinkingBody: (n) => `ملنے والے طریقے فوراً دکھائے جا رہے ہیں۔ اب تک ${n} ملے۔`,
    noResults: "شرائط سے ملتا ہوا کوئی طریقہ نہیں ملا۔",
    initialHelp: "شرائط درج کریں اور تلاش شروع کریں۔",
  },
  ko: {
    darkMode: "다크 모드",
    showMoveCounts: "수순 수 표시",
    language: "언어",
    inputPlaceholder: "기존 해법을 입력…",
    applyToNet: "전개도에 반영",
    searchFromAlg: "알고리즘으로 탐색",
    searching: "탐색 중…",    searchFromNet: "전개도에서 탐색",
    generator: "생성계",
    depthLimit: "수순 제한",
    resultLimit: "표시 개수",
    copy: "복사",
    simultaneous: "동시 회전",
    symbolMoves: "기호 수",
    quarterTurns: "90도 회전 수",
    thinkingTitle: "탐색 중…",
    thinkingBody: (n) => `찾은 수순을 순서대로 표시하고 있습니다. 현재 ${n}개.`,
    noResults: "조건에 맞는 수순을 찾지 못했습니다.",
    initialHelp: "조건을 입력하고 탐색을 시작하세요.",
  },
  hi: {
    darkMode: "डार्क मोड",
    showMoveCounts: "चालों की संख्या दिखाएँ",
    language: "भाषा",
    inputPlaceholder: "मौजूदा समाधान दर्ज करें…",
    applyToNet: "नेट पर लागू करें",
    searchFromAlg: "एल्गोरिदम से खोजें",
    searching: "खोज जारी…",    searchFromNet: "नेट से खोजें",
    generator: "जनरेटर",
    depthLimit: "चाल सीमा",
    resultLimit: "परिणाम संख्या",
    copy: "कॉपी",
    simultaneous: "साथ-साथ चालें",
    symbolMoves: "चालों की संख्या",
    quarterTurns: "90° चालें",
    thinkingTitle: "खोज जारी…",
    thinkingBody: (n) => `मिले हुए तरीके क्रम से दिखाए जा रहे हैं। अभी तक ${n} मिले।`,
    noResults: "शर्तों से मिलता कोई तरीका नहीं मिला।",
    initialHelp: "शर्तें दर्ज करें और खोज शुरू करें।",
  },
  ar: {
    darkMode: "الوضع الداكن",
    showMoveCounts: "إظهار عدد الحركات",
    language: "اللغة",
    inputPlaceholder: "أدخل الحل الموجود…",
    applyToNet: "تطبيق على المخطط",
    searchFromAlg: "البحث من الخوارزمية",
    searching: "جارٍ البحث…",    searchFromNet: "البحث من المخطط",
    generator: "المولد",
    depthLimit: "حد الحركات",
    resultLimit: "عدد النتائج",
    copy: "نسخ",
    simultaneous: "حركات متزامنة",
    symbolMoves: "عدد الحركات",
    quarterTurns: "دورات 90°",
    thinkingTitle: "جارٍ البحث…",
    thinkingBody: (n) => `يتم عرض النتائج فور العثور عليها. تم العثور على ${n} حتى الآن.`,
    noResults: "لم يتم العثور على خوارزميات مطابقة.",
    initialHelp: "أدخل الشروط وابدأ البحث.",
  },
};

const LANGUAGE_LABEL = {
  ja: "日本語",
  en: "English",
  ur: "اردو",
  ko: "한국어",
  hi: "हिन्दी",
  ar: "العربية",
};

export default function App() {
  const [isDark, setIsDark] = useState(false);
  const [showMoveCounts, setShowMoveCounts] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [language, setLanguage] = useState("ja");
  const t = TEXT[language];
  const [inputMode, setInputMode] = useState("alg");
  const [targetAlg, setTargetAlg] = useState("R' U R' U' y R' F' R2 U' R' U R' F R F y'");
  const [targetPattern, setTargetPattern] = useState(solvedPattern());
  const [selectedColor, setSelectedColor] = useState("F");
  const [searchMovesText, setSearchMovesText] = useState("R U D");
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
      const inverseAlg = algToString(inverseAlgList(parseAlg(targetAlg)));
      const state = applyAlg(SOLVED, inverseAlg);
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
    setMaxSymbolDepth(16);
    setLimit(5);
    setSolutions([]);
    setError("");
    setIsSearching(false);
    setHasSearched(false);
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
        const inverseAlg = algToString(inverseAlgList(parseAlg(targetAlg)));
        const start = applyAlg(SOLVED, inverseAlg);
        await bidirectionalBfsCollectAsync({
          start,
          goal: SOLVED,
          moves,          maxSymbolDepth: Number(maxSymbolDepth),
          shouldStop,
          onSolution,
        });
      } else {
        await bfsPatternCollectAsync({
          pattern: targetPattern,
          moves,          maxSymbolDepth: Number(maxSymbolDepth),
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
    <div className={`${isDark ? "dark-mode" : "light-shell"} min-h-screen p-4 text-slate-900 md:p-8`}> 
      <style>{`
        body {
          background: #e5e7eb;
        }

        .light-shell {
          background: #e5e7eb !important;
        }
        .light-panel {
          background-color: #f1f5f9 !important;
        }
        .light-inner {
          background-color: #e2e8f0 !important;
        }

        .dark-mode {
          background: #27272a !important;
          color: #f4f4f5 !important;
        }
        .dark-mode .bg-white,
        .dark-mode .light-panel {
          background-color: #3f3f46 !important;
        }
        .dark-mode .bg-slate-50,
        .dark-mode .light-inner {
          background-color: #34343a !important;
        }
        .dark-mode .bg-slate-100 {
          background-color: #52525b !important;
        }
        .dark-mode .text-slate-900 {
          color: #fafafa !important;
        }
        .dark-mode .text-slate-700,
        .dark-mode .text-slate-600 {
          color: #e5e7eb !important;
        }
        .dark-mode .text-slate-500 {
          color: #d4d4d8 !important;
        }
        .dark-mode .border-slate-200,
        .dark-mode .border-slate-300 {
          border-color: #71717a !important;
        }
        .dark-mode .ring-slate-200,
        .dark-mode .ring-slate-400 {
          --tw-ring-color: #71717a !important;
        }
        .dark-mode input,
        .dark-mode textarea {
          background-color: #52525b !important;
          color: #ffffff !important;
          border-color: #71717a !important;
        }
        .dark-mode input::placeholder,
        .dark-mode textarea::placeholder {
          color: #d4d4d8 !important;
        }
        .dark-mode button.bg-white {
          background-color: #52525b !important;
          color: #ffffff !important;
        }
        .dark-mode button.bg-white:hover {
          background-color: #60606a !important;
        }
        .dark-mode .menu-button {
          background-color: #52525b !important;
          color: #ffffff !important;
          border-color: #a1a1aa !important;
        }
        .dark-mode .menu-panel {
          background-color: #3f3f46 !important;
          border-color: #a1a1aa !important;
        }
        .dark-mode .menu-item {
          background-color: #52525b !important;
          color: #ffffff !important;
          border: 1px solid #a1a1aa !important;
        }
        .dark-mode .menu-item:hover {
          background-color: #63636d !important;
        }
        .dark-mode .menu-item span {
          color: #ffffff !important;
        }
        .dark-mode .bg-gradient-to-r {
          background: #3f3f46 !important;
        }
      `}</style>

      {menuOpen ? (
        <button
          type="button"
          aria-label="close menu"
          onClick={() => {
            setMenuOpen(false);
            setLanguageOpen(false);
          }}
          className="fixed inset-0 z-40 cursor-default bg-transparent"
        />
      ) : null}

      <div className="fixed left-3 top-3 z-50">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="menu-button flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-300 bg-white text-xl font-bold text-slate-900 shadow-sm transition hover:bg-slate-50 active:scale-95"
          aria-label="menu"
        >
          ☰
        </button>

        {menuOpen ? (
          <div
            className="menu-panel mt-2 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsDark((v) => !v)}
              className="menu-item flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 active:scale-95"
            >
              <span>{t.darkMode}</span>
              <span>{isDark ? "ON" : "OFF"}</span>
            </button>
            <button
              onClick={() => setShowMoveCounts((v) => !v)}
              className="menu-item mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 active:scale-95"
            >
              <span>{t.showMoveCounts}</span>
              <span>{showMoveCounts ? "ON" : "OFF"}</span>
            </button>
            <button
              onClick={() => setLanguageOpen((v) => !v)}
              className="menu-item mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 active:scale-95"
            >
              <span>{t.language}</span>
              <span>{languageOpen ? "▴" : LANGUAGE_LABEL[language]}</span>
            </button>

            {languageOpen ? (
              <div className="mt-2 rounded-xl border border-slate-200 p-2">
                {Object.keys(TEXT).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => {
                      setLanguage(lang);
                      setLanguageOpen(false);
                    }}
                    className={`menu-item mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 active:scale-95 ${language === lang ? "ring-2 ring-slate-400" : ""}`}
                  >
                    <span>{LANGUAGE_LABEL[lang]}</span>
                    <span>{language === lang ? "✓" : ""}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mx-auto max-w-6xl">
        <div className="light-panel mb-6 rounded-3xl p-6 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4">
            <div className="grid gap-4">
              <label className="grid gap-2">
                <textarea
                  value={targetAlg}
                  onChange={(e) => setTargetAlg(e.target.value)}
                  placeholder={t.inputPlaceholder}
                  className="h-12 resize-none rounded-2xl border border-slate-300 bg-white px-3 py-3 font-mono text-sm leading-5 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-slate-400"
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <button onClick={loadAlgToPattern} className="rounded-xl border border-slate-300 px-3 py-2 text-sm transition hover:bg-slate-50 active:scale-95">{t.applyToNet}</button>
                  <button onClick={() => runSearch("alg")} disabled={isSearching} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:opacity-60">{t.searchFromAlg}</button>
                </div>
              </label>

              <div className="light-inner overflow-hidden rounded-3xl border border-slate-200 p-3 sm:p-4">
                <div className="mb-4 flex flex-wrap gap-2">
                  {[...FACE_ORDER, DONT_CARE].map((face) => (
                    <button key={face} onClick={() => setSelectedColor(face)} className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition active:scale-95 ${selectedColor === face ? "border-slate-900 bg-white shadow-md ring-2 ring-slate-400" : "border-slate-300 bg-white hover:bg-slate-50"}`}>
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-400 text-[10px] font-bold text-white" style={{ background: FACE_COLOR_STYLE[face] }}>{face === DONT_CARE ? "?" : ""}</span>
                    </button>
                  ))}
                </div>
                <NetEditor pattern={targetPattern} setPattern={setTargetPattern} selectedColor={selectedColor} />
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => runSearch("pattern")} disabled={isSearching} className="w-fit whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:opacity-60">{t.searchFromNet}</button>
            </div>

            <div className="grid items-start gap-4 sm:grid-cols-3">
              <label className="grid gap-1">
                <span className="text-sm font-semibold">{t.generator}</span>
                <input value={searchMovesText} onChange={(e) => setSearchMovesText(e.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-5 outline-none focus:ring-2 focus:ring-slate-400" placeholder="例: R U D / R U f / R U S / R U x" />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-semibold">{t.depthLimit}</span>
                <input type="number" value={maxSymbolDepth} onChange={(e) => setMaxSymbolDepth(Number(e.target.value))} className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-5 outline-none focus:ring-2 focus:ring-slate-400" />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-semibold">{t.resultLimit}</span>
                <input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-5 outline-none focus:ring-2 focus:ring-slate-400" />
              </label>
            </div>
          </div>
        </div>

        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <div className="mb-4">
          {isSearching ? <ThinkingCard foundCount={solutions.length} t={t} /> : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {solutions.map((solution, i) => <SolutionCard key={`${i}-${algToString(solution)}`} index={i + 1} solution={solution} t={t} showMoveCounts={showMoveCounts} />)}
        </div>

        {!isSearching && !error && hasSearched && solutions.length === 0 ? (
          <div className="mt-4"><EmptyCard text={t.noResults} /></div>
        ) : null}

        {!hasSearched && !isSearching ? (
          <div className="mt-4"><EmptyCard text={t.initialHelp} /></div>
        ) : null}
      </div>
    </div>
  );
}
