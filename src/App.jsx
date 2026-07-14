import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  COLL_PRESET_DATA,
  ZBLL_PRESET_DATA,
  ZBLS_F2L_PRESET_DATA,
  ZBLS_PRESET_DATA,
} from "./presetData.generated.js";

const FACE_ORDER = ["U", "R", "F", "D", "L", "B"];
const DONT_CARE = "X";
const NL = String.fromCharCode(10);
const SOLVED_STRING = FACE_ORDER.map((face) => face.repeat(9)).join("");
const NORMAL = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  R: [1, 0, 0],
  L: [-1, 0, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};
const FACE_COLOR_STYLE = {
  U: "#FFFFFF",
  R: "#B71234",
  F: "#009B48",
  D: "#FFD500",
  L: "#FF5800",
  B: "#0046AD",
  X: "#111111",
};
const FACE_LABEL = { U: "白", R: "赤", F: "緑", D: "黄", L: "橙", B: "青", X: "dont care" };
const OPPOSITE_FACE = { U: "D", D: "U", R: "L", L: "R", F: "B", B: "F" };
const PREFERRED_FRONT_BY_BOTTOM = { U: "F", D: "F", F: "U", B: "U", R: "F", L: "F" };
const FACE_AXIS = {
  U: { col: [1, 0, 0], row: [0, 0, -1] },
  D: { col: [1, 0, 0], row: [0, 0, 1] },
  F: { col: [1, 0, 0], row: [0, 1, 0] },
  B: { col: [-1, 0, 0], row: [0, 1, 0] },
  R: { col: [0, 0, -1], row: [0, 1, 0] },
  L: { col: [0, 0, 1], row: [0, 1, 0] },
};
const PARALLEL_GROUP = { U: "UD", D: "UD", R: "RL", L: "RL", F: "FB", B: "FB" };
const PARALLEL_GROUP_FACES = { UD: ["U", "D"], RL: ["R", "L"], FB: ["F", "B"] };
const TOKEN_RE = /([URFDLBMESxyzurfdlb](?:w)?)(2|')?/g;

function keyOf(pos, normal) {
  return `${pos.join(",")}|${normal.join(",")}`;
}

function facePos(face, r, c) {
  return {
    U: [c - 1, 1, r - 1],
    D: [c - 1, -1, 1 - r],
    F: [c - 1, 1 - r, 1],
    B: [1 - c, 1 - r, -1],
    R: [1, 1 - r, 1 - c],
    L: [-1, 1 - r, c - 1],
  }[face];
}

function buildStickers() {
  const stickers = [];
  const indexOf = new Map();
  for (const face of FACE_ORDER) {
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
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

function faceFromNormal(normal) {
  return FACE_ORDER.find((face) => NORMAL[face].every((value, index) => value === normal[index])) || "F";
}

function frontForBottom(bottomFace) {
  const preferred = PREFERRED_FRONT_BY_BOTTOM[bottomFace] || "F";
  if (preferred !== bottomFace && preferred !== OPPOSITE_FACE[bottomFace]) return preferred;
  return FACE_ORDER.find((face) => face !== bottomFace && face !== OPPOSITE_FACE[bottomFace]) || "F";
}

function displayColorMapForBottom(bottomFace) {
  const bottom = FACE_ORDER.includes(bottomFace) ? bottomFace : "D";
  const front = frontForBottom(bottom);
  const right = faceFromNormal(vecCross(NORMAL[front], NORMAL[bottom]));
  return {
    U: OPPOSITE_FACE[bottom],
    D: bottom,
    F: front,
    B: OPPOSITE_FACE[front],
    R: right,
    L: OPPOSITE_FACE[right],
    X: "X",
  };
}

function displayColorSymbol(color, bottomFace) {
  return displayColorMapForBottom(bottomFace)[color] || color;
}

function displayColorStyle(color, bottomFace) {
  return FACE_COLOR_STYLE[displayColorSymbol(color, bottomFace)] || FACE_COLOR_STYLE.X;
}

function vecCross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vecScale(v, scale) {
  return [v[0] * scale, v[1] * scale, v[2] * scale];
}

function vecAdd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vecNormalize(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function quatNormalize(q) {
  const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

function quatMultiply(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

function quatFromAxisAngle(axis, angle) {
  const unit = vecNormalize(axis);
  const half = angle / 2;
  const sin = Math.sin(half);
  return quatNormalize([Math.cos(half), unit[0] * sin, unit[1] * sin, unit[2] * sin]);
}

function quatRotate(q, v) {
  const u = [q[1], q[2], q[3]];
  const uv = vecCross(u, v);
  const uuv = vecCross(u, uv);
  return vecAdd(v, vecAdd(vecScale(uv, 2 * q[0]), vecScale(uuv, 2)));
}

const BASE_CUBE_VIEW_QUAT = quatNormalize(quatMultiply(quatFromAxisAngle([1, 0, 0], Math.PI / 6), quatFromAxisAngle([0, 1, 0], -Math.PI / 5)));

function rot(v, axis, direction) {
  const [x, y, z] = v;
  if (axis === "x") return [x, -direction * z, direction * y];
  if (axis === "y") return [direction * z, y, -direction * x];
  if (axis === "z") return [-direction * y, direction * x, z];
  throw new Error(`Unknown axis: ${axis}`);
}

function makePerm(axis, layers, direction) {
  const layerSet = new Set(layers);
  const axisIndex = { x: 0, y: 1, z: 2 }[axis];
  const perm = Array.from({ length: 54 }, (_, i) => i);
  for (let i = 0; i < STICKERS.length; i += 1) {
    const [pos, normal] = STICKERS[i];
    if (!layerSet.has(pos[axisIndex])) continue;
    perm[INDEX_OF.get(keyOf(rot(pos, axis, direction), rot(normal, axis, direction)))] = i;
  }
  return perm;
}

function composePerm(p, q) {
  const out = new Array(54);
  for (let i = 0; i < 54; i += 1) out[i] = p[q[i]];
  return out;
}

function permPower(p, n) {
  let result = Array.from({ length: 54 }, (_, i) => i);
  for (let i = 0; i < n; i += 1) result = composePerm(result, p);
  return result;
}

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

function normalizeAlgText(alg) {
  return String(alg)
    .replaceAll("’", "'")
    .replaceAll("＇", "'")
    .replace(/2'/g, "2")
    .replace(/([URFDLB])w/g, (_, face) => face.toLowerCase())
    .replaceAll(",", " ");
}

function parseAlg(alg) {
  const text = normalizeAlgText(alg);
  const moves = [];
  let pos = 0;
  TOKEN_RE.lastIndex = 0;
  for (;;) {
    const match = TOKEN_RE.exec(text);
    if (!match) break;
    if (text.slice(pos, match.index).trim()) throw new Error(`入力に読み取れない部分があります: ${text.slice(pos, match.index)}`);
    moves.push(match[1] + (match[2] || ""));
    pos = TOKEN_RE.lastIndex;
  }
  if (text.slice(pos).trim()) throw new Error(`入力に読み取れない部分があります: ${text.slice(pos)}`);
  return moves;
}

function inverseMove(move) {
  const base = move[0];
  if (move.endsWith("'")) return base;
  if (move.endsWith("2")) return move;
  return `${base}'`;
}

function inverseAlgList(moves) {
  return [...moves].reverse().map(inverseMove);
}

function algToString(moves) {
  return moves.join(" ");
}

function parallelGroup(move) {
  return PARALLEL_GROUP[move[0]] || null;
}

function isParallelPair(a, b) {
  const ga = parallelGroup(a);
  const gb = parallelGroup(b);
  return ga !== null && ga === gb && a[0] !== b[0];
}

function moveToFacePower(move) {
  let power = 1;
  if (move.endsWith("2")) power = 2;
  else if (move.endsWith("'")) power = 3;
  return [move[0], power];
}

function facePowerToMove(face, power) {
  const normalized = ((power % 4) + 4) % 4;
  if (normalized === 0) return null;
  if (normalized === 1) return face;
  if (normalized === 2) return `${face}2`;
  return `${face}'`;
}

function simplifySameFace(moves) {
  const result = [];
  for (const move of moves) {
    const [face, power] = moveToFacePower(move);
    if (result.length && result[result.length - 1][0] === face) {
      const [, prevPower] = moveToFacePower(result.pop());
      const next = facePowerToMove(face, prevPower + power);
      if (next) result.push(next);
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
      i += 1;
      continue;
    }
    const powers = {};
    for (const face of PARALLEL_GROUP_FACES[group]) powers[face] = 0;
    while (i < moves.length && parallelGroup(moves[i]) === group) {
      const [face, power] = moveToFacePower(moves[i]);
      powers[face] += power;
      i += 1;
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
  const cleaned = cleanMoves(moves);
  let count = 0;
  for (let i = 0; i < cleaned.length;) {
    if (i + 1 < cleaned.length && isParallelPair(cleaned[i], cleaned[i + 1])) {
      count += 1;
      i += 2;
    } else {
      count += 1;
      i += 1;
    }
  }
  return count;
}

function readabilityPenalty(moves) {
  const cleaned = cleanMoves(moves);
  let penalty = 0;
  for (const move of cleaned) {
    const face = move[0];
    if ("xyz".includes(face)) penalty += 80;
    if ("MES".includes(face)) penalty += 20;
  }
  return penalty;
}

const REGRIP_SUFFIXES_BY_FACE = {
  R: ["'3", "'2", "'", "", "2", "3"],
  U: ["'2", "'", "", "2"],
  D: ["'2", "'", "", "2"],
  F: ["'", "", "2"],
  B: ["'", "", "2"],
};
const REGRIP_ALLOWED = {
  "-2": {
    R: { "'3": false, "'2": false, "'": false, "": true, 2: true, 3: true },
    U: { "'2": true, "'": true, "": true, 2: false },
    D: { "'2": false, "'": true, "": true, 2: true },
    F: { "'": false, "": false, 2: false },
    B: { "'": false, "": false, 2: false },
  },
  "-1": {
    R: { "'3": false, "'2": false, "'": true, "": true, 2: true, 3: true },
    U: { "'2": true, "'": true, "": true, 2: false },
    D: { "'2": false, "'": true, "": true, 2: true },
    F: { "'": true, "": true, 2: true },
    B: { "'": true, "": true, 2: true },
  },
  0: {
    R: { "'3": false, "'2": true, "'": true, "": true, 2: true, 3: false },
    U: { "'2": true, "'": true, "": true, 2: true },
    D: { "'2": true, "'": true, "": true, 2: true },
    F: { "'": false, "": false, 2: false },
    B: { "'": false, "": false, 2: false },
  },
  1: {
    R: { "'3": true, "'2": true, "'": true, "": true, 2: false, 3: false },
    U: { "'2": true, "'": true, "": true, 2: false },
    D: { "'2": false, "'": true, "": true, 2: true },
    F: { "'": true, "": true, 2: true },
    B: { "'": true, "": true, 2: true },
  },
  2: {
    R: { "'3": true, "'2": true, "'": true, "": false, 2: false, 3: false },
    U: { "'2": true, "'": true, "": true, 2: false },
    D: { "'2": false, "'": true, "": true, 2: true },
    F: { "'": false, "": false, 2: false },
    B: { "'": false, "": false, 2: false },
  },
};
const REGRIP_COUNT_CACHE = new Map();
const SOLUTION_SORT_KEYS = ["effective", "symbol", "quarter", "regrip"];

function activeRegripThumbs(useBThumb = false) {
  return useBThumb ? [-2, -1, 0, 1, 2] : [-1, 0, 1];
}

function splitRegripMove(move) {
  const face = move[0];
  const suffix = move.slice(1);
  if (!FACE_ORDER.includes(face)) return null;
  if (!["", "'", "2", "'2", "3", "'3"].includes(suffix)) return null;
  return [face, suffix];
}

function equivalentPhysicalSuffixes(face, suffix) {
  if (face === "R") {
    if (suffix === "" || suffix === "'3") return ["", "'3"];
    if (suffix === "'" || suffix === "3") return ["'", "3"];
    if (suffix === "2" || suffix === "'2") return suffix === "2" ? ["2", "'2"] : ["'2", "2"];
  }
  if ((face === "U" || face === "D") && (suffix === "2" || suffix === "'2")) {
    return suffix === "2" ? ["2", "'2"] : ["'2", "2"];
  }
  return [suffix];
}

function choosePhysicalMoveForRegrip(move, thumb) {
  const parts = splitRegripMove(move);
  if (!parts) return null;
  const [face, suffix] = parts;
  const suffixes = REGRIP_SUFFIXES_BY_FACE[face];
  const allowedForThumb = REGRIP_ALLOWED[thumb]?.[face];
  if (!suffixes || !allowedForThumb) return null;
  for (const physicalSuffix of equivalentPhysicalSuffixes(face, suffix)) {
    if (suffixes.includes(physicalSuffix) && allowedForThumb[physicalSuffix]) return face + physicalSuffix;
  }
  return null;
}

function nextRegripThumb(move, thumb) {
  const physicalMove = choosePhysicalMoveForRegrip(move, thumb);
  if (!physicalMove) return null;
  const [face, suffix] = splitRegripMove(physicalMove);
  if (face !== "R") return thumb;
  const delta = { "'3": -3, "'2": -2, "'": -1, "": 1, 2: 2, 3: 3 }[suffix];
  const next = thumb + delta;
  return REGRIP_ALLOWED[next] ? next : null;
}

function countRegripsFromStart(moves, startThumb, useBThumb = false) {
  const activeThumbs = activeRegripThumbs(useBThumb);
  let states = new Map([[startThumb, 0]]);
  for (const move of moves) {
    const nextStates = new Map();
    for (const [thumb, cost] of states) {
      const nextThumb = nextRegripThumb(move, thumb);
      if (nextThumb !== null && activeThumbs.includes(nextThumb)) {
        const oldCost = nextStates.get(nextThumb);
        if (oldCost === undefined || cost < oldCost) nextStates.set(nextThumb, cost);
        continue;
      }
      for (const regrippedThumb of activeThumbs) {
        if (regrippedThumb === thumb) continue;
        const nextAfterRegrip = nextRegripThumb(move, regrippedThumb);
        if (nextAfterRegrip === null || !activeThumbs.includes(nextAfterRegrip)) continue;
        const newCost = cost + 1;
        const oldCost = nextStates.get(nextAfterRegrip);
        if (oldCost === undefined || newCost < oldCost) nextStates.set(nextAfterRegrip, newCost);
      }
    }
    if (!nextStates.size) return null;
    states = nextStates;
  }
  return Math.min(...states.values());
}

function regripCount(moves) {
  const cleaned = cleanMoves(moves);
  const key = algToString(cleaned);
  if (REGRIP_COUNT_CACHE.has(key)) return REGRIP_COUNT_CACHE.get(key);
  let best = Infinity;
  for (const startThumb of activeRegripThumbs(false)) {
    const count = countRegripsFromStart(cleaned, startThumb, false);
    if (count !== null) best = Math.min(best, count);
  }
  const result = Number.isFinite(best) ? best : null;
  REGRIP_COUNT_CACHE.set(key, result);
  return result;
}

function regripSortValue(moves) {
  const count = regripCount(moves);
  return count === null ? Number.POSITIVE_INFINITY : count;
}

function solutionMetricValue(solution, sortKey) {
  if (sortKey === "symbol") return symbolMoveCount(solution);
  if (sortKey === "quarter") return quarterTurnCount(solution);
  if (sortKey === "regrip") return regripSortValue(solution);
  return effectiveMoveCount(solution);
}

function compareSolutions(a, b, sortKey = "effective") {
  const fallbackKeys = sortKey === "regrip"
    ? ["regrip", "effective", "symbol", "quarter"]
    : [sortKey, "regrip", "effective", "symbol", "quarter"];
  const seen = new Set();
  for (const key of fallbackKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const av = solutionMetricValue(a, key);
    const bv = solutionMetricValue(b, key);
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  const readabilityA = readabilityPenalty(a);
  const readabilityB = readabilityPenalty(b);
  if (readabilityA !== readabilityB) return readabilityA - readabilityB;
  return algToString(a).localeCompare(algToString(b));
}

function sortedSolutions(solutions, sortKey) {
  return [...solutions].sort((a, b) => compareSolutions(a, b, sortKey));
}

function formatWithSimulUD(moves) {
  const cleaned = cleanMoves(moves);
  const parts = [];
  for (let i = 0; i < cleaned.length;) {
    if (i + 1 < cleaned.length && isParallelPair(cleaned[i], cleaned[i + 1])) {
      parts.push(`( ${cleaned[i]} ${cleaned[i + 1]} )`);
      i += 2;
    } else {
      parts.push(cleaned[i]);
      i += 1;
    }
  }
  return parts.join(" ");
}

function applyPermToString(state, perm) {
  let next = "";
  for (let i = 0; i < 54; i += 1) next += state[perm[i]];
  return next;
}

function solvedPattern() {
  const pattern = {};
  for (const face of FACE_ORDER) pattern[face] = Array(9).fill(face);
  return pattern;
}

function clonePattern(pattern) {
  const next = {};
  for (const face of FACE_ORDER) next[face] = [...pattern[face]];
  return next;
}

function makePattern(faces) {
  const pattern = solvedPattern();
  for (const face of FACE_ORDER) if (faces[face]) pattern[face] = [...faces[face]];
  return pattern;
}

function stateStringToPattern(state) {
  const pattern = {};
  let pos = 0;
  for (const face of FACE_ORDER) {
    pattern[face] = state.slice(pos, pos + 9).split("");
    pos += 9;
  }
  return pattern;
}

const MOVE_PERM_CACHE = new Map();
function moveToPerm(move) {
  if (MOVE_PERM_CACHE.has(move)) return MOVE_PERM_CACHE.get(move);
  const base = move[0];
  if (!BASE[base]) throw new Error(`対応していない記号です: ${base}`);
  const perm = move.endsWith("2") ? permPower(BASE[base], 2) : move.endsWith("'") ? permPower(BASE[base], 3) : BASE[base];
  MOVE_PERM_CACHE.set(move, perm);
  return perm;
}

function applyAlgToString(state, alg) {
  let current = state;
  for (const move of parseAlg(alg)) current = applyPermToString(current, moveToPerm(move));
  return current;
}

function patternFromAlg(alg) {
  const inverse = algToString(inverseAlgList(parseAlg(alg)));
  return stateStringToPattern(applyAlgToString(SOLVED_STRING, inverse));
}

function insertSolutionUnique(list, solution) {
  const normalized = cleanMoves(solution);
  const key = algToString(normalized);
  if (list.some((x) => algToString(x) === key)) return list;
  return [...list, normalized];
}

const LANGUAGE_LABEL = { ja: "日本語", en: "English", ur: "اردو", ko: "한국어", hi: "हिन्दी", ar: "العربية" };
const PRESET_GENS = ["R U", "R U F", "R U D", "R U L", "R U f"];
const REQUIRED_PART_PRESETS = ["R U R' U'", "U R U' R'", "R' F R F'", "F R' F' R"];
const TEXT = {
  ja: { title: "手順探索", darkMode: "ダークモード", showMoveCounts: "手数を表示", netInput: "入力方式", language: "言語", shareUrl: "URL共有", saved: "保存済み", history: "履歴", favorite: "保存", clear: "削除", copied: "コピーしました", unsafeContinue: "上限なしで続ける", inputPlaceholder: "既存の手順を入力…", searchFromAlg: "手順から探索", searchFromNet: "展開図から探索", algMode: "手順", netMode: "展開図", casePresets: "状態プリセット", generator: "生成系", requiredParts: "必須パーツ", requiredPartsPlaceholder: "例: R U R' U'", depthLimit: "手数上限", resultLimit: "表示件数", copy: "コピー", simultaneous: "同時回し", symbolMoves: "記号手数", quarterTurns: "90度手数", thinkingTitle: "探索中…", thinkingBody: (n) => `見つかった手順から順に表示しています。現在 ${n} 件。`, noResults: "条件に一致する手順が見つかりませんでした。", searchFinished: (n) => `${n}件の結果が見つかりました。`, initialHelp: "条件を入力して、探索を開始してください。" },
  en: { title: "Algorithm Search", darkMode: "Dark mode", showMoveCounts: "Show move counts", netInput: "Input mode", language: "Language", shareUrl: "Share URL", saved: "Saved", history: "History", favorite: "Save", clear: "Clear", copied: "Copied", unsafeContinue: "Continue without limit", inputPlaceholder: "Enter an existing solution…", searchFromAlg: "Search from algorithm", searchFromNet: "Search from net", algMode: "Algorithm", netMode: "Net", casePresets: "State presets", generator: "Generator", requiredParts: "Required parts", requiredPartsPlaceholder: "e.g. R U R' U'", depthLimit: "Move limit", resultLimit: "Results", copy: "Copy", simultaneous: "Simul moves", symbolMoves: "Move count", quarterTurns: "Quarter turns", thinkingTitle: "Searching…", thinkingBody: (n) => `Showing results as they are found. ${n} found so far.`, noResults: "No matching algorithms found.", searchFinished: (n) => `${n} result${n === 1 ? "" : "s"} found.`, initialHelp: "Enter conditions and start searching." },
  ur: { title: "طریقہ تلاش", darkMode: "ڈارک موڈ", showMoveCounts: "چالوں کی گنتی دکھائیں", netInput: "طریقۂ اندراج", language: "زبان", shareUrl: "URL شیئر کریں", saved: "محفوظ", history: "تاریخچہ", favorite: "محفوظ کریں", clear: "حذف", copied: "کاپی ہو گیا", unsafeContinue: "حد کے بغیر جاری رکھیں", inputPlaceholder: "موجودہ حل کا طریقہ درج کریں…", searchFromAlg: "طریقے سے تلاش", searchFromNet: "نیٹ سے تلاش", algMode: "طریقہ", netMode: "نیٹ", casePresets: "حالت presets", generator: "جنریٹر", requiredParts: "لازمی حصہ", requiredPartsPlaceholder: "مثال: R U R' U'", depthLimit: "چالوں کی حد", resultLimit: "نتائج", copy: "کاپی", simultaneous: "ساتھ چالیں", symbolMoves: "چالوں کی گنتی", quarterTurns: "کوارٹر ٹرنز", thinkingTitle: "تلاش جاری…", thinkingBody: (n) => `ملنے والے طریقے فوراً دکھائے جا رہے ہیں۔ اب تک ${n} ملے۔`, noResults: "شرائط سے ملتا ہوا کوئی طریقہ نہیں ملا۔", searchFinished: (n) => `${n} نتائج ملے۔`, initialHelp: "شرائط درج کریں اور تلاش شروع کریں۔" },
  ko: { title: "수순 탐색", darkMode: "다크 모드", showMoveCounts: "수순 수 표시", netInput: "입력 방식", language: "언어", shareUrl: "URL 공유", saved: "저장됨", history: "기록", favorite: "저장", clear: "삭제", copied: "복사했습니다", unsafeContinue: "제한 없이 계속", inputPlaceholder: "기존 해법을 입력…", searchFromAlg: "알고리즘으로 탐색", searchFromNet: "전개도에서 탐색", algMode: "알고리즘", netMode: "전개도", casePresets: "상태 프리셋", generator: "생성계", requiredParts: "필수 파트", requiredPartsPlaceholder: "예: R U R' U'", depthLimit: "수순 제한", resultLimit: "표시 개수", copy: "복사", simultaneous: "동시 회전", symbolMoves: "기호 수", quarterTurns: "90도 회전 수", thinkingTitle: "탐색 중…", thinkingBody: (n) => `찾은 수순을 순서대로 표시하고 있습니다. 현재 ${n}개.`, noResults: "조건에 맞는 수순을 찾지 못했습니다.", searchFinished: (n) => `${n}개 결과를 찾았습니다.`, initialHelp: "조건을 입력하고 탐색을 시작하세요." },
  hi: { title: "एल्गोरिदम खोज", darkMode: "डार्क मोड", showMoveCounts: "चालों की संख्या दिखाएँ", netInput: "इनपुट मोड", language: "भाषा", shareUrl: "URL साझा करें", saved: "सहेजे गए", history: "इतिहास", favorite: "सहेजें", clear: "हटाएँ", copied: "कॉपी हुआ", unsafeContinue: "सीमा के बिना जारी रखें", inputPlaceholder: "मौजूदा समाधान दर्ज करें…", searchFromAlg: "एल्गोरिदम से खोजें", searchFromNet: "नेट से खोजें", algMode: "एल्गोरिदम", netMode: "नेट", casePresets: "स्टेट प्रीसेट", generator: "जनरेटर", requiredParts: "ज़रूरी भाग", requiredPartsPlaceholder: "उदाहरण: R U R' U'", depthLimit: "चाल सीमा", resultLimit: "परिणाम संख्या", copy: "कॉपी", simultaneous: "साथ-साथ चालें", symbolMoves: "चालों की संख्या", quarterTurns: "90° चालें", thinkingTitle: "खोज जारी…", thinkingBody: (n) => `मिले हुए तरीके क्रम से दिखाए जा रहे हैं। अभी तक ${n} मिले।`, noResults: "शर्तों से मिलता कोई तरीका नहीं मिला।", searchFinished: (n) => `${n} परिणाम मिले।`, initialHelp: "शर्तें दर्ज करें और खोज शुरू करें।" },
  ar: { title: "البحث عن الخوارزميات", darkMode: "الوضع الداكن", showMoveCounts: "إظهار عدد الحركات", netInput: "طريقة الإدخال", language: "اللغة", shareUrl: "مشاركة الرابط", saved: "محفوظ", history: "السجل", favorite: "حفظ", clear: "حذف", copied: "تم النسخ", unsafeContinue: "المتابعة بلا حد", inputPlaceholder: "أدخل الحل الموجود…", searchFromAlg: "البحث من الخوارزمية", searchFromNet: "البحث من المخطط", algMode: "الخوارزمية", netMode: "المخطط", casePresets: "إعدادات الحالة", generator: "المولد", requiredParts: "جزء إلزامي", requiredPartsPlaceholder: "مثال: R U R' U'", depthLimit: "حد الحركات", resultLimit: "عدد النتائج", copy: "نسخ", simultaneous: "حركات متزامنة", symbolMoves: "عدد الحركات", quarterTurns: "دورات 90°", thinkingTitle: "جارٍ البحث…", thinkingBody: (n) => `يتم عرض النتائج فور العثور عليها. تم العثور على ${n} حتى الآن.`, noResults: "لم يتم العثور على خوارزميات مطابقة.", searchFinished: (n) => `تم العثور على ${n} نتيجة.`, initialHelp: "أدخل الشروط وابدأ البحث." },
};

const SORT_BY_LABEL = { ja: "並び順", en: "Sort", ur: "Sort", ko: "정렬", hi: "Sort", ar: "Sort" };
const REGRIP_LABEL = { ja: "リグリップ", en: "Regrips", ur: "Regrips", ko: "리그립", hi: "Regrips", ar: "Regrips" };
const SOLUTION_SORT_LABELS = {
  effective: { ja: "同時回し順", en: "Simul", ur: "Simul", ko: "동시 회전", hi: "Simul", ar: "Simul" },
  symbol: { ja: "記号手数順", en: "Moves", ur: "Moves", ko: "기호 수", hi: "Moves", ar: "Moves" },
  quarter: { ja: "90度手数順", en: "Quarter", ur: "Quarter", ko: "90도", hi: "Quarter", ar: "Quarter" },
  regrip: { ja: "リグリップ順", en: "Regrips", ur: "Regrips", ko: "리그립", hi: "Regrips", ar: "Regrips" },
};

function localizedLabel(labels, language) {
  return labels[language] || labels.en || labels.ja || "";
}

function cellToU(cell) { return cell === "1" ? "U" : "X"; }
function patternFromOllPreviewMask(previewMask) {
  const rows = String(previewMask).match(/.{1,5}/g) || [];
  return makePattern({
    U: [cellToU(rows[1]?.[1]), cellToU(rows[1]?.[2]), cellToU(rows[1]?.[3]), cellToU(rows[2]?.[1]), cellToU(rows[2]?.[2]), cellToU(rows[2]?.[3]), cellToU(rows[3]?.[1]), cellToU(rows[3]?.[2]), cellToU(rows[3]?.[3])],
    L: [cellToU(rows[1]?.[0]), cellToU(rows[2]?.[0]), cellToU(rows[3]?.[0]), "L", "L", "L", "L", "L", "L"],
    F: [cellToU(rows[4]?.[1]), cellToU(rows[4]?.[2]), cellToU(rows[4]?.[3]), "F", "F", "F", "F", "F", "F"],
    R: [cellToU(rows[3]?.[4]), cellToU(rows[2]?.[4]), cellToU(rows[1]?.[4]), "R", "R", "R", "R", "R", "R"],
    B: [cellToU(rows[0]?.[3]), cellToU(rows[0]?.[2]), cellToU(rows[0]?.[1]), "B", "B", "B", "B", "B", "B"],
    D: ["D", "D", "D", "D", "D", "D", "D", "D", "D"],
  });
}
function makeOllCase(number, previewMask) { return { id: `oll-${number}`, number, previewMask, pattern: patternFromOllPreviewMask(previewMask) }; }
const OLL_PREVIEW_MASKS = [
  "x010x100011010110001x010x", "x011x100001010110000x011x", "x110x000011010101000x011x", "x011x100001010100010x110x", "x110x000011011010110x000x", "x000x101101011000001x110x", "x100x001010110101000x011x", "x001x101001011000010x110x", "x010x100100110100101x100x", "x110x000100110110100x001x",
  "x110x000011011001100x001x", "x010x100101011000101x100x", "x110x000010111001000x011x", "x011x100000111000010x110x", "x110x000010111010010x010x", "x010x100100111000001x110x", "x011x010001010110010x010x", "x010x010101010100000x111x", "x010x010101010110001x010x", "x010x010101010101010x010x",
  "x000x101010111010101x000x", "x001x101000111010100x001x", "x000x011100111000100x101x", "x100x001100111000110x100x", "x000x011010111000110x100x", "x001x011000111000101x100x", "x100x001010111001100x001x", "x000x011100110101010x010x", "x010x010100110110101x000x", "x010x010101011010101x000x",
  "x100x001101011000010x110x", "x110x000101011000110x100x", "x110x000100111000010x110x", "x010x010100111010001x010x", "x010x010011011000110x100x", "x010x010010110100110x100x", "x000x011010110100010x110x", "x100x001100110101001x010x", "x001x011001010110110x000x", "x000x101101010101100x001x",
  "x010x010101011000100x101x", "x010x010100110100100x101x", "x010x010010110101101x000x", "x010x100101011010110x000x", "x010x100100111010010x010x", "x000x011011010101101x000x", "x100x001011011000001x110x", "x001x101000110110000x011x", "x110x000010110100101x100x", "x011x100001011010100x001x",
  "x011x100000111010000x011x", "x100x001011010100101x100x", "x010x100011011010101x000x", "x000x101011011010001x010x", "x000x101011010110101x000x", "x010x100010111010001x010x", "x010x010100111001010x010x",
];
const OLL_CASES = OLL_PREVIEW_MASKS.map((previewMask, index) => makeOllCase(index + 1, previewMask));
const PLL_ALGS = [
  ["Aa", "R' F R' B2 R F' R' B2 R2"],
  ["Ab", "x R2 D2 R U R' D2 R U' R x'"],
  ["E", "R' U L' D2 L U' R L' U R' D2 R U' L"],
  ["F", "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R"],
  ["Ga", "R2 U R' U R' U' R U' R2 D U' R' U R D'"],
  ["Gb", "R' U' R U D' R2 U R' U R U' R U' R2 D"],
  ["Gc", "R2 U' R U' R U R' U R2 D' U R U' R' D"],
  ["Gd", "R U R' U' D R2 U' R U' R' U R' U R2 D'"],
  ["H", "M2 U M2 U2 M2 U M2"],
  ["Ja", "x R2 F R F' R U2 r' U r U2 x'"],
  ["Jb", "R U R' F' R U R' U' R' F R2 U' R' U'"],
  ["Na", "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'"],
  ["Nb", "R' U R U' R' F' U' F R U R' F R' F' R U' R"],
  ["Ra", "R U R' F' R U2 R' U2 R' F R U R U2 R'"],
  ["Rb", "R' U2 R U2 R' F R U R' U' R' F' R2"],
  ["T", "R U R' U' R' F R2 U' R' U' R U R' F'"],
  ["Ua", "R U' R U R U R U' R' U' R2"],
  ["Ub", "R2 U R U R' U' R' U' R' U R'"],
  ["V", "R' U R' U' R D' R' D R' U D' R2 U' R2 D R2"],
  ["Y", "F R U' R' U' R U R' F' R U R' U' R' F R F'"],
  ["Z", "M' U' M2 U' M2 U' M' U2 M2 U"],
];
const PLL_CASES = PLL_ALGS.map(([label, alg], index) => ({ id: `pll-${index + 1}-${label.toLowerCase()}`, label, alg, pattern: patternFromAlg(alg) }));

const COLL_FAMILY_META = [
  { id: "H", label: "H" },
  { id: "Pi", label: "Pi" },
  { id: "U", label: "U" },
  { id: "T", label: "T" },
  { id: "L", label: "L" },
  { id: "S", label: "Sune" },
  { id: "AS", label: "Anti Sune" },
];

function patternFromPresetState(state) {
  return stateStringToPattern(state);
}

function collPreviewPattern(pattern) {
  const preview = clonePattern(pattern);
  for (const index of [1, 3, 5, 7]) preview.U[index] = DONT_CARE;
  for (const face of ["B", "L", "F", "R"]) preview[face][1] = DONT_CARE;
  return preview;
}

const COLL_CASES = COLL_PRESET_DATA.map((record) => ({
  id: record.id,
  family: record.family,
  label: record.name,
  seedAlg: record.solution,
  pattern: patternFromPresetState(record.state),
  previewPattern: collPreviewPattern(patternFromPresetState(record.state)),
}));

const COLL_GROUPS = COLL_FAMILY_META.map((family) => {
  const cases = COLL_CASES.filter((record) => record.family === family.id);
  return {
    ...family,
    label: `${family.label} (${cases.length})`,
    preview: cases[0].previewPattern,
    cases,
  };
});

const ZBLL_GROUPS = COLL_GROUPS.map((family) => ({
  ...family,
  cases: family.cases.map((collCase) => {
    const zbllCases = ZBLL_PRESET_DATA
      .filter((record) => record.coll === collCase.label)
      .map((record) => ({
        id: record.id,
        family: record.family,
        collId: collCase.id,
        label: record.name.replace(/\s+/g, ""),
        seedAlg: record.solution,
        pattern: patternFromPresetState(record.state),
      }));
    return { ...collCase, zbllCases };
  }),
}));

const ZBLL_CASES = ZBLL_GROUPS.flatMap((family) => (
  family.cases.flatMap((collCase) => collCase.zbllCases)
));

const ZBLS_CASES = ZBLS_PRESET_DATA.map((record) => ({
  id: record.id,
  f2lId: record.f2l,
  label: `EO${String(record.eo).padStart(2, "0")}`,
  pattern: patternFromPresetState(record.state),
}));

const ZBLS_GROUPS = ZBLS_F2L_PRESET_DATA.map((record) => ({
  id: record.id,
  label: record.label,
  title: record.solved ? `${record.title} (solved)` : record.title,
  kind: record.kind,
  solved: record.solved,
  preview: patternFromPresetState(record.state),
  cases: ZBLS_CASES.filter((preset) => preset.f2lId === record.id),
}));

const CASE_PRESETS = {
  OLL: OLL_CASES,
  PLL: PLL_CASES,
  COLL: COLL_CASES,
  ZBLL: ZBLL_CASES,
  ZBLS: ZBLS_CASES,
};
const CASE_PRESET_CATEGORIES = Object.keys(CASE_PRESETS);
const STORAGE_KEYS = { favorites: "cube-search-favorites-v1", history: "cube-search-history-v1" };
function encodeShareState(obj) { const bytes = new TextEncoder().encode(JSON.stringify(obj)); let binary = ""; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
function decodeShareState(text) { const padded = text.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((text.length + 3) % 4); const binary = atob(padded); const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0)); return JSON.parse(new TextDecoder().decode(bytes)); }
function readStorageList(key) { try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
function writeStorageList(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
function readInitialShareState() {
  if (typeof window === "undefined" || !window.location.hash.startsWith("#s=")) return {};
  try {
    return decodeShareState(window.location.hash.slice(3));
  } catch {
    return {};
  }
}

function workerMain() {
  const FACE_ORDER = ["U", "R", "F", "D", "L", "B"];
  const SOLVED = FACE_ORDER.map((face) => face.repeat(9)).join("");
  const DONT_CARE = "X";
  const MAX_STORED_STATES = 10000000;
  const FAST_REWRITE_MAX_DEPTH = 8;
  const FAST_RESTRICTED_STATE_BUDGET = 10000000;
  const FAST_PARTIAL_RESTRICTED_STATE_BUDGET = 2000000;
  const FAST_REWRITE_STATE_BUDGET = 2000000;
  const FAST_PATTERN_SEED_STATE_BUDGET = 1000000;
  const NL = String.fromCharCode(10);
  const TOKEN_RE = /([URFDLBMESxyzurfdlb](?:w)?)(2|')?/g;
  const NORMAL = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
  const PARALLEL_GROUP = { U: "UD", D: "UD", R: "RL", L: "RL", F: "FB", B: "FB" };
  const PARALLEL_GROUP_FACES = { UD: ["U", "D"], RL: ["R", "L"], FB: ["F", "B"] };
  let CURRENT_JOB = null;

  function keyOf(pos, normal) { return pos.join(",") + "|" + normal.join(","); }
  function facePos(face, r, c) { return { U: [c - 1, 1, r - 1], D: [c - 1, -1, 1 - r], F: [c - 1, 1 - r, 1], B: [1 - c, 1 - r, -1], R: [1, 1 - r, 1 - c], L: [-1, 1 - r, c - 1] }[face]; }
  function buildStickers() { const stickers = []; const indexOf = new Map(); for (const face of FACE_ORDER) for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) { const pos = facePos(face, r, c); const normal = NORMAL[face]; indexOf.set(keyOf(pos, normal), stickers.length); stickers.push([pos, normal]); } return { stickers, indexOf }; }
  const built = buildStickers();
  const STICKERS = built.stickers;
  const INDEX_OF = built.indexOf;
  function rot(v, axis, direction) { const x = v[0], y = v[1], z = v[2]; if (axis === "x") return [x, -direction * z, direction * y]; if (axis === "y") return [direction * z, y, -direction * x]; if (axis === "z") return [-direction * y, direction * x, z]; throw new Error("Unknown axis: " + axis); }
  function makePerm(axis, layers, direction) { const layerSet = new Set(layers); const axisIndex = { x: 0, y: 1, z: 2 }[axis]; const perm = Array.from({ length: 54 }, (_, i) => i); for (let i = 0; i < STICKERS.length; i += 1) { const pos = STICKERS[i][0]; const normal = STICKERS[i][1]; if (!layerSet.has(pos[axisIndex])) continue; perm[INDEX_OF.get(keyOf(rot(pos, axis, direction), rot(normal, axis, direction)))] = i; } return perm; }
  function composePerm(p, q) { const out = new Array(54); for (let i = 0; i < 54; i += 1) out[i] = p[q[i]]; return out; }
  function permPower(p, n) { let result = Array.from({ length: 54 }, (_, i) => i); for (let i = 0; i < n; i += 1) result = composePerm(result, p); return result; }
  const BASE = { U: makePerm("y", [1], -1), D: makePerm("y", [-1], 1), R: makePerm("x", [1], -1), L: makePerm("x", [-1], 1), F: makePerm("z", [1], -1), B: makePerm("z", [-1], 1), M: makePerm("x", [0], 1), E: makePerm("y", [0], 1), S: makePerm("z", [0], -1), x: makePerm("x", [-1, 0, 1], -1), y: makePerm("y", [-1, 0, 1], -1), z: makePerm("z", [-1, 0, 1], -1), u: makePerm("y", [0, 1], -1), d: makePerm("y", [-1, 0], 1), r: makePerm("x", [0, 1], -1), l: makePerm("x", [-1, 0], 1), f: makePerm("z", [0, 1], -1), b: makePerm("z", [-1, 0], 1) };
  const MOVE_PERM_CACHE = new Map();

  function normalizeAlgText(alg) { return String(alg).replaceAll("’", "'").replaceAll("＇", "'").replace(/2'/g, "2").replace(/([URFDLB])w/g, (_, face) => face.toLowerCase()).replaceAll(",", " "); }
  function parseAlg(alg) { const text = normalizeAlgText(alg); const moves = []; let pos = 0; TOKEN_RE.lastIndex = 0; for (;;) { const match = TOKEN_RE.exec(text); if (!match) break; if (text.slice(pos, match.index).trim()) throw new Error("入力に読み取れない部分があります: " + text.slice(pos, match.index)); moves.push(match[1] + (match[2] || "")); pos = TOKEN_RE.lastIndex; } if (text.slice(pos).trim()) throw new Error("入力に読み取れない部分があります: " + text.slice(pos)); return moves; }
  function moveToPerm(move) { if (MOVE_PERM_CACHE.has(move)) return MOVE_PERM_CACHE.get(move); const base = move[0]; if (!BASE[base]) throw new Error("対応していない記号です: " + base); const perm = move.endsWith("2") ? permPower(BASE[base], 2) : move.endsWith("'") ? permPower(BASE[base], 3) : BASE[base]; MOVE_PERM_CACHE.set(move, perm); return perm; }
  function applyPerm(state, perm) { let next = ""; for (let i = 0; i < 54; i += 1) next += state[perm[i]]; return next; }
  function applyAlg(state, alg) { let current = state; for (const move of parseAlg(alg)) current = applyPerm(current, moveToPerm(move)); return current; }
  function makeSearchMoves(text) { const faces = []; for (const move of parseAlg(text)) { const face = move[0]; if (!BASE[face]) throw new Error("対応していない記号です: " + face); if (!faces.includes(face)) faces.push(face); } return faces.flatMap((face) => [face, face + "'", face + "2"]); }
  function inverseMove(move) { const base = move[0]; if (move.endsWith("'")) return base; if (move.endsWith("2")) return move; return base + "'"; }
  function inverseAlgList(moves) { return moves.slice().reverse().map(inverseMove); }
  function algToString(moves) { return moves.join(" "); }
  function parseRequiredParts(text) { return String(text || "").replaceAll("、", NL).replaceAll(",", NL).split(NL).map((part) => part.trim()).filter(Boolean).map((part) => cleanMoves(parseAlg(part))); }
  function listContainsSubsequence(list, part) { if (!part.length) return true; if (part.length > list.length) return false; for (let i = 0; i <= list.length - part.length; i += 1) { let ok = true; for (let j = 0; j < part.length; j += 1) if (list[i + j] !== part[j]) { ok = false; break; } if (ok) return true; } return false; }
  function solutionMatchesRequiredParts(solution, requiredParts) { const cleaned = cleanMoves(solution); return requiredParts.every((part) => listContainsSubsequence(cleaned, part)); }
  function parallelGroup(move) { return PARALLEL_GROUP[move[0]] || null; }
  function isParallelPair(a, b) { const ga = parallelGroup(a), gb = parallelGroup(b); return ga !== null && ga === gb && a[0] !== b[0]; }
  function moveToFacePower(move) { let power = 1; if (move.endsWith("2")) power = 2; else if (move.endsWith("'")) power = 3; return [move[0], power]; }
  function facePowerToMove(face, power) { const normalized = ((power % 4) + 4) % 4; if (normalized === 0) return null; if (normalized === 1) return face; if (normalized === 2) return face + "2"; return face + "'"; }
  function simplifySameFace(moves) { const result = []; for (const move of moves) { const fp = moveToFacePower(move); const face = fp[0]; const power = fp[1]; if (result.length && result[result.length - 1][0] === face) { const prevPower = moveToFacePower(result.pop())[1]; const next = facePowerToMove(face, prevPower + power); if (next) result.push(next); } else result.push(move); } return result; }
  function compressParallelRuns(moves) { const result = []; let i = 0; while (i < moves.length) { const group = parallelGroup(moves[i]); if (!group) { result.push(moves[i]); i += 1; continue; } const powers = {}; for (const face of PARALLEL_GROUP_FACES[group]) powers[face] = 0; while (i < moves.length && parallelGroup(moves[i]) === group) { const fp = moveToFacePower(moves[i]); powers[fp[0]] += fp[1]; i += 1; } for (const face of PARALLEL_GROUP_FACES[group]) { const move = facePowerToMove(face, powers[face]); if (move) result.push(move); } } return result; }
  function cleanMoves(moves) { let current = moves.slice(); for (;;) { const old = current.join(" "); current = simplifySameFace(current); current = compressParallelRuns(current); current = simplifySameFace(current); if (old === current.join(" ")) return current; } }
  function symbolMoveCount(moves) { return cleanMoves(moves).length; }
  function symbolDelta(path, move) { if (!path.length) return 1; const last = path[path.length - 1]; if (last[0] === move[0] && last === move) return 0; return 1; }
  function canAddMove(path, move) { if (!path.length) return true; const last = path[path.length - 1]; if (last[0] === move[0]) return false; if (isParallelPair(last, move)) { const order = PARALLEL_GROUP_FACES[parallelGroup(last)]; return order.indexOf(last[0]) < order.indexOf(move[0]); } return true; }
  function patternToArray(pattern) { const arr = []; for (const face of FACE_ORDER) arr.push.apply(arr, pattern[face]); return arr; }
  function countPatternColors(pattern) { const counts = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0, X: 0 }; for (const face of FACE_ORDER) for (const color of pattern[face]) counts[color] += 1; return counts; }
  function validatePattern(pattern) { const counts = countPatternColors(pattern); for (const face of FACE_ORDER) { if (pattern[face][4] !== face) throw new Error(face + "面の中央ステッカーは" + face + "色で固定してください。"); if (counts[face] > 9) throw new Error(face + "色が" + counts[face] + "枚あります。各色は9枚以内にしてください。"); } }
  function buildMovePerms(moves) { const out = new Map(); for (const move of moves) out.set(move, moveToPerm(move)); return out; }
  function makeMatcher(patternArr) { const pos = []; const val = []; for (let i = 0; i < 54; i += 1) if (patternArr[i] !== DONT_CARE) { pos.push(i); val.push(patternArr[i]); } return { count: pos.length, pos, val, matches(state) { for (let i = 0; i < pos.length; i += 1) if (state[pos[i]] !== val[i]) return false; return true; } }; }
  function stateFromSolution(solution) { let state = SOLVED; for (const move of inverseAlgList(solution)) state = applyPerm(state, moveToPerm(move)); return state; }
  function trimRedundantFinalAuf(job, solution) { let current = cleanMoves(solution); if (!job.matcher) return current; while (current.length && current[current.length - 1][0] === "U") { const shorter = cleanMoves(current.slice(0, -1)); if (!job.matcher.matches(stateFromSolution(shorter))) break; current = shorter; } return current; }
  function solutionMatchesJobTarget(job, solution) { if (!job.targetState && !job.matcher) return true; const state = stateFromSolution(solution); if (job.targetState && state !== job.targetState) return false; return !job.matcher || job.matcher.matches(state); }
  function emitSolution(job, solution) { const normalized = trimRedundantFinalAuf(job, solution); if (symbolMoveCount(normalized) > job.maxSymbolDepth) return false; if (!solutionMatchesRequiredParts(normalized, job.requiredParts)) return false; if (!solutionMatchesJobTarget(job, normalized)) return false; const key = algToString(normalized); if (job.foundKeys.has(key)) return false; job.foundKeys.add(key); job.foundCount += 1; if (job.captureSolution) job.captureSolution(normalized); else self.postMessage({ type: "solution", solution: normalized }); return true; }
  function pauseJob(job) { job.paused = true; self.postMessage({ type: "paused", message: "探索が大きすぎたため中断しました。" }); }
  function totalStored(job) { return (job.storeA ? job.storeA.states.length : 0) + (job.storeB ? job.storeB.states.length : 0) + (job.forwardStore ? job.forwardStore.states.length : 0) + (job.secondNodes ? job.secondNodes.length : 0); }
  function shouldPause(job) { return !job.allowUnsafe && totalStored(job) > MAX_STORED_STATES; }
  function makeStore(initialState) { return { states: [initialState], parent: [-1], move: [""], cost: [0], seen: new Map([[initialState, 0]]) }; }
  function addNode(store, state, parentId, move, cost) { const id = store.states.length; store.states.push(state); store.parent.push(parentId); store.move.push(move); store.cost.push(cost); store.seen.set(state, id); return id; }
  function pathFromNode(store, id) { const out = []; while (id >= 0) { const move = store.move[id]; if (move) out.push(move); id = store.parent[id]; } out.reverse(); return out; }
  function lastTwoMoves(store, id) { if (id < 0) return []; const last = store.move[id]; if (!last) return []; const parentId = store.parent[id]; if (parentId < 0) return [last]; const prev = store.move[parentId]; return prev ? [prev, last] : [last]; }

  function expandAlgLayer(job, side) { const expandingFromStart = side === "A"; const front = expandingFromStart ? job.frontA : job.frontB; const storeSelf = expandingFromStart ? job.storeA : job.storeB; const storeOther = expandingFromStart ? job.storeB : job.storeA; const sideLimit = expandingFromStart ? job.sideSymbolLimitA : job.sideSymbolLimitB; const newFront = []; for (const id of front) { if (job.stopByLimit) break; const state = storeSelf.states[id]; const tail = lastTwoMoves(storeSelf, id); const cost = storeSelf.cost[id]; for (const move of job.moves) { if (job.stopByLimit) break; if (!canAddMove(tail, move)) continue; const nextCost = cost + symbolDelta(tail, move); if (nextCost > sideLimit) continue; const nextState = applyPerm(state, job.movePerms.get(move)); if (storeSelf.seen.has(nextState)) continue; const nextId = addNode(storeSelf, nextState, id, move, nextCost); newFront.push(nextId); if (storeOther.seen.has(nextState)) { const otherId = storeOther.seen.get(nextState); const selfPath = pathFromNode(storeSelf, nextId); const otherPath = pathFromNode(storeOther, otherId); const solution = cleanMoves(expandingFromStart ? selfPath.concat(inverseAlgList(otherPath)) : otherPath.concat(inverseAlgList(selfPath))); if (symbolMoveCount(solution) <= job.maxSymbolDepth) emitSolution(job, solution); } } } if (expandingFromStart) job.frontA = newFront; else job.frontB = newFront; }
  function processAlgJob(job) { try { while ((job.frontA.length || job.frontB.length) && !job.stopByLimit) { if (job.frontA.length && (job.frontA.length <= job.frontB.length || !job.frontB.length)) expandAlgLayer(job, "A"); else expandAlgLayer(job, "B"); if (shouldPause(job)) return pauseJob(job); } CURRENT_JOB = null; self.postMessage({ type: "done", completed: !job.stopByLimit }); } catch (e) { CURRENT_JOB = null; self.postMessage({ type: "error", message: e instanceof Error ? e.message : String(e) }); } }
  function generatorFaceCount(moves) { return new Set(moves.map((move) => move[0])).size; }
  function collectExactSolutions(start, job, maxDepth, stateBudget, onSolution) {
    const storeA = makeStore(start);
    const storeB = makeStore(SOLVED);
    let frontA = [0];
    let frontB = [0];
    let statesVisited = 2;
    const sideLimitA = Math.ceil(maxDepth / 2);
    const sideLimitB = Math.floor(maxDepth / 2);
    if (start === SOLVED) onSolution([]);
    while ((frontA.length || frontB.length) && statesVisited < stateBudget) {
      const expandingFromStart = frontA.length && (frontA.length <= frontB.length || !frontB.length);
      const front = expandingFromStart ? frontA : frontB;
      const storeSelf = expandingFromStart ? storeA : storeB;
      const storeOther = expandingFromStart ? storeB : storeA;
      const sideLimit = expandingFromStart ? sideLimitA : sideLimitB;
      const newFront = [];
      for (const id of front) {
        const state = storeSelf.states[id];
        const tail = lastTwoMoves(storeSelf, id);
        const cost = storeSelf.cost[id];
        for (const move of job.moves) {
          if (!canAddMove(tail, move)) continue;
          const nextCost = cost + symbolDelta(tail, move);
          if (nextCost > sideLimit) continue;
          const nextState = applyPerm(state, job.movePerms.get(move));
          if (storeSelf.seen.has(nextState)) continue;
          const nextId = addNode(storeSelf, nextState, id, move, nextCost);
          newFront.push(nextId);
          statesVisited += 1;
          if (storeOther.seen.has(nextState)) {
            const otherId = storeOther.seen.get(nextState);
            const selfPath = pathFromNode(storeSelf, nextId);
            const otherPath = pathFromNode(storeOther, otherId);
            const solution = cleanMoves(expandingFromStart ? selfPath.concat(inverseAlgList(otherPath)) : otherPath.concat(inverseAlgList(selfPath)));
            if (symbolMoveCount(solution) <= maxDepth) onSolution(solution);
          }
          if (statesVisited >= stateBudget) break;
        }
        if (statesVisited >= stateBudget) break;
      }
      if (expandingFromStart) frontA = newFront;
      else frontB = newFront;
    }
    return statesVisited;
  }
  function parseFastSeed(job, seedText) { let seed; try { seed = cleanMoves(parseAlg(seedText)); } catch { return null; } if (!seed.length || !seed.every((move) => job.movePerms.has(move))) return null; if (!solutionMatchesJobTarget(job, seed)) return null; return seed; }
  function runSeededFastJob(job, seedText) {
    if (generatorFaceCount(job.moves) < 4) return false;
    const seed = parseFastSeed(job, seedText);
    if (!seed) return false;
    emitSolution(job, seed);
    const seedFaces = [...new Set(seed.map((move) => move[0]))];
    if (seedFaces.length <= 3) {
      const restrictedMoves = seedFaces.flatMap((face) => [face, face + "'", face + "2"]);
      const restrictedJob = Object.assign({}, job, { moves: restrictedMoves, movePerms: buildMovePerms(restrictedMoves) });
      const restrictedBudget = job.targetState ? FAST_RESTRICTED_STATE_BUDGET : FAST_PARTIAL_RESTRICTED_STATE_BUDGET;
      collectExactSolutions(stateFromSolution(seed), restrictedJob, job.maxSymbolDepth, restrictedBudget, (solution) => emitSolution(job, solution));
    }
    let remainingBudget = FAST_REWRITE_STATE_BUDGET;
    const searchedSegments = new Set();
    outer: for (let windowLength = Math.min(FAST_REWRITE_MAX_DEPTH, seed.length); windowLength >= 2; windowLength -= 1) {
      const replacementMaxDepth = Math.min(FAST_REWRITE_MAX_DEPTH, job.maxSymbolDepth - (seed.length - windowLength));
      if (replacementMaxDepth < 1) continue;
      for (let startIndex = 0; startIndex <= seed.length - windowLength; startIndex += 1) {
        const segment = seed.slice(startIndex, startIndex + windowLength);
        const segmentKey = algToString(segment) + "|" + replacementMaxDepth;
        if (searchedSegments.has(segmentKey)) continue;
        searchedSegments.add(segmentKey);
        const prefix = seed.slice(0, startIndex);
        const suffix = seed.slice(startIndex + windowLength);
        const visited = collectExactSolutions(stateFromSolution(segment), job, replacementMaxDepth, remainingBudget, (replacement) => emitSolution(job, cleanMoves(prefix.concat(replacement, suffix))));
        remainingBudget -= visited;
        if (remainingBudget <= 2) break outer;
      }
    }
    CURRENT_JOB = null;
    self.postMessage({ type: "done", completed: true });
    return true;
  }
  function startExactStateJob(data, start, matcher = null) { const moves = makeSearchMoves(data.searchMovesText); const maxSymbolDepth = Number(data.maxSymbolDepth) || 1; const job = { kind: "alg", allowUnsafe: Boolean(data.allowUnsafe), requiredParts: parseRequiredParts(data.requiredPartsText || ""), foundCount: 0, foundKeys: new Set(), stopByLimit: false, moves, maxSymbolDepth, sideSymbolLimitA: Math.ceil(maxSymbolDepth / 2), sideSymbolLimitB: Math.floor(maxSymbolDepth / 2), movePerms: buildMovePerms(moves), matcher, targetState: start, storeA: makeStore(start), storeB: makeStore(SOLVED), frontA: [0], frontB: [0] }; CURRENT_JOB = job; if (runSeededFastJob(job, data.seedAlg || "")) return; if (start === SOLVED) emitSolution(job, []); processAlgJob(job); }
  function startAlgJob(data) { const start = applyAlg(SOLVED, algToString(inverseAlgList(parseAlg(data.targetAlg)))); startExactStateJob(data, start); }

  function permKey(perm) { let key = ""; for (let i = 0; i < 54; i += 1) key += String.fromCharCode(perm[i] + 35); return key; }
  function allForwardIds(job) { if (job.allForwardIdsVersion === job.forwardStore.states.length) return job.allForwardIds; job.allForwardIds = Array.from({ length: job.forwardStore.states.length }, (_, i) => i); job.allForwardIdsVersion = job.forwardStore.states.length; return job.allForwardIds; }
  function stateMatchesNode(state, node) { for (let i = 0; i < node.positions.length; i += 1) if (state[node.positions[i]] !== node.valueKey[i]) return false; return true; }
  function buildSingleForwardIndex(store, ids) { const index = new Map(); for (const id of ids) { const state = store.states[id]; for (let pos = 0; pos < 54; pos += 1) { const key = pos + state[pos]; let bucket = index.get(key); if (!bucket) { bucket = []; index.set(key, bucket); } bucket.push(id); } } return index; }
  function getSingleForwardIndex(job, ids, kind) { if (kind === "layer") { if (job.singleLayerIndex && job.singleLayerVersion === job.forwardDepth) return job.singleLayerIndex; job.singleLayerIndex = buildSingleForwardIndex(job.forwardStore, ids); job.singleLayerVersion = job.forwardDepth; return job.singleLayerIndex; } if (job.singleAllIndex && job.singleAllVersion === job.forwardStore.states.length) return job.singleAllIndex; job.singleAllIndex = buildSingleForwardIndex(job.forwardStore, ids); job.singleAllVersion = job.forwardStore.states.length; return job.singleAllIndex; }
  function pickCandidatesFromSingleIndex(index, node) { let best = null; for (let i = 0; i < node.positions.length; i += 1) { const bucket = index.get(node.positions[i] + node.valueKey[i]) || []; if (best === null || bucket.length < best.length) best = bucket; if (best.length === 0) break; } return best || []; }
  function makeSecondNode(job, parent, move, perm, cost) { const pairs = []; for (let i = 0; i < job.matcher.pos.length; i += 1) pairs.push([perm[job.matcher.pos[i]], job.matcher.val[i]]); pairs.sort((a, b) => a[0] - b[0]); const positions = new Array(pairs.length); let mask = ""; let valueKey = ""; for (let i = 0; i < pairs.length; i += 1) { const pos = pairs[i][0]; positions[i] = pos; mask += pos + ","; valueKey += pairs[i][1]; } return { parent, move, cost, mask, positions, valueKey }; }
  function secondNodeKey(_job, _node, perm) { return permKey(perm); }
  function pathFromSecondNode(job, id) { const out = []; while (id >= 0) { const node = job.secondNodes[id]; if (node.move) out.push(node.move); id = node.parent; } out.reverse(); return out; }
  function lastTwoSecondMoves(job, id) { if (id < 0) return []; const last = job.secondNodes[id].move; if (!last) return []; const parentId = job.secondNodes[id].parent; if (parentId < 0) return [last]; const prev = job.secondNodes[parentId].move; return prev ? [prev, last] : [last]; }
  function emitPatternMatches(job, node, secondId, ids, _cache, kind) { let emitted = false; const candidates = pickCandidatesFromSingleIndex(getSingleForwardIndex(job, ids, kind), node); if (!candidates.length) return false; const secondPath = pathFromSecondNode(job, secondId); for (const firstId of candidates) { if (job.stopByLimit) break; if (!stateMatchesNode(job.forwardStore.states[firstId], node)) continue; const firstPath = pathFromNode(job.forwardStore, firstId); const solution = cleanMoves(inverseAlgList(firstPath.concat(secondPath))); const key = algToString(solution); if (job.solutionSet.has(key)) continue; job.solutionSet.add(key); if (emitSolution(job, solution)) emitted = true; } return emitted; }
  function emitPatternMatchesAllForward(job, node, secondId) { return emitPatternMatches(job, node, secondId, allForwardIds(job), job.indexCache, "all"); }
  function emitPatternMatchesNewForwardOnly(job, node, secondId) { if (!job.newForwardIds || !job.newForwardIds.length) return false; return emitPatternMatches(job, node, secondId, job.newForwardIds, job.layerIndexCache, "layer"); }
  function expandPatternForwardLayer(job) { const nextFront = []; for (const id of job.forwardFront) { if (job.stopByLimit) break; const state = job.forwardStore.states[id]; const tail = lastTwoMoves(job.forwardStore, id); const cost = job.forwardStore.cost[id]; for (const move of job.moves) { if (job.stopByLimit) break; if (!canAddMove(tail, move)) continue; const nextCost = cost + symbolDelta(tail, move); if (nextCost > job.maxSymbolDepth) continue; const nextState = applyPerm(state, job.movePerms.get(move)); if (job.forwardStore.seen.has(nextState)) continue; const nextId = addNode(job.forwardStore, nextState, id, move, nextCost); nextFront.push(nextId); } } job.forwardFront = nextFront; job.newForwardIds = nextFront; job.forwardDepth += 1; job.indexCache.clear(); job.layerIndexCache = new Map(); job.allForwardIdsVersion = -1; job.singleAllIndex = null; job.singleAllVersion = -1; job.singleLayerIndex = null; job.singleLayerVersion = -1; }
  function expandPatternSecondLayer(job) { const nextFront = []; for (const entry of job.secondFront) { if (job.stopByLimit) break; const nodeId = entry.id; const node = job.secondNodes[nodeId]; const tail = lastTwoSecondMoves(job, nodeId); for (const move of job.moves) { if (job.stopByLimit) break; if (!canAddMove(tail, move)) continue; const nextCost = node.cost + symbolDelta(tail, move); if (nextCost > job.maxSymbolDepth) continue; const nextPerm = composePerm(entry.perm, job.movePerms.get(move)); const nextNode = makeSecondNode(job, nodeId, move, nextPerm, nextCost); const key = secondNodeKey(job, nextNode, nextPerm); if (job.secondSeen.has(key)) continue; job.secondSeen.add(key); const nextId = job.secondNodes.length; job.secondNodes.push(nextNode); emitPatternMatchesAllForward(job, nextNode, nextId); nextFront.push({ id: nextId, perm: nextPerm }); } } job.secondFront = nextFront; job.secondDepth += 1; }
  function ensureForwardDepth(job, targetDepth) { while (job.forwardDepth < targetDepth && job.forwardFront.length && !job.stopByLimit) { expandPatternForwardLayer(job); if (shouldPause(job)) return false; } return true; }
  function ensureSecondDepth(job, targetDepth) { while (job.secondDepth < targetDepth && job.secondFront.length && !job.stopByLimit) { expandPatternSecondLayer(job); if (shouldPause(job)) return false; } return true; }
  function matchSecondNodesForCurrentForward(job) { if (job.lastMatchedForwardDepth === job.forwardDepth) return; for (let id = 0; id < job.secondNodes.length; id += 1) { if (job.stopByLimit) break; const node = job.secondNodes[id]; if (node.cost > job.maxSymbolDepth) continue; emitPatternMatchesNewForwardOnly(job, node, id); } job.lastMatchedForwardDepth = job.forwardDepth; }
  function processBidirectionalPatternJob(job) { try { while (job.searchDepth <= job.maxPhysicalDepth && !job.stopByLimit) { const firstDepth = Math.ceil(job.searchDepth / 2); const secondDepth = Math.floor(job.searchDepth / 2); if (!ensureForwardDepth(job, firstDepth)) return pauseJob(job); matchSecondNodesForCurrentForward(job); if (!ensureSecondDepth(job, secondDepth)) return pauseJob(job); job.searchDepth += 1; } CURRENT_JOB = null; self.postMessage({ type: "done", completed: !job.stopByLimit }); } catch (e) { CURRENT_JOB = null; self.postMessage({ type: "error", message: e instanceof Error ? e.message : String(e) }); } }
  function makePatternSearchJob(baseJob) { const identityPerm = Array.from({ length: 54 }, (_, i) => i); const job = Object.assign(baseJob, { forwardStore: makeStore(SOLVED), forwardFront: [0], newForwardIds: [0], forwardDepth: 0, secondFront: [], secondNodes: [], secondSeen: new Set(), secondDepth: 0, searchDepth: 0, lastMatchedForwardDepth: -1, solutionSet: new Set(), indexCache: new Map(), layerIndexCache: new Map(), allForwardIds: [0], allForwardIdsVersion: 1 }); const identitySecondNode = makeSecondNode(job, -1, "", identityPerm, 0); job.secondSeen.add(secondNodeKey(job, identitySecondNode, identityPerm)); job.secondNodes = [identitySecondNode]; job.secondFront = [{ id: 0, perm: identityPerm }]; return job; }
  function patternSeedFaceSets(moves) { const available = [...new Set(moves.map((move) => move[0]))]; const preferred = [["R", "U", "F"], ["R", "U", "L"], ["R", "U", "D"]].filter((faces) => faces.every((face) => available.includes(face))); if (available.length >= 3) preferred.push(available.slice(0, 3)); const seen = new Set(); return preferred.filter((faces) => { const key = faces.slice().sort().join(""); if (seen.has(key)) return false; seen.add(key); return true; }); }
  function discoverPatternSeed(baseJob) {
    for (const faces of patternSeedFaceSets(baseJob.moves)) {
      let captured = null;
      const moves = faces.flatMap((face) => [face, face + "'", face + "2"]);
      const discoveryJob = makePatternSearchJob(Object.assign({}, baseJob, { moves, movePerms: buildMovePerms(moves), foundCount: 0, foundKeys: new Set(), stopByLimit: false, captureSolution(solution) { captured = solution; discoveryJob.stopByLimit = true; } }));
      while (!captured && discoveryJob.searchDepth <= discoveryJob.maxPhysicalDepth && totalStored(discoveryJob) < FAST_PATTERN_SEED_STATE_BUDGET) {
        const firstDepth = Math.ceil(discoveryJob.searchDepth / 2);
        const secondDepth = Math.floor(discoveryJob.searchDepth / 2);
        ensureForwardDepth(discoveryJob, firstDepth);
        matchSecondNodesForCurrentForward(discoveryJob);
        ensureSecondDepth(discoveryJob, secondDepth);
        discoveryJob.searchDepth += 1;
      }
      if (captured) return captured;
    }
    return null;
  }
  function startPatternJob(data) { const pattern = data.targetPattern; validatePattern(pattern); const patternArr = patternToArray(pattern); const matcher = makeMatcher(patternArr); if (matcher.count === 54) { startExactStateJob(data, patternArr.join(""), matcher); return; } const moves = makeSearchMoves(data.searchMovesText); const maxSymbolDepth = Number(data.maxSymbolDepth) || 1; const requiredParts = parseRequiredParts(data.requiredPartsText || ""); const baseJob = { kind: "pattern", allowUnsafe: Boolean(data.allowUnsafe), requiredParts, foundCount: 0, foundKeys: new Set(), stopByLimit: false, moves, maxSymbolDepth, maxPhysicalDepth: maxSymbolDepth, movePerms: buildMovePerms(moves), matcher, targetState: null }; CURRENT_JOB = baseJob; if (runSeededFastJob(baseJob, data.seedAlg || "")) return; if (generatorFaceCount(moves) >= 4) { const discoveredSeed = discoverPatternSeed(baseJob); if (discoveredSeed && runSeededFastJob(baseJob, algToString(discoveredSeed))) return; } if (matcher.matches(SOLVED)) emitSolution(baseJob, []); const job = makePatternSearchJob(baseJob); CURRENT_JOB = job; processBidirectionalPatternJob(job); }
  self.onmessage = function (event) { const data = event.data || {}; if (data.command === "continue") { if (CURRENT_JOB) { CURRENT_JOB.allowUnsafe = true; if (CURRENT_JOB.kind === "alg") processAlgJob(CURRENT_JOB); else processBidirectionalPatternJob(CURRENT_JOB); } return; } try { if (data.mode === "alg") startAlgJob(data); else startPatternJob(data); } catch (e) { self.postMessage({ type: "error", message: e instanceof Error ? e.message : String(e) }); } };
}

function Sticker({ color, bottomColor, onClick, locked = false, testId }) {
  const displayColor = displayColorSymbol(color, bottomColor);
  return <button type="button" data-testid={testId} data-color={color} data-display-color={displayColor} onClick={onClick} disabled={locked} className={["aspect-square w-full rounded-md border transition duration-150", locked ? "cursor-not-allowed ring-2 ring-slate-500" : "hover:scale-105 active:scale-95"].join(" ")} style={{ background: displayColorStyle(color, bottomColor), borderColor: "#64748b" }} title={FACE_LABEL[displayColor] || displayColor}>{color === DONT_CARE ? <span className="text-xs font-normal text-white">?</span> : null}</button>;
}
function FaceGrid({ face, stickers, bottomColor, onStickerClick }) { return <div className="grid w-full grid-cols-3 gap-1">{stickers.map((color, idx) => <Sticker key={idx} testId={face ? `net-${face}-${idx}` : undefined} color={color} bottomColor={bottomColor} locked={idx === 4} onClick={() => onStickerClick(idx)} />)}</div>; }
function MiniSticker({ filled, bottomColor, corner = false }) {
  if (corner) return <div className="h-2.5 w-2.5 sm:h-3 sm:w-3" />;
  const displayColor = displayColorSymbol("U", bottomColor);
  return <div data-display-color={filled ? displayColor : "X"} className="h-2.5 w-2.5 rounded-[2px] border border-slate-500/70 sm:h-3 sm:w-3" style={{ background: filled ? displayColorStyle("U", bottomColor) : "#374151" }} />;
}
function MiniColorSticker({ color, bottomColor, corner = false }) {
  if (corner) return <div className="h-2.5 w-2.5 sm:h-3 sm:w-3" />;
  const displayColor = displayColorSymbol(color, bottomColor);
  return <div data-color={color} data-display-color={displayColor} className="h-2.5 w-2.5 rounded-[2px] border border-slate-500/70 sm:h-3 sm:w-3" style={{ background: displayColorStyle(color, bottomColor) }} />;
}
function fallbackPreviewMask(pattern) { const u = pattern.U; const bit = (idx) => (u[idx] === "U" ? "1" : "0"); return [`x${bit(0)}${bit(1)}${bit(2)}x`, `0${bit(0)}${bit(1)}${bit(2)}0`, `0${bit(3)}${bit(4)}${bit(5)}0`, `0${bit(6)}${bit(7)}${bit(8)}0`, `x${bit(6)}${bit(7)}${bit(8)}x`].join(""); }
function pllPreviewCells(pattern) {
  return [
    null, pattern.B[2], pattern.B[1], pattern.B[0], null,
    pattern.L[0], pattern.U[0], pattern.U[1], pattern.U[2], pattern.R[2],
    pattern.L[1], pattern.U[3], pattern.U[4], pattern.U[5], pattern.R[1],
    pattern.L[2], pattern.U[6], pattern.U[7], pattern.U[8], pattern.R[0],
    null, pattern.F[0], pattern.F[1], pattern.F[2], null,
  ];
}
function cubePreviewPoint(x, y, z) {
  const point = quatRotate(BASE_CUBE_VIEW_QUAT, [x, y, z]);
  return `${(32 + point[0] * 12.4).toFixed(2)},${(31 - point[1] * 12.4).toFixed(2)}`;
}
function cubePreviewPolygon(points) {
  return points.map(([x, y, z]) => cubePreviewPoint(x, y, z)).join(" ");
}
function MiniCubePreviewFace({ stickers, face, bottomColor }) {
  return (
    <g data-preview-face={face}>
      {stickers.map((color, index) => {
        const row = Math.floor(index / 3);
        const col = index % 3;
        let points;
        if (face === "U") {
          const x0 = col - 1.5;
          const x1 = col - 0.5;
          const z0 = row - 1.5;
          const z1 = row - 0.5;
          points = [[x0, 1.5, z0], [x1, 1.5, z0], [x1, 1.5, z1], [x0, 1.5, z1]];
        } else if (face === "F") {
          const x0 = col - 1.5;
          const x1 = col - 0.5;
          const y0 = 1.5 - row;
          const y1 = 0.5 - row;
          points = [[x0, y0, 1.5], [x1, y0, 1.5], [x1, y1, 1.5], [x0, y1, 1.5]];
        } else {
          const z0 = 1.5 - col;
          const z1 = 0.5 - col;
          const y0 = 1.5 - row;
          const y1 = 0.5 - row;
          points = [[1.5, y0, z0], [1.5, y0, z1], [1.5, y1, z1], [1.5, y1, z0]];
        }
        const displayColor = displayColorSymbol(color, bottomColor);
        return <polygon key={index} data-color={color} data-display-color={displayColor} points={cubePreviewPolygon(points)} fill={displayColorStyle(color, bottomColor)} stroke="#334155" strokeWidth="0.55" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
      })}
    </g>
  );
}
function MiniZblsPreview({ pattern, bottomColor }) {
  return (
    <svg data-zbls-cube-preview aria-hidden="true" viewBox="0 0 64 58" className="h-[54px] w-[64px] overflow-visible drop-shadow-sm">
      <MiniCubePreviewFace face="U" stickers={pattern.U} bottomColor={bottomColor} />
      <MiniCubePreviewFace face="F" stickers={pattern.F} bottomColor={bottomColor} />
      <MiniCubePreviewFace face="R" stickers={pattern.R} bottomColor={bottomColor} />
    </svg>
  );
}
function MiniPatternPreview({ pattern, previewMask, variant = "last-layer", bottomColor }) {
  if (variant === "zbls") return <MiniZblsPreview pattern={pattern} bottomColor={bottomColor} />;
  if (!previewMask) {
    return <div className="grid grid-cols-5 gap-[2px]">{pllPreviewCells(pattern).map((cell, idx) => <MiniColorSticker key={idx} corner={!cell} color={cell || "X"} bottomColor={bottomColor} />)}</div>;
  }
  const mask = previewMask || fallbackPreviewMask(pattern);
  return <div className="grid grid-cols-5 gap-[2px]">{mask.split("").map((cell, idx) => <MiniSticker key={idx} corner={cell === "x" || idx === 0 || idx === 4 || idx === 20 || idx === 24} filled={cell === "1"} bottomColor={bottomColor} />)}</div>;
}
function NetEditor({ pattern, setPattern, selectedColor, bottomColor }) { function setSticker(face, idx) { if (idx === 4) return; setPattern((prev) => { const next = {}; for (const f of FACE_ORDER) next[f] = [...prev[f]]; next[face][idx] = selectedColor; return next; }); } const spacer = <div />; return <div className="mx-auto grid w-full max-w-[520px] grid-cols-4 gap-1.5 py-2 sm:gap-3">{spacer}<FaceGrid face="U" stickers={pattern.U} bottomColor={bottomColor} onStickerClick={(idx) => setSticker("U", idx)} />{spacer}{spacer}<FaceGrid face="L" stickers={pattern.L} bottomColor={bottomColor} onStickerClick={(idx) => setSticker("L", idx)} /><FaceGrid face="F" stickers={pattern.F} bottomColor={bottomColor} onStickerClick={(idx) => setSticker("F", idx)} /><FaceGrid face="R" stickers={pattern.R} bottomColor={bottomColor} onStickerClick={(idx) => setSticker("R", idx)} /><FaceGrid face="B" stickers={pattern.B} bottomColor={bottomColor} onStickerClick={(idx) => setSticker("B", idx)} />{spacer}<FaceGrid face="D" stickers={pattern.D} bottomColor={bottomColor} onStickerClick={(idx) => setSticker("D", idx)} />{spacer}{spacer}</div>; }
function ThreeCubeEditor({ pattern, setPattern, selectedColor, bottomColor }) {
  const rootRef = useRef(null);
  const sceneRef = useRef(null);
  const patternRef = useRef(pattern);
  const selectedColorRef = useRef(selectedColor);
  const bottomColorRef = useRef(bottomColor);

  useEffect(() => { patternRef.current = pattern; }, [pattern]);
  useEffect(() => { selectedColorRef.current = selectedColor; }, [selectedColor]);
  useEffect(() => { bottomColorRef.current = bottomColor; }, [bottomColor]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x27272a, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.setAttribute("data-testid", "cube-canvas");
    renderer.domElement.style.display = "block";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.width = "100%";
    root.appendChild(renderer.domElement);

    const camera = new THREE.OrthographicCamera(-3, 3, 2.5, -2.5, 0.1, 100);
    camera.position.set(5, 3.7, 5.5);
    camera.lookAt(0, 0, 0);

    const group = new THREE.Group();
    scene.add(group);
    const bodyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(3.08, 3.08, 3.08),
      new THREE.MeshBasicMaterial({ color: 0x0f172a }),
    );
    group.add(bodyMesh);

    const stickerGeometry = new THREE.PlaneGeometry(0.9, 0.9);
    const stickerMeshes = [];
    for (const face of FACE_ORDER) {
      const axes = FACE_AXIS[face];
      const normal = new THREE.Vector3(...NORMAL[face]);
      const colAxis = new THREE.Vector3(...axes.col);
      const rowAxis = new THREE.Vector3(...axes.row);
      const rotation = new THREE.Matrix4().makeBasis(colAxis, rowAxis, normal);
      for (let index = 0; index < 9; index += 1) {
        const row = Math.floor(index / 3);
        const col = index % 3;
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.FrontSide });
        const mesh = new THREE.Mesh(stickerGeometry, material);
        const position = new THREE.Vector3(...facePos(face, row, col)).addScaledVector(normal, 0.56);
        mesh.position.copy(position);
        mesh.quaternion.setFromRotationMatrix(rotation);
        mesh.userData = { face, index };
        group.add(mesh);
        stickerMeshes.push(mesh);
      }
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dragRef = { active: false, captured: false, dragged: false, x: 0, y: 0, quaternion: new THREE.Quaternion() };

    function render() {
      renderer.render(scene, camera);
    }

    function resize() {
      const width = Math.max(1, root.clientWidth);
      const height = Math.max(1, root.clientHeight);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      const viewHeight = 5.55;
      camera.left = -viewHeight * aspect / 2;
      camera.right = viewHeight * aspect / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      render();
    }

    function updateStickerColors() {
      for (const mesh of stickerMeshes) {
        const { face, index } = mesh.userData;
        const color = patternRef.current[face][index];
        mesh.material.color.set(displayColorStyle(color, bottomColorRef.current));
      }
      render();
    }

    function setSticker(face, index) {
      if (index === 4) return;
      setPattern((prev) => {
        const next = {};
        for (const item of FACE_ORDER) next[item] = [...prev[item]];
        next[face][index] = selectedColorRef.current;
        return next;
      });
    }

    function pickSticker(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([bodyMesh, ...stickerMeshes], false)[0];
      if (hit?.object.userData.face && hit.object.userData.index !== 4) setSticker(hit.object.userData.face, hit.object.userData.index);
    }

    function onPointerDown(event) {
      event.preventDefault();
      dragRef.active = true;
      dragRef.captured = true;
      dragRef.dragged = false;
      dragRef.x = event.clientX;
      dragRef.y = event.clientY;
      dragRef.quaternion.copy(group.quaternion);
      renderer.domElement.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event) {
      if (!dragRef.active) return;
      const dx = event.clientX - dragRef.x;
      const dy = event.clientY - dragRef.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragRef.dragged = true;
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * 0.01);
      const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * 0.01);
      group.quaternion.copy(yaw.multiply(pitch).multiply(dragRef.quaternion));
      render();
    }

    function onPointerUp(event) {
      if (!dragRef.active) return;
      if (dragRef.captured) renderer.domElement.releasePointerCapture(event.pointerId);
      if (!dragRef.dragged) pickSticker(event);
      dragRef.active = false;
      dragRef.captured = false;
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    sceneRef.current = { updateStickerColors };
    resize();
    updateStickerColors();

    return () => {
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      sceneRef.current = null;
      root.removeChild(renderer.domElement);
      stickerGeometry.dispose();
      scene.traverse((object) => {
        if (object.geometry && object.geometry !== stickerGeometry) object.geometry.dispose();
        if (object.material) object.material.dispose();
      });
      renderer.dispose();
    };
  }, [setPattern]);

  useEffect(() => {
    sceneRef.current?.updateStickerColors();
  }, [pattern, bottomColor]);

  return (
    <div data-testid="quaternion-editor" className="mx-auto h-[320px] w-full max-w-[520px] touch-none select-none overflow-hidden rounded-[22px] bg-[#27272a] sm:h-[360px]" ref={rootRef} />
  );
}
function ColorPicker({ selectedColor, setSelectedColor, bottomColor }) {
  return <div className="mb-4 flex flex-wrap gap-2">{[...FACE_ORDER, DONT_CARE].map((face) => { const displayColor = displayColorSymbol(face, bottomColor); return <button key={face} type="button" data-testid={`color-${face}`} data-display-color={displayColor} onClick={() => setSelectedColor(face)} className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-normal transition active:scale-95 ${selectedColor === face ? "border-slate-100 bg-zinc-700 shadow-md ring-2 ring-slate-300" : "border-zinc-600 bg-zinc-700 hover:bg-zinc-600"}`} title={FACE_LABEL[displayColor] || displayColor}><span className="inline-flex h-5 w-5 items-center justify-center rounded border text-[10px] font-normal text-white" style={{ background: displayColorStyle(face, bottomColor), borderColor: "#64748b" }}>{face === DONT_CARE ? "?" : ""}</span></button>; })}</div>;
}
function PatternEditorControls({ editorMode, setEditorMode, bottomColor, setBottomColor }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex rounded-xl border border-zinc-600 bg-zinc-800 p-1">
        <button type="button" data-testid="pattern-editor-net" aria-pressed={editorMode === "net"} onClick={() => setEditorMode("net")} className={`h-8 rounded-lg px-3 text-xs transition ${editorMode === "net" ? "bg-zinc-100 text-zinc-950" : "text-zinc-200 hover:bg-zinc-700"}`}>展開図</button>
        <button type="button" data-testid="pattern-editor-cube" aria-pressed={editorMode === "cube"} onClick={() => setEditorMode("cube")} className={`h-8 rounded-lg px-3 text-xs transition ${editorMode === "cube" ? "bg-zinc-100 text-zinc-950" : "text-zinc-200 hover:bg-zinc-700"}`}>立体</button>
      </div>
      <div className="flex flex-wrap items-center gap-2" data-testid="bottom-color-picker">
        <span className="text-xs text-zinc-200">底面色</span>
        {FACE_ORDER.map((face) => <button key={face} type="button" data-testid={`bottom-color-${face}`} aria-pressed={bottomColor === face} onClick={() => setBottomColor(face)} className={`flex h-8 w-8 items-center justify-center rounded-xl border transition active:scale-95 ${bottomColor === face ? "border-slate-100 bg-zinc-700 ring-2 ring-slate-300" : "border-zinc-600 bg-zinc-700 hover:bg-zinc-600"}`} title={FACE_LABEL[face]}><span className="h-4 w-4 rounded border border-slate-500" style={{ background: FACE_COLOR_STYLE[face] }} /></button>)}
      </div>
    </div>
  );
}
function PatternInputEditor({ pattern, setPattern, selectedColor, setSelectedColor, editorMode, setEditorMode, bottomColor, setBottomColor }) {
  return (
    <>
      <ColorPicker selectedColor={selectedColor} setSelectedColor={setSelectedColor} bottomColor={bottomColor} />
      <PatternEditorControls editorMode={editorMode} setEditorMode={setEditorMode} bottomColor={bottomColor} setBottomColor={setBottomColor} />
      {editorMode === "cube" ? <ThreeCubeEditor pattern={pattern} setPattern={setPattern} selectedColor={selectedColor} bottomColor={bottomColor} /> : <NetEditor pattern={pattern} setPattern={setPattern} selectedColor={selectedColor} bottomColor={bottomColor} />}
    </>
  );
}
function SolutionSortControls({ sortKey, setSortKey, language }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-300 bg-white p-3 shadow-sm">
      <span className="mr-1 text-sm text-slate-500">{localizedLabel(SORT_BY_LABEL, language)}</span>
      {SOLUTION_SORT_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          data-testid={`sort-${key}`}
          aria-pressed={sortKey === key}
          onClick={() => setSortKey(key)}
          className={`rounded-xl border px-3 py-2 text-xs font-normal transition active:scale-95 ${sortKey === key ? "border-slate-200 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          {localizedLabel(SOLUTION_SORT_LABELS[key], language)}
        </button>
      ))}
    </div>
  );
}
function SolutionMetric({ testId, label, value }) {
  return (
    <div data-testid={testId} className="rounded-xl bg-slate-100 p-2">
      <div className="text-slate-500">{label}</div>
      <div className="text-lg font-normal">{value}</div>
    </div>
  );
}
function SolutionCard({ solution, t, language, showMoveCounts, onSave, onCopy }) {
  const displayAlg = formatWithSimulUD(solution);
  const regrips = regripCount(solution);
  return (
    <div data-testid="solution-card" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="mb-3 flex justify-end gap-2">
        <button onClick={() => onCopy(displayAlg)} className="rounded-xl border border-slate-300 bg-white px-3 py-1 text-xs font-normal text-slate-700 transition hover:bg-slate-50 active:scale-95">{t.copy}</button>
        <button onClick={() => onSave(solution)} className="rounded-xl border border-slate-300 bg-white px-3 py-1 text-xs font-normal text-slate-700 transition hover:bg-slate-50 active:scale-95">{t.favorite}</button>
      </div>
      <div data-testid="solution-alg" className="break-words font-mono text-base font-normal text-slate-900">{displayAlg || "(空)"}</div>
      {showMoveCounts ? (
        <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
          <SolutionMetric testId="metric-effective" label="STM" value={effectiveMoveCount(solution)} />
          <SolutionMetric testId="metric-symbol" label="HTM" value={symbolMoveCount(solution)} />
          <SolutionMetric testId="metric-quarter" label="QTM" value={quarterTurnCount(solution)} />
          <SolutionMetric testId="metric-regrip" label={localizedLabel(REGRIP_LABEL, language)} value={regrips === null ? "—" : regrips} />
        </div>
      ) : null}
    </div>
  );
}
function ThinkingCard({ foundCount, t }) { return <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><div className="flex gap-1"><span className="h-2.5 w-2.5 animate-bounce rounded-full bg-slate-500 [animation-delay:0ms]" /><span className="h-2.5 w-2.5 animate-bounce rounded-full bg-slate-500 [animation-delay:120ms]" /><span className="h-2.5 w-2.5 animate-bounce rounded-full bg-slate-500 [animation-delay:240ms]" /></div><div><div className="font-normal text-slate-900">{t.thinkingTitle}</div><div className="text-sm text-slate-600">{t.thinkingBody(foundCount)}</div></div></div></div>; }
function ResultSummaryCard({ text, className = "" }) { return <div className={`rounded-2xl border border-slate-300 bg-white p-4 shadow-sm ${className}`}><div className="flex min-h-[34px] items-center justify-center text-sm text-slate-600">{text}</div></div>; }
function EmptyCard({ text, className = "" }) { return <ResultSummaryCard text={text} className={className} />; }
function NumberInput({ label, value, onChange, min = 1, max = 99 }) { function setClamped(nextValue) { const raw = String(nextValue); if (raw === "") { onChange(""); return; } const numeric = Number(raw); if (!Number.isFinite(numeric)) return; onChange(Math.min(max, Math.max(min, Math.trunc(numeric)))); } return <label className="grid gap-1"><span className="text-sm font-normal">{label}</span><input type="number" inputMode="numeric" pattern="[0-9]*" min={min} max={max} step="1" value={value} onChange={(e) => setClamped(e.target.value)} onBlur={() => { if (value === "") onChange(min); }} className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-sm leading-5 outline-none focus:ring-2 focus:ring-slate-400" /></label>; }
function PresetTile({ label, pattern, previewMask, previewVariant, title, testId, selected = false, bottomColor, onClick }) {
  const isZblsPreview = previewVariant === "zbls";
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      title={title || label}
      className={`flex ${isZblsPreview ? "h-[96px] w-[88px]" : "h-[88px] w-[78px]"} flex-col items-center justify-center gap-1 rounded-lg border bg-white p-2 transition hover:bg-slate-50 active:scale-95 ${selected ? "border-slate-900 ring-2 ring-slate-400" : "border-slate-300"}`}
    >
      <MiniPatternPreview pattern={pattern} previewMask={previewMask} variant={previewVariant} bottomColor={bottomColor} />
      <span className="h-4 max-w-full truncate text-[11px] font-normal leading-4 text-slate-700">{label}</span>
    </button>
  );
}
function PresetTileList({ children, withDivider = false }) {
  return <div className={`flex flex-wrap gap-1.5 ${withDivider ? "border-t border-slate-200 pt-2" : ""}`}>{children}</div>;
}
function DirectPresetPanel({ category, applyCasePreset, bottomColor }) {
  return (
    <PresetTileList>
      {CASE_PRESETS[category].map((preset) => (
        <PresetTile
          key={preset.id}
          testId={`preset-case-${preset.id}`}
          onClick={() => applyCasePreset(preset)}
          title={category === "OLL" ? `OLL ${preset.number}` : preset.label || preset.id}
          label={category === "OLL" ? preset.number : preset.label || ""}
          pattern={preset.pattern}
          previewMask={preset.previewMask}
          bottomColor={bottomColor}
        />
      ))}
    </PresetTileList>
  );
}
function CollPresetPanel({ activeGroup, setActiveGroup, applyCasePreset, bottomColor }) {
  const group = COLL_GROUPS.find((item) => item.id === activeGroup);
  return (
    <div className="grid gap-2">
      <PresetTileList>
        {COLL_GROUPS.map((item) => (
          <PresetTile
            key={item.id}
            testId={`coll-group-${item.id}`}
            selected={activeGroup === item.id}
            onClick={() => setActiveGroup((prev) => (prev === item.id ? null : item.id))}
            title={item.label}
            label={item.label}
            pattern={item.preview}
            bottomColor={bottomColor}
          />
        ))}
      </PresetTileList>
      {group ? (
        <PresetTileList withDivider>
          {group.cases.map((preset) => (
            <PresetTile
              key={preset.id}
              testId={`preset-case-${preset.id}`}
              onClick={() => applyCasePreset(preset)}
              title={preset.label}
              label={preset.label}
              pattern={preset.previewPattern}
              bottomColor={bottomColor}
            />
          ))}
        </PresetTileList>
      ) : null}
    </div>
  );
}
function ZbllPresetPanel({ activeFamily, setActiveFamily, activeColl, setActiveColl, applyCasePreset, bottomColor }) {
  const family = ZBLL_GROUPS.find((item) => item.id === activeFamily);
  const collCase = family?.cases.find((item) => item.id === activeColl);
  return (
    <div className="grid gap-2">
      <PresetTileList>
        {ZBLL_GROUPS.map((group) => (
          <PresetTile
            key={group.id}
            testId={`zbll-family-${group.id}`}
            selected={activeFamily === group.id}
            onClick={() => {
              setActiveFamily((prev) => (prev === group.id ? null : group.id));
              setActiveColl(null);
            }}
            title={group.label}
            label={group.label}
            pattern={group.preview}
            bottomColor={bottomColor}
          />
        ))}
      </PresetTileList>
      {family ? (
        <PresetTileList withDivider>
          {family.cases.map((preset) => (
            <PresetTile
              key={preset.id}
              testId={`zbll-coll-${preset.id}`}
              selected={activeColl === preset.id}
              onClick={() => setActiveColl((prev) => (prev === preset.id ? null : preset.id))}
              title={preset.label}
              label={preset.label}
              pattern={preset.previewPattern}
              bottomColor={bottomColor}
            />
          ))}
        </PresetTileList>
      ) : null}
      {collCase ? (
        <PresetTileList withDivider>
          {collCase.zbllCases.map((preset) => (
            <PresetTile
              key={preset.id}
              testId={`preset-case-${preset.id}`}
              onClick={() => applyCasePreset(preset)}
              title={preset.label}
              label={preset.label}
              pattern={preset.pattern}
              bottomColor={bottomColor}
            />
          ))}
        </PresetTileList>
      ) : null}
    </div>
  );
}
function ZblsPresetPanel({ activeF2l, setActiveF2l, applyCasePreset, bottomColor }) {
  const group = ZBLS_GROUPS.find((item) => item.id === activeF2l);
  const visibleGroups = group ? [group] : ZBLS_GROUPS;
  return (
    <div className="grid gap-2">
      <PresetTileList>
        {visibleGroups.map((item) => (
          <PresetTile
            key={item.id}
            testId={`zbls-f2l-${item.id}`}
            selected={activeF2l === item.id}
            onClick={() => setActiveF2l((prev) => (prev === item.id ? null : item.id))}
            title={item.title}
            label={`${item.label} (${item.cases.length})`}
            pattern={item.preview}
            previewVariant="zbls"
            bottomColor={bottomColor}
          />
        ))}
      </PresetTileList>
      {group ? (
        <PresetTileList withDivider>
          {group.cases.map((preset) => (
            <PresetTile
              key={preset.id}
              testId={`preset-case-${preset.id}`}
              onClick={() => applyCasePreset(preset)}
              title={`${group.label} ${preset.label}`}
              label={preset.label}
              pattern={preset.pattern}
              previewVariant="zbls"
              bottomColor={bottomColor}
            />
          ))}
        </PresetTileList>
      ) : null}
    </div>
  );
}
function CasePresetPanel({ category, collGroupOpen, setCollGroupOpen, zbllFamilyOpen, setZbllFamilyOpen, zbllCollOpen, setZbllCollOpen, zblsF2lOpen, setZblsF2lOpen, applyCasePreset, bottomColor }) {
  if (category === "COLL") return <CollPresetPanel activeGroup={collGroupOpen} setActiveGroup={setCollGroupOpen} applyCasePreset={applyCasePreset} bottomColor={bottomColor} />;
  if (category === "ZBLL") return <ZbllPresetPanel activeFamily={zbllFamilyOpen} setActiveFamily={setZbllFamilyOpen} activeColl={zbllCollOpen} setActiveColl={setZbllCollOpen} applyCasePreset={applyCasePreset} bottomColor={bottomColor} />;
  if (category === "ZBLS") return <ZblsPresetPanel activeF2l={zblsF2lOpen} setActiveF2l={setZblsF2lOpen} applyCasePreset={applyCasePreset} bottomColor={bottomColor} />;
  return <DirectPresetPanel category={category} applyCasePreset={applyCasePreset} bottomColor={bottomColor} />;
}

export default function App() {
  const initialShareRef = useRef();
  if (initialShareRef.current === undefined) initialShareRef.current = readInitialShareState();
  const initialShare = initialShareRef.current;
  const workerUrlRef = useRef(new WeakMap());
  const [showMoveCounts, setShowMoveCounts] = useState(() => typeof initialShare.showMoveCounts === "boolean" ? initialShare.showMoveCounts : true);
  const [showNetInput, setShowNetInput] = useState(() => typeof initialShare.showNetInput === "boolean" ? initialShare.showNetInput : false);
  const [patternEditorMode, setPatternEditorMode] = useState(() => initialShare.patternEditorMode === "cube" ? "cube" : "net");
  const [bottomColor, setBottomColor] = useState(() => FACE_ORDER.includes(initialShare.bottomColor) ? initialShare.bottomColor : "D");
  const [menuOpen, setMenuOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [language, setLanguage] = useState(() => typeof initialShare.language === "string" && TEXT[initialShare.language] ? initialShare.language : "ja");
  const t = TEXT[language] || TEXT.ja;
  const [savedOpen, setSavedOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [favorites, setFavorites] = useState(() => readStorageList(STORAGE_KEYS.favorites));
  const [history, setHistory] = useState(() => readStorageList(STORAGE_KEYS.history));
  const [shareMessage, setShareMessage] = useState("");
  const shareMessageTimerRef = useRef(null);
  const [targetAlg, setTargetAlg] = useState(() => typeof initialShare.targetAlg === "string" ? initialShare.targetAlg : "");
  const [targetPattern, setTargetPattern] = useState(() => initialShare.targetPattern || solvedPattern());
  const [patternSeedAlg, setPatternSeedAlg] = useState(() => typeof initialShare.patternSeedAlg === "string" ? initialShare.patternSeedAlg : "");
  const [selectedColor, setSelectedColor] = useState(() => typeof initialShare.selectedColor === "string" ? initialShare.selectedColor : "F");
  const [casePresetCategory, setCasePresetCategory] = useState(() => typeof initialShare.casePresetCategory === "string" && CASE_PRESETS[initialShare.casePresetCategory] ? initialShare.casePresetCategory : "OLL");
  const [casePresetOpen, setCasePresetOpen] = useState(() => typeof initialShare.casePresetCategory === "string" && CASE_PRESETS[initialShare.casePresetCategory] ? initialShare.casePresetCategory : null);
  const [collGroupOpen, setCollGroupOpen] = useState(() => typeof initialShare.collGroupOpen === "string" ? initialShare.collGroupOpen : null);
  const [zbllFamilyOpen, setZbllFamilyOpen] = useState(() => typeof initialShare.zbllFamilyOpen === "string" ? initialShare.zbllFamilyOpen : null);
  const [zbllCollOpen, setZbllCollOpen] = useState(() => typeof initialShare.zbllCollOpen === "string" ? initialShare.zbllCollOpen : null);
  const [zblsF2lOpen, setZblsF2lOpen] = useState(() => typeof initialShare.zblsF2lOpen === "string" ? initialShare.zblsF2lOpen : null);
  const [searchMovesText, setSearchMovesText] = useState(() => typeof initialShare.searchMovesText === "string" ? initialShare.searchMovesText : "");
  const [requiredPartsText, setRequiredPartsText] = useState(() => typeof initialShare.requiredPartsText === "string" ? initialShare.requiredPartsText : "");
  const [maxSymbolDepth, setMaxSymbolDepth] = useState(() => Number.isFinite(initialShare.maxSymbolDepth) ? initialShare.maxSymbolDepth : 15);
  const [limit, setLimit] = useState(() => Number.isFinite(initialShare.limit) ? initialShare.limit : 5);
  const [solutionSortKey, setSolutionSortKey] = useState(() => SOLUTION_SORT_KEYS.includes(initialShare.solutionSortKey) ? initialShare.solutionSortKey : "effective");
  const [solutions, setSolutions] = useState([]);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchExhausted, setSearchExhausted] = useState(false);
  const [canContinueUnsafe, setCanContinueUnsafe] = useState(false);
  const searchSessionRef = useRef(0);
  const workerRef = useRef(null);
  const lastSearchModeRef = useRef("alg");
  function createSearchWorker() { const source = `(${workerMain.toString()})();`; const blob = new Blob([source], { type: "text/javascript" }); const url = URL.createObjectURL(blob); const worker = new Worker(url); workerUrlRef.current.set(worker, url); return worker; }
  function terminateSearchWorker(worker) { if (!worker) return; worker.terminate(); const url = workerUrlRef.current.get(worker); if (url) URL.revokeObjectURL(url); workerUrlRef.current.delete(worker); }
  useEffect(() => () => { if (workerRef.current) terminateSearchWorker(workerRef.current); if (shareMessageTimerRef.current) clearTimeout(shareMessageTimerRef.current); }, []);
  function currentShareState() { return { targetAlg, targetPattern, patternSeedAlg, selectedColor, casePresetCategory, collGroupOpen, zbllFamilyOpen, zbllCollOpen, zblsF2lOpen, showNetInput, patternEditorMode, bottomColor, searchMovesText, requiredPartsText, maxSymbolDepth, limit, showMoveCounts, solutionSortKey, language }; }
  function showTemporaryMessage(message) { if (shareMessageTimerRef.current) clearTimeout(shareMessageTimerRef.current); setShareMessage(message); shareMessageTimerRef.current = setTimeout(() => { setShareMessage(""); shareMessageTimerRef.current = null; }, 1600); }
  async function shareUrl() { const hash = `#s=${encodeShareState(currentShareState())}`; const url = `${window.location.origin}${window.location.pathname}${hash}`; window.history.replaceState(null, "", hash); try { await navigator.clipboard.writeText(url); showTemporaryMessage(t.copied); } catch { showTemporaryMessage(url); } }
  function saveHistoryItem(mode) { const item = { id: Date.now(), mode, targetAlg, targetPattern, patternSeedAlg, searchMovesText, requiredPartsText, maxSymbolDepth, limit }; const itemKey = JSON.stringify({ mode, targetAlg, targetPattern, patternSeedAlg, searchMovesText, requiredPartsText, maxSymbolDepth, limit }); const next = [item, ...history.filter((x) => JSON.stringify({ mode: x.mode, targetAlg: x.targetAlg, targetPattern: x.targetPattern, patternSeedAlg: x.patternSeedAlg || "", searchMovesText: x.searchMovesText, requiredPartsText: x.requiredPartsText || "", maxSymbolDepth: x.maxSymbolDepth, limit: x.limit }) !== itemKey)].slice(0, 12); setHistory(next); writeStorageList(STORAGE_KEYS.history, next); }
  function applyHistoryItem(item) { if (item.targetAlg !== undefined) setTargetAlg(item.targetAlg); if (item.targetPattern) setTargetPattern(item.targetPattern); setPatternSeedAlg(item.patternSeedAlg || ""); if (item.searchMovesText !== undefined) setSearchMovesText(item.searchMovesText); if (item.requiredPartsText !== undefined) setRequiredPartsText(item.requiredPartsText || ""); if (item.maxSymbolDepth !== undefined) setMaxSymbolDepth(item.maxSymbolDepth); if (item.limit !== undefined) setLimit(item.limit); setShowNetInput(item.mode === "pattern"); setMenuOpen(false); }
  function saveFavoriteSolution(solution) { const alg = formatWithSimulUD(solution); const item = { id: Date.now(), alg }; const next = [item, ...favorites.filter((x) => x.alg !== alg)].slice(0, 30); setFavorites(next); writeStorageList(STORAGE_KEYS.favorites, next); }
  async function copyText(text) { try { await navigator.clipboard.writeText(text); showTemporaryMessage(t.copied); } catch { showTemporaryMessage(text); } }
  function applyCasePreset(preset) { setTargetPattern(clonePattern(preset.pattern)); setPatternSeedAlg(preset.seedAlg || preset.alg || ""); setSelectedColor(DONT_CARE); }
  function editTargetPattern(nextPattern) { setPatternSeedAlg(""); setTargetPattern(nextPattern); }
  function stopSearch() { searchSessionRef.current += 1; if (workerRef.current) { terminateSearchWorker(workerRef.current); workerRef.current = null; } setIsSearching(false); setCanContinueUnsafe(false); setSearchExhausted(false); }
  function continuePausedSearch() { if (!workerRef.current) { runSearch(lastSearchModeRef.current, { allowUnsafe: true }); return; } setError(""); setCanContinueUnsafe(false); setIsSearching(true); workerRef.current.postMessage({ command: "continue" }); }
  async function runSearch(mode, options = {}) { const currentSession = searchSessionRef.current + 1; lastSearchModeRef.current = mode; searchSessionRef.current = currentSession; if (workerRef.current) { terminateSearchWorker(workerRef.current); workerRef.current = null; } setError(""); setCanContinueUnsafe(false); setHasSearched(true); setIsSearching(true); setSearchExhausted(false); setSolutions([]); saveHistoryItem(mode); const worker = createSearchWorker(); workerRef.current = worker; let receivedAnySolution = false; worker.onmessage = (event) => { if (searchSessionRef.current !== currentSession) return; const data = event.data; if (data.type === "solution") { receivedAnySolution = true; setSolutions((prev) => insertSolutionUnique(prev, data.solution)); return; } if (data.type === "paused") { setError(data.message); setCanContinueUnsafe(true); setIsSearching(false); return; } if (data.type === "error") { setError(data.message); setCanContinueUnsafe(String(data.message || "").includes("探索が大きすぎ")); setIsSearching(false); terminateSearchWorker(worker); if (workerRef.current === worker) workerRef.current = null; return; } if (data.type === "done") { if (!receivedAnySolution) setSolutions([]); setSearchExhausted(Boolean(data.completed)); setIsSearching(false); terminateSearchWorker(worker); if (workerRef.current === worker) workerRef.current = null; } }; worker.onerror = (event) => { if (searchSessionRef.current !== currentSession) return; setError(event.message || "Worker error"); setCanContinueUnsafe(String(event.message || "").includes("探索が大きすぎ")); setIsSearching(false); terminateSearchWorker(worker); if (workerRef.current === worker) workerRef.current = null; }; worker.postMessage({ mode, targetAlg, targetPattern, seedAlg: mode === "alg" ? targetAlg : patternSeedAlg, searchMovesText, requiredPartsText, maxSymbolDepth: Number(maxSymbolDepth), allowUnsafe: Boolean(options.allowUnsafe) }); }
  const displayedSolutions = sortedSolutions(solutions, solutionSortKey);
  return <div className="dark-mode min-h-screen px-4 pb-4 pt-16 text-slate-900 md:px-8 md:pb-8 md:pt-16"><style>{`body{background:#27272a}.dark-mode{background:#27272a!important;color:#f4f4f5!important}.dark-mode .bg-white,.dark-mode .light-panel{background-color:#3f3f46!important}.dark-mode .bg-slate-50,.dark-mode .light-inner{background-color:#34343a!important}.dark-mode .bg-slate-100{background-color:#52525b!important}.dark-mode .text-slate-900{color:#fafafa!important}.dark-mode .text-slate-700,.dark-mode .text-slate-600{color:#e5e7eb!important}.dark-mode .text-slate-500{color:#d4d4d8!important}.dark-mode .border-slate-200,.dark-mode .border-slate-300{border-color:#71717a!important}.dark-mode input,.dark-mode textarea{background-color:#52525b!important;color:#fff!important;border-color:#71717a!important}.dark-mode input::placeholder,.dark-mode textarea::placeholder{color:#d4d4d8!important}.dark-mode button.bg-white{background-color:#52525b!important;color:#fff!important}.dark-mode button.bg-white:hover{background-color:#60606a!important}.dark-mode .menu-button{background-color:#52525b!important;color:#fff!important;border-color:#a1a1aa!important}.dark-mode .menu-panel{background-color:#3f3f46!important;border-color:#a1a1aa!important}.dark-mode .menu-item{background-color:#52525b!important;color:#fff!important;border:1px solid #a1a1aa!important}.dark-mode .menu-item:hover{background-color:#63636d!important}.dark-mode .menu-item span{color:#fff!important}`}</style>{menuOpen ? <button type="button" aria-label="close menu" onClick={() => { setMenuOpen(false); setLanguageOpen(false); }} className="fixed inset-0 z-40 cursor-default bg-transparent" /> : null}<div className="fixed left-4 top-4 z-50"><button onClick={() => setMenuOpen((v) => !v)} className="menu-button flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-300 bg-white text-xl font-normal text-slate-900 shadow-sm transition hover:bg-slate-50 active:scale-95" aria-label="menu">☰</button>{menuOpen ? <div className="menu-panel mt-2 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg" onClick={(e) => e.stopPropagation()}><button onClick={() => setShowMoveCounts((v) => !v)} className="menu-item flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-normal text-slate-900 transition hover:bg-slate-50 active:scale-95"><span>{t.showMoveCounts}</span><span>{showMoveCounts ? "ON" : "OFF"}</span></button><button data-testid="toggle-net-input" onClick={() => setShowNetInput((v) => !v)} className="menu-item mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-normal text-slate-900 transition hover:bg-slate-50 active:scale-95"><span>{t.netInput}</span><span>{showNetInput ? t.netMode : t.algMode}</span></button><button onClick={shareUrl} className="menu-item mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-normal text-slate-900 transition hover:bg-slate-50 active:scale-95"><span>{t.shareUrl}</span><span>↗</span></button><button onClick={() => setSavedOpen((v) => !v)} className="menu-item mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-normal text-slate-900 transition hover:bg-slate-50 active:scale-95"><span>{t.saved}</span><span>{savedOpen ? "▴" : favorites.length}</span></button>{savedOpen ? <div className="mt-2 max-h-52 overflow-auto rounded-xl border border-slate-200 p-2">{favorites.length ? favorites.map((item) => <button key={item.id} onClick={() => copyText(item.alg)} className="menu-item mb-1 block w-full rounded-xl px-3 py-2 text-left font-mono text-xs text-slate-900 transition hover:bg-slate-50 active:scale-95">{item.alg}</button>) : <div className="px-3 py-2 text-xs text-slate-500">0</div>}{favorites.length ? <button onClick={() => { setFavorites([]); writeStorageList(STORAGE_KEYS.favorites, []); }} className="menu-item mt-2 w-full rounded-xl px-3 py-2 text-xs text-slate-900">{t.clear}</button> : null}</div> : null}<button onClick={() => setHistoryOpen((v) => !v)} className="menu-item mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-normal text-slate-900 transition hover:bg-slate-50 active:scale-95"><span>{t.history}</span><span>{historyOpen ? "▴" : history.length}</span></button>{historyOpen ? <div className="mt-2 max-h-52 overflow-auto rounded-xl border border-slate-200 p-2">{history.length ? history.map((item) => <button key={item.id} onClick={() => applyHistoryItem(item)} className="menu-item mb-1 block w-full rounded-xl px-3 py-2 text-left text-xs text-slate-900 transition hover:bg-slate-50 active:scale-95"><div className="font-mono">{item.searchMovesText}</div><div className="truncate text-slate-500">{item.mode === "alg" ? item.targetAlg : t.searchFromNet}</div></button>) : <div className="px-3 py-2 text-xs text-slate-500">0</div>}{history.length ? <button onClick={() => { setHistory([]); writeStorageList(STORAGE_KEYS.history, []); }} className="menu-item mt-2 w-full rounded-xl px-3 py-2 text-xs text-slate-900">{t.clear}</button> : null}</div> : null}<button onClick={() => setLanguageOpen((v) => !v)} className="menu-item mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-normal text-slate-900 transition hover:bg-slate-50 active:scale-95"><span>{t.language}</span><span>{languageOpen ? "▴" : LANGUAGE_LABEL[language]}</span></button>{languageOpen ? <div className="mt-2 rounded-xl border border-slate-200 p-2">{Object.keys(TEXT).map((lang) => <button key={lang} onClick={() => { setLanguage(lang); setLanguageOpen(false); }} className={`menu-item mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-normal text-slate-900 transition hover:bg-slate-50 active:scale-95 ${language === lang ? "ring-2 ring-slate-400" : ""}`}><span>{LANGUAGE_LABEL[lang]}</span><span>{language === lang ? "✓" : ""}</span></button>)}</div> : null}</div> : null}</div><div className="mx-auto max-w-6xl"><h1 className="mb-6 text-center text-4xl font-normal tracking-tight text-slate-900 sm:text-5xl">{t.title}</h1><div className="light-panel mb-6 rounded-3xl p-6 shadow-sm ring-1 ring-slate-200"><div className="grid gap-4">{!showNetInput ? <div className="light-inner rounded-3xl border border-slate-200 p-4 shadow-sm"><textarea value={targetAlg} onChange={(e) => setTargetAlg(e.target.value)} placeholder={t.inputPlaceholder} className="h-14 w-full resize-none rounded-2xl border border-slate-300 bg-white px-3 py-4 font-mono text-sm leading-5 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-slate-400" /><div className="mt-3 flex flex-wrap justify-end gap-2"><button onClick={() => isSearching ? stopSearch() : runSearch("alg")} className={`rounded-xl border px-4 py-2 text-sm font-normal shadow-sm transition hover:bg-slate-50 active:scale-95 ${isSearching ? "border-slate-500 bg-slate-800 text-white hover:bg-slate-700" : "border-slate-300 bg-white text-slate-900"}`}>{isSearching ? "停止" : t.searchFromAlg}</button></div></div> : <div className="light-inner overflow-hidden rounded-3xl border border-slate-200 p-3 sm:p-4"><div className="mb-4 rounded-2xl border border-slate-300 bg-white p-3">
  <div className="flex flex-wrap gap-2">
    {CASE_PRESET_CATEGORIES.map((category) => (
      <button
        key={category}
        type="button"
        data-testid={`preset-category-${category}`}
        onClick={() => {
          setCasePresetCategory(category);
          setCasePresetOpen((prev) => (prev === category ? null : category));
        }}
        className={`flex h-8 min-w-[72px] items-center justify-center gap-2 rounded-lg border px-3 text-xs font-normal transition active:scale-95 ${casePresetCategory === category ? "border-slate-900 bg-white ring-2 ring-slate-400" : "border-slate-300 bg-slate-50 hover:bg-white"}`}
      >
        <span className="font-mono">{category}</span>
        <span>{casePresetOpen === category ? "▴" : "▾"}</span>
      </button>
    ))}
  </div>
  {casePresetOpen ? (
    <div data-testid="preset-panel" className="mt-3 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
      <CasePresetPanel
        category={casePresetOpen}
        collGroupOpen={collGroupOpen}
        setCollGroupOpen={setCollGroupOpen}
        zbllFamilyOpen={zbllFamilyOpen}
        setZbllFamilyOpen={setZbllFamilyOpen}
        zbllCollOpen={zbllCollOpen}
        setZbllCollOpen={setZbllCollOpen}
        zblsF2lOpen={zblsF2lOpen}
        setZblsF2lOpen={setZblsF2lOpen}
        applyCasePreset={applyCasePreset}
        bottomColor={bottomColor}
      />
    </div>
  ) : null}
</div><PatternInputEditor pattern={targetPattern} setPattern={editTargetPattern} selectedColor={selectedColor} setSelectedColor={setSelectedColor} editorMode={patternEditorMode} setEditorMode={setPatternEditorMode} bottomColor={bottomColor} setBottomColor={setBottomColor} /><div className="mt-4 flex justify-end"><button onClick={() => isSearching ? stopSearch() : runSearch("pattern")} className={`w-fit whitespace-nowrap rounded-xl border px-4 py-2 text-sm font-normal shadow-sm transition hover:bg-slate-50 active:scale-95 ${isSearching ? "border-slate-500 bg-slate-800 text-white hover:bg-slate-700" : "border-slate-300 bg-white text-slate-900"}`}>{isSearching ? "停止" : t.searchFromNet}</button></div></div>}<div className="grid items-start gap-4 sm:grid-cols-3"><label className="grid gap-1"><span className="text-sm font-normal">{t.generator}</span><input value={searchMovesText} onChange={(e) => setSearchMovesText(e.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-5 outline-none focus:ring-2 focus:ring-slate-400" placeholder="例: R U D / R U f / R U S / R U x" /><div className="mt-2 flex flex-wrap gap-1.5">{PRESET_GENS.map((preset) => <button key={preset} type="button" onClick={() => setSearchMovesText(preset)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-700 transition hover:bg-slate-50 active:scale-95">{preset}</button>)}</div></label><label className="grid gap-1"><span className="text-sm font-normal">{t.requiredParts}</span><input value={requiredPartsText} onChange={(e) => setRequiredPartsText(e.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-5 outline-none focus:ring-2 focus:ring-slate-400" placeholder={t.requiredPartsPlaceholder} /><div className="mt-2 flex flex-wrap gap-1.5">{REQUIRED_PART_PRESETS.map((preset) => <button key={preset} type="button" onClick={() => setRequiredPartsText((prev) => prev.trim() ? `${prev.trim()}${NL}${preset}` : preset)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-700 transition hover:bg-slate-50 active:scale-95">{preset}</button>)}</div></label><NumberInput label={t.depthLimit} value={maxSymbolDepth} onChange={setMaxSymbolDepth} min={1} max={30} /></div></div></div>{error ? <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-700"><span>{error}</span>{canContinueUnsafe ? <button type="button" onClick={continuePausedSearch} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-normal text-slate-700 transition hover:bg-slate-50 active:scale-95">{t.unsafeContinue}</button> : null}</div> : null}{shareMessage ? <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">{shareMessage}</div> : null}<div className="mb-4">{isSearching ? <ThinkingCard foundCount={displayedSolutions.length} t={t} /> : !error && hasSearched && searchExhausted && solutions.length > 0 ? <ResultSummaryCard text={typeof t.searchFinished === "function" ? t.searchFinished(displayedSolutions.length) : t.searchFinished} /> : null}</div>{solutions.length ? <SolutionSortControls sortKey={solutionSortKey} setSortKey={setSolutionSortKey} language={language} /> : null}<div data-testid="solution-list" className="grid gap-4">{displayedSolutions.map((solution) => <SolutionCard key={algToString(solution)} solution={solution} t={t} language={language} showMoveCounts={showMoveCounts} onSave={saveFavoriteSolution} onCopy={copyText} />)}</div>{!isSearching && !error && hasSearched && solutions.length === 0 ? <div className="mt-4"><EmptyCard text={t.noResults} /></div> : null}{!hasSearched && !isSearching ? <div className="mt-4"><EmptyCard text={t.initialHelp} /></div> : null}</div></div>;
}
