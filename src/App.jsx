import React, { useEffect, useMemo, useRef, useState } from "react";

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
        <span className="text-xs font-normal text-white">?</span>
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

function SolutionCard({ solution, t, showMoveCounts, onSave, onCopy }) {
  const displayAlg = formatWithSimulUD(solution);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="mb-3 flex justify-end gap-2">
        <button onClick={() => onCopy(displayAlg)} className="rounded-xl border border-slate-300 bg-white px-3 py-1 text-xs font-normal text-slate-700 transition hover:bg-slate-50 active:scale-95">{t.copy}</button>
        <button onClick={() => onSave(solution)} className="rounded-xl border border-slate-300 bg-white px-3 py-1 text-xs font-normal text-slate-700 transition hover:bg-slate-50 active:scale-95">{t.favorite}</button>
      </div>

      <div className="break-words font-mono text-base font-normal text-slate-900">
        {displayAlg || "(空)"}
      </div>

      {showMoveCounts ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-slate-100 p-2">
            <div className="text-slate-500">{t.simultaneous}</div>
            <div className="text-lg font-normal">{effectiveMoveCount(solution)}</div>
          </div>
          <div className="rounded-xl bg-slate-100 p-2">
            <div className="text-slate-500">{t.symbolMoves}</div>
            <div className="text-lg font-normal">{symbolMoveCount(solution)}</div>
          </div>
          <div className="rounded-xl bg-slate-100 p-2">
            <div className="text-slate-500">{t.quarterTurns}</div>
            <div className="text-lg font-normal">{quarterTurnCount(solution)}</div>
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
          <div className={`font-normal text-slate-900`}>{t.thinkingTitle}</div>
          <div className={`text-sm text-slate-600`}>{t.thinkingBody(foundCount)}</div>
        </div>
      </div>
    </div>
  );
}

function EmptyCard({ text, className = "" }) {
  return <div className={`rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 ${className}`}>{text}</div>;
}


const TEXT = {
  ja: {
    darkMode: "ダークモード",
    showMoveCounts: "手数を表示",
    language: "言語",
    shareUrl: "URL共有",
    saved: "保存済み",
    history: "履歴",
    presets: "プリセット",
    favorite: "保存",
    clear: "削除",
    copied: "コピーしました",
    inputPlaceholder: "既存の手順を入力…",
    searchFromAlg: "手順から探索",
    searching: "探索中…",
    netHint: "展開図からも入力できます…",
    openNet: "展開図を開く",
    closeNet: "展開図を閉じる",
    searchFromNet: "展開図から探索",
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
    shareUrl: "Share URL",
    saved: "Saved",
    history: "History",
    presets: "Presets",
    favorite: "Save",
    clear: "Clear",
    copied: "Copied",
    inputPlaceholder: "Enter an existing solution…",
    searchFromAlg: "Search from algorithm",
    searching: "Searching…",
    netHint: "You can also enter a pattern from the net…",
    openNet: "Open net",
    closeNet: "Close net",
    searchFromNet: "Search from net",
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
    shareUrl: "URL شیئر کریں",
    saved: "محفوظ",
    history: "تاریخچہ",
    presets: "پری سیٹ",
    favorite: "محفوظ کریں",
    clear: "حذف",
    copied: "کاپی ہو گیا",
    inputPlaceholder: "موجودہ حل کا طریقہ درج کریں…",
    searchFromAlg: "طریقے سے تلاش",
    searching: "تلاش جاری…",
    netHint: "آپ نیٹ سے بھی پیٹرن درج کر سکتے ہیں…",
    openNet: "نیٹ کھولیں",
    closeNet: "نیٹ بند کریں",
    searchFromNet: "نیٹ سے تلاش",
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
    shareUrl: "URL 공유",
    saved: "저장됨",
    history: "기록",
    presets: "프리셋",
    favorite: "저장",
    clear: "삭제",
    copied: "복사했습니다",
    inputPlaceholder: "기존 해법을 입력…",
    searchFromAlg: "알고리즘으로 탐색",
    searching: "탐색 중…",
    netHint: "전개도에서도 입력할 수 있습니다…",
    openNet: "전개도 열기",
    closeNet: "전개도 닫기",
    searchFromNet: "전개도에서 탐색",
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
    shareUrl: "URL साझा करें",
    saved: "सहेजे गए",
    history: "इतिहास",
    presets: "प्रीसेट",
    favorite: "सहेजें",
    clear: "हटाएँ",
    copied: "कॉपी हुआ",
    inputPlaceholder: "मौजूदा समाधान दर्ज करें…",
    searchFromAlg: "एल्गोरिदम से खोजें",
    searching: "खोज जारी…",
    netHint: "नेट से भी पैटर्न दर्ज कर सकते हैं…",
    openNet: "नेट खोलें",
    closeNet: "नेट बंद करें",
    searchFromNet: "नेट से खोजें",
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
    shareUrl: "مشاركة الرابط",
    saved: "محفوظ",
    history: "السجل",
    presets: "إعدادات جاهزة",
    favorite: "حفظ",
    clear: "حذف",
    copied: "تم النسخ",
    inputPlaceholder: "أدخل الحل الموجود…",
    searchFromAlg: "البحث من الخوارزمية",
    searching: "جارٍ البحث…",
    netHint: "يمكنك أيضًا إدخال النمط من المخطط…",
    openNet: "فتح المخطط",
    closeNet: "إغلاق المخطط",
    searchFromNet: "البحث من المخطط",
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

const PRESET_GENS = ["R U", "R U F", "R U D", "R U L", "R U f"];
const STORAGE_KEYS = {
  favorites: "cube-search-favorites-v1",
  history: "cube-search-history-v1",
};

function encodeShareState(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeShareState(text) {
  const padded = text.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function readStorageList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeStorageList(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

function createSearchWorker() {
  const source = `
const FACE_ORDER = ["U", "R", "F", "D", "L", "B"];
const SOLVED = Uint8Array.from({ length: 54 }, (_, i) => i);
const DONT_CARE = "X";
const NORMAL = {
  U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1],
};

${keyOf.toString()}
${facePos.toString()}
${buildStickers.toString()}
const built = buildStickers();
const STICKERS = built.stickers;
const INDEX_OF = built.indexOf;
${rot.toString()}
${makePerm.toString()}
${applyPerm.toString()}
${stateKey.toString()}
${composePerm.toString()}
${permPower.toString()}

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

${orientationPerms.toString()}
const ORIENTATION_PERMS = orientationPerms();
${orientationStates.toString()}
const SOLVED_ORIENTATIONS = orientationStates(SOLVED);
const TOKEN_RE = /([URFDLBMESxyzurfdlb](?:w)?)(2|')?/g;
${normalizeAlgText.toString()}
${parseAlg.toString()}
const MOVE_PERM_CACHE = new Map();
${moveToPerm.toString()}
${applyAlg.toString()}
${makeSearchMoves.toString()}
${inverseMove.toString()}
${inverseAlgList.toString()}
${algToString.toString()}
const PARALLEL_GROUP = ${JSON.stringify(PARALLEL_GROUP)};
const PARALLEL_GROUP_FACES = ${JSON.stringify(PARALLEL_GROUP_FACES)};
${parallelGroup.toString()}
${isParallelPair.toString()}
${moveToFacePower.toString()}
${facePowerToMove.toString()}
${simplifySameFace.toString()}
${compressParallelRuns.toString()}
${cleanMoves.toString()}
${symbolMoveCount.toString()}
${quarterTurnCount.toString()}
${effectiveMoveCount.toString()}
${symbolDelta.toString()}
${stickerFaceAt.toString()}
${patternToArray.toString()}
${countPatternColors.toString()}
${validatePattern.toString()}
${matchesPattern.toString()}
${matchesPatternUpToRotation.toString()}
${buildMovePerms.toString()}
${compareSolutions.toString()}

function expandOneSideWorker({ front, seenSelf, seenOther, movePerms, moves, sideSymbolLimit, solutionSet, expandingFromStart, maxSymbolDepth, shouldStop, onSolution }) {
  const newFront = new Map();

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
        if (symbolMoveCount(solution) > maxSymbolDepth) continue;
        const solutionKey = algToString(solution);
        if (solutionSet.has(solutionKey)) continue;
        solutionSet.add(solutionKey);
        onSolution(solution);
      }
    }
  }

  return newFront;
}

function bidirectionalBfsWorker({ start, goal = SOLVED, moves, maxSymbolDepth = 16, shouldStop, onSolution }) {
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
      frontA = expandOneSideWorker({ front: frontA, seenSelf: seenA, seenOther: seenB, movePerms, moves, sideSymbolLimit: sideSymbolLimitA, solutionSet, expandingFromStart: true, maxSymbolDepth, shouldStop, onSolution });
    } else {
      frontB = expandOneSideWorker({ front: frontB, seenSelf: seenB, seenOther: seenA, movePerms, moves, sideSymbolLimit: sideSymbolLimitB, solutionSet, expandingFromStart: false, maxSymbolDepth, shouldStop, onSolution });
    }
  }
}

function bfsPatternWorker({ pattern, moves, maxSymbolDepth = 16, shouldStop, onSolution }) {
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
        seen.set(key, { state: newState, path: newPath, symCost: newSymCost });
        newFront.set(key, { state: newState, path: newPath, symCost: newSymCost });

        if (matchesPatternUpToRotation(newState, patternArr)) {
          const solution = cleanMoves(newPath);
          const solutionKey = algToString(solution);
          if (!solutionSet.has(solutionKey)) {
            solutionSet.add(solutionKey);
            onSolution(solution);
          }
        }
      }
    }

    currentFront = newFront;
  }
}

${canAddMove.toString()}

self.onmessage = (event) => {
  const { mode, targetAlg, targetPattern, searchMovesText, maxSymbolDepth, limit } = event.data;
  let foundCount = 0;
  let stopByLimit = false;
  const foundKeys = new Set();
  const maxResults = Math.max(1, Number(limit) || 1);

  const shouldStop = () => stopByLimit;

  const onSolution = (solution) => {
    if (shouldStop()) return;
    const normalized = cleanMoves(solution);
    const key = algToString(normalized);
    if (foundKeys.has(key)) return;
    foundKeys.add(key);
    foundCount++;
    self.postMessage({ type: "solution", solution: normalized });
    if (foundCount >= maxResults) stopByLimit = true;
  };

  try {
    const moves = makeSearchMoves(searchMovesText);

    if (mode === "alg") {
      const inverseAlg = algToString(inverseAlgList(parseAlg(targetAlg)));
      const start = applyAlg(SOLVED, inverseAlg);
      bidirectionalBfsWorker({ start, goal: SOLVED, moves, maxSymbolDepth: Number(maxSymbolDepth), shouldStop, onSolution });
    } else {
      bfsPatternWorker({ pattern: targetPattern, moves, maxSymbolDepth: Number(maxSymbolDepth), shouldStop, onSolution });
    }

    self.postMessage({ type: "done" });
  } catch (e) {
    self.postMessage({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
`;

  const blob = new Blob([source], { type: "text/javascript" });
  return new Worker(URL.createObjectURL(blob));
}

export default function App() {
  const [isDark, setIsDark] = useState(false);
  const [showMoveCounts, setShowMoveCounts] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [language, setLanguage] = useState("ja");
  const t = TEXT[language];
  const [savedOpen, setSavedOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [history, setHistory] = useState([]);
  const [shareMessage, setShareMessage] = useState("");
  const [inputMode, setInputMode] = useState("alg");
  const [targetAlg, setTargetAlg] = useState("R' U R' U' y R' F' R2 U' R' U R' F R F y'");
  const [targetPattern, setTargetPattern] = useState(solvedPattern());
  const [selectedColor, setSelectedColor] = useState("F");
  const [netOpen, setNetOpen] = useState(false);
  const [searchMovesText, setSearchMovesText] = useState("R U D");
  const [maxSymbolDepth, setMaxSymbolDepth] = useState(16);
  const [limit, setLimit] = useState(5);
  const [solutions, setSolutions] = useState([]);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchSessionRef = useRef(0);
  const workerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  useEffect(() => {
    setFavorites(readStorageList(STORAGE_KEYS.favorites));
    setHistory(readStorageList(STORAGE_KEYS.history));

    const raw = window.location.hash.startsWith("#s=") ? window.location.hash.slice(3) : "";
    if (!raw) return;

    try {
      const data = decodeShareState(raw);
      if (typeof data.targetAlg === "string") setTargetAlg(data.targetAlg);
      if (data.targetPattern) setTargetPattern(data.targetPattern);
      if (typeof data.selectedColor === "string") setSelectedColor(data.selectedColor);
      if (typeof data.netOpen === "boolean") setNetOpen(data.netOpen);
      if (typeof data.searchMovesText === "string") setSearchMovesText(data.searchMovesText);
      if (Number.isFinite(data.maxSymbolDepth)) setMaxSymbolDepth(data.maxSymbolDepth);
      if (Number.isFinite(data.limit)) setLimit(data.limit);
      if (typeof data.isDark === "boolean") setIsDark(data.isDark);
      if (typeof data.showMoveCounts === "boolean") setShowMoveCounts(data.showMoveCounts);
      if (typeof data.language === "string" && TEXT[data.language]) setLanguage(data.language);
    } catch (_) {}
  }, []);

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
    setNetOpen(false);
    setSearchMovesText("R U D");
    setMaxSymbolDepth(16);
    setLimit(5);
    setSolutions([]);
    setError("");
    setIsSearching(false);
    setHasSearched(false);
  }

  function currentShareState() {
    return { targetAlg, targetPattern, selectedColor, netOpen, searchMovesText, maxSymbolDepth, limit, isDark, showMoveCounts, language };
  }

  async function shareUrl() {
    const hash = `#s=${encodeShareState(currentShareState())}`;
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    window.history.replaceState(null, "", hash);
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage(t.copied);
    } catch {
      setShareMessage(url);
    }
  }

  function saveHistoryItem(mode) {
    const item = { id: Date.now(), mode, targetAlg, targetPattern, searchMovesText, maxSymbolDepth, limit };
    const itemKey = JSON.stringify({ mode, targetAlg, targetPattern, searchMovesText, maxSymbolDepth, limit });
    const next = [item, ...history.filter((x) => JSON.stringify({ mode: x.mode, targetAlg: x.targetAlg, targetPattern: x.targetPattern, searchMovesText: x.searchMovesText, maxSymbolDepth: x.maxSymbolDepth, limit: x.limit }) !== itemKey)].slice(0, 12);
    setHistory(next);
    writeStorageList(STORAGE_KEYS.history, next);
  }

  function applyHistoryItem(item) {
    if (item.targetAlg !== undefined) setTargetAlg(item.targetAlg);
    if (item.targetPattern) setTargetPattern(item.targetPattern);
    if (item.searchMovesText !== undefined) setSearchMovesText(item.searchMovesText);
    if (item.maxSymbolDepth !== undefined) setMaxSymbolDepth(item.maxSymbolDepth);
    if (item.limit !== undefined) setLimit(item.limit);
    if (item.mode === "pattern") setNetOpen(true);
    setMenuOpen(false);
  }

  function saveFavoriteSolution(solution) {
    const alg = formatWithSimulUD(solution);
    const item = { id: Date.now(), alg };
    const next = [item, ...favorites.filter((x) => x.alg !== alg)].slice(0, 30);
    setFavorites(next);
    writeStorageList(STORAGE_KEYS.favorites, next);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      setShareMessage(t.copied);
    } catch (_) {}
  }

    async function runSearch(mode) {
    const currentSession = searchSessionRef.current + 1;
    searchSessionRef.current = currentSession;

    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    setInputMode(mode);
    setError("");
    setSolutions([]);
    setHasSearched(true);
    setIsSearching(true);
    saveHistoryItem(mode);

    const worker = createSearchWorker();
    workerRef.current = worker;

    worker.onmessage = (event) => {
      if (searchSessionRef.current !== currentSession) return;

      const data = event.data;

      if (data.type === "solution") {
        setSolutions((prev) => insertSolutionSorted(prev, data.solution, Math.max(1, Number(limit) || 1)));
        return;
      }

      if (data.type === "error") {
        setSolutions([]);
        setError(data.message);
        setIsSearching(false);
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
        return;
      }

      if (data.type === "done") {
        setIsSearching(false);
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      }
    };

    worker.onerror = (event) => {
      if (searchSessionRef.current !== currentSession) return;
      setError(event.message || "Worker error");
      setIsSearching(false);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };

    worker.postMessage({
      mode,
      targetAlg,
      targetPattern,
      searchMovesText,
      maxSymbolDepth: Number(maxSymbolDepth),
      limit: Math.max(1, Number(limit) || 1),
    });
  }

  return (
    <div className={`${isDark ? "dark-mode" : "light-shell"} min-h-screen px-4 pb-4 pt-16 text-slate-900 md:px-8 md:pb-8 md:pt-16`}>  
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

      <div className="fixed left-4 top-4 z-50">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="menu-button flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-300 bg-white text-xl font-normal text-slate-900 shadow-sm transition hover:bg-slate-50 active:scale-95"
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
              className={`menu-item flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-normal text-slate-900 transition hover:bg-slate-50 active:scale-95`}
            >
              <span>{t.darkMode}</span>
              <span>{isDark ? "ON" : "OFF"}</span>
            </button>
            <button
              onClick={() => setShowMoveCounts((v) => !v)}
              className={`menu-item mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-normal text-slate-900 transition hover:bg-slate-50 active:scale-95`}
            >
              <span>{t.showMoveCounts}</span>
              <span>{showMoveCounts ? "ON" : "OFF"}</span>
            </button>
            <button
              onClick={shareUrl}
              className="menu-item mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-normal text-slate-900 transition hover:bg-slate-50 active:scale-95"
            >
              <span>{t.shareUrl}</span>
              <span>↗</span>
            </button>
            <button
              onClick={() => setSavedOpen((v) => !v)}
              className="menu-item mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-normal text-slate-900 transition hover:bg-slate-50 active:scale-95"
            >
              <span>{t.saved}</span>
              <span>{savedOpen ? "▴" : favorites.length}</span>
            </button>
            {savedOpen ? (
              <div className="mt-2 max-h-52 overflow-auto rounded-xl border border-slate-200 p-2">
                {favorites.length ? favorites.map((item) => (
                  <button key={item.id} onClick={() => copyText(item.alg)} className="menu-item mb-1 block w-full rounded-xl px-3 py-2 text-left font-mono text-xs text-slate-900 transition hover:bg-slate-50 active:scale-95">{item.alg}</button>
                )) : <div className="px-3 py-2 text-xs text-slate-500">0</div>}
                {favorites.length ? <button onClick={() => { setFavorites([]); writeStorageList(STORAGE_KEYS.favorites, []); }} className="menu-item mt-2 w-full rounded-xl px-3 py-2 text-xs text-slate-900">{t.clear}</button> : null}
              </div>
            ) : null}
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="menu-item mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-normal text-slate-900 transition hover:bg-slate-50 active:scale-95"
            >
              <span>{t.history}</span>
              <span>{historyOpen ? "▴" : history.length}</span>
            </button>
            {historyOpen ? (
              <div className="mt-2 max-h-52 overflow-auto rounded-xl border border-slate-200 p-2">
                {history.length ? history.map((item) => (
                  <button key={item.id} onClick={() => applyHistoryItem(item)} className="menu-item mb-1 block w-full rounded-xl px-3 py-2 text-left text-xs text-slate-900 transition hover:bg-slate-50 active:scale-95">
                    <div className="font-mono">{item.searchMovesText}</div>
                    <div className="truncate text-slate-500">{item.mode === "alg" ? item.targetAlg : t.searchFromNet}</div>
                  </button>
                )) : <div className="px-3 py-2 text-xs text-slate-500">0</div>}
                {history.length ? <button onClick={() => { setHistory([]); writeStorageList(STORAGE_KEYS.history, []); }} className="menu-item mt-2 w-full rounded-xl px-3 py-2 text-xs text-slate-900">{t.clear}</button> : null}
              </div>
            ) : null}
            <button
              onClick={() => setLanguageOpen((v) => !v)}
              className={`menu-item mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-normal text-slate-900 transition hover:bg-slate-50 active:scale-95`}
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
                    className={`menu-item mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-normal text-slate-900 transition hover:bg-slate-50 active:scale-95 ${language === lang ? "ring-2 ring-slate-400" : ""}`}
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
        <h1 className="mb-6 text-center text-4xl font-normal tracking-tight text-slate-900 sm:text-5xl">
          手順探索
        </h1>
        <div className="light-panel mb-6 rounded-3xl p-6 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4">
            <div className="grid gap-4">
              <div className="light-inner rounded-3xl border border-slate-200 p-4 shadow-sm">
                <textarea
                  value={targetAlg}
                  onChange={(e) => setTargetAlg(e.target.value)}
                  placeholder={t.inputPlaceholder}
                  className={`h-14 w-full resize-none rounded-2xl border border-slate-300 bg-white px-3 py-4 font-mono text-sm leading-5 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-slate-400`}
                />
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button onClick={() => runSearch("alg")} disabled={isSearching} className={`rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-normal text-slate-900 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:opacity-60`}>{t.searchFromAlg}</button>
                </div>
              </div>

              <div className="light-inner overflow-hidden rounded-3xl border border-slate-200 p-3 sm:p-4">
                {!netOpen ? (
                  <button
                    type="button"
                    onClick={() => setNetOpen(true)}
                    className={`flex w-full items-center justify-between rounded-2xl border border-slate-300 bg-white px-4 py-3 text-left text-sm font-normal text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95`}
                  >
                    <span>{t.netHint}</span>
                    <span className="text-slate-500">▾</span>
                  </button>
                ) : (
                  <>
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        {[...FACE_ORDER, DONT_CARE].map((face) => (
                          <button key={face} onClick={() => setSelectedColor(face)} className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-normal transition active:scale-95 ${selectedColor === face ? "border-slate-900 bg-white shadow-md ring-2 ring-slate-400" : "border-slate-300 bg-white hover:bg-slate-50"}`}>
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-400 text-[10px] font-normal text-white" style={{ background: FACE_COLOR_STYLE[face] }}>{face === DONT_CARE ? "?" : ""}</span>
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setNetOpen(false)}
                        className={`rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95`}
                      >
                        {t.closeNet}
                      </button>
                    </div>
                    <NetEditor pattern={targetPattern} setPattern={setTargetPattern} selectedColor={selectedColor} />
                    <div className="mt-4 flex justify-end">
                      <button onClick={() => runSearch("pattern")} disabled={isSearching} className={`w-fit whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-normal text-slate-900 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:opacity-60`}>{t.searchFromNet}</button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="grid items-start gap-4 sm:grid-cols-3">
              <label className="grid gap-1">
                <span className={`text-sm font-normal`}>{t.generator}</span>
                <input value={searchMovesText} onChange={(e) => setSearchMovesText(e.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-5 outline-none focus:ring-2 focus:ring-slate-400" placeholder="例: R U D / R U f / R U S / R U x" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PRESET_GENS.map((preset) => (
                    <button key={preset} type="button" onClick={() => setSearchMovesText(preset)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-700 transition hover:bg-slate-50 active:scale-95">{preset}</button>
                  ))}
                </div>
              </label>
              <label className="grid gap-1">
                <span className={`text-sm font-normal`}>{t.depthLimit}</span>
                <input type="number" value={maxSymbolDepth} onChange={(e) => setMaxSymbolDepth(Number(e.target.value))} className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-5 outline-none focus:ring-2 focus:ring-slate-400" />
              </label>
              <label className="grid gap-1">
                <span className={`text-sm font-normal`}>{t.resultLimit}</span>
                <input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-5 outline-none focus:ring-2 focus:ring-slate-400" />
              </label>
            </div>
          </div>
        </div>

        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {shareMessage ? <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">{shareMessage}</div> : null}

        <div className="mb-4">
          {isSearching ? <ThinkingCard foundCount={solutions.length} t={t} /> : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {solutions.map((solution, i) => <SolutionCard key={`${i}-${algToString(solution)}`} solution={solution} t={t} showMoveCounts={showMoveCounts} onSave={saveFavoriteSolution} onCopy={copyText} />)}
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
