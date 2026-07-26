import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  COLL_PRESET_DATA,
  ZBLL_PRESET_DATA,
  ZBLS_F2L_PRESET_DATA,
  ZBLS_PRESET_DATA,
} from "./presetData.generated.js";
import { analyzeSolutionMoves, matchesSolutionFilters } from "./solutionAnalysis.js";
import "./App.css";

const FACE_ORDER = ["U", "R", "F", "D", "L", "B"];
const DONT_CARE = "X";
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
const MOVE_TOKEN_RE = /^([URFDLBMESxyzurfdlb](?:w)?)(2|')?/;
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

function logicalFaceForDisplayColor(bottomFace, displayColor) {
  const colorMap = displayColorMapForBottom(bottomFace);
  return FACE_ORDER.find((face) => colorMap[face] === displayColor) || displayColor;
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
    .replace(/([URFDLB])w/g, (_, face) => face.toLowerCase());
}

function parseFlatAlg(alg) {
  const text = normalizeAlgText(alg).replaceAll(",", " ");
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

function parseAlg(alg) {
  const text = normalizeAlgText(alg);
  if (!text.includes("[") && !text.includes("(")) return parseFlatAlg(text);
  let position = 0;

  function skipWhitespace() {
    while (/\s/.test(text[position] || "")) position += 1;
  }

  function applyGroupSuffix(moves) {
    if (text[position] === "'") {
      position += 1;
      return inverseAlgList(moves);
    }
    if (text[position] === "2") {
      position += 1;
      return moves.concat(moves);
    }
    return moves;
  }

  function parseSequence(stoppers = new Set()) {
    const moves = [];
    while (position < text.length) {
      skipWhitespace();
      const current = text[position];
      if (!current || stoppers.has(current)) break;
      if (current === ",") {
        position += 1;
        continue;
      }
      if (current === "[") {
        position += 1;
        const left = parseSequence(new Set([",", ":", "]"]));
        skipWhitespace();
        const separator = text[position];
        if (!left.length || (separator !== "," && separator !== ":")) throw new Error(`Invalid bracket notation near ${text.slice(position)}`);
        position += 1;
        const right = parseSequence(new Set(["]"]));
        skipWhitespace();
        if (!right.length || text[position] !== "]") throw new Error(`Invalid bracket notation near ${text.slice(position)}`);
        position += 1;
        const expanded = separator === ","
          ? left.concat(right, inverseAlgList(left), inverseAlgList(right))
          : left.concat(right, inverseAlgList(left));
        moves.push(...applyGroupSuffix(expanded));
        continue;
      }
      if (current === "(") {
        position += 1;
        const grouped = parseSequence(new Set([")"]));
        skipWhitespace();
        if (text[position] !== ")") throw new Error(`Invalid group near ${text.slice(position)}`);
        position += 1;
        moves.push(...applyGroupSuffix(grouped));
        continue;
      }
      const match = text.slice(position).match(MOVE_TOKEN_RE);
      if (!match) throw new Error(`Invalid algorithm near ${text.slice(position)}`);
      moves.push(match[1] + (match[2] || ""));
      position += match[0].length;
    }
    return moves;
  }

  const moves = parseSequence();
  skipWhitespace();
  if (position !== text.length) throw new Error(`Invalid algorithm near ${text.slice(position)}`);
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

const SOLUTION_SORT_KEYS = ["symbol", "ease", "regrip"];
const DEFAULT_SOLUTION_FILTERS = { auf: "all", regrip: "all", ease: "all", feature: "all" };
const SOLUTION_FILTER_OPTIONS = {
  feature: ["all", "sune", "sledge"],
};

function solutionAnalysis(solution) {
  return analyzeSolutionMoves(cleanMoves(solution));
}

function solutionMetricValue(solution, sortKey) {
  const analysis = solutionAnalysis(solution);
  if (sortKey === "ease") return -analysis.ease.score;
  if (sortKey === "symbol") return analysis.metrics.symbolMoves;
  if (sortKey === "quarter") return analysis.metrics.quarterTurns;
  if (sortKey === "regrip") return analysis.regrip.count ?? Number.POSITIVE_INFINITY;
  return analysis.metrics.effectiveMoves;
}

function compareSolutions(a, b, sortKey = "effective") {
  const fallbackKeys = sortKey === "ease"
    ? ["ease", "regrip", "effective", "symbol", "quarter"]
    : [sortKey, "regrip", "ease", "effective", "symbol", "quarter"];
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

function formatCleanMovesWithSimulUDSegments(cleaned) {
  const segments = [];
  for (let i = 0; i < cleaned.length;) {
    if (i + 1 < cleaned.length && isParallelPair(cleaned[i], cleaned[i + 1])) {
      segments.push(
        { text: "(", moveIndex: null },
        { text: cleaned[i], moveIndex: i },
        { text: cleaned[i + 1], moveIndex: i + 1 },
        { text: ")", moveIndex: null },
      );
      i += 2;
    } else {
      segments.push({ text: cleaned[i], moveIndex: i });
      i += 1;
    }
  }
  return segments;
}

function formatMoveRange(moves, start, end) {
  return formatCleanMovesWithSimulUDSegments(moves.slice(start, end)).map((segment) => segment.text).join(" ");
}

const ANNOTATED_FEATURE_TYPES = new Set(["sune", "sledge"]);

function appendDisplayChunk(chunks, text, feature = null) {
  if (!text) return;
  const previous = chunks[chunks.length - 1];
  if (previous?.feature === feature) previous.text += text;
  else chunks.push({ text, feature });
}

function appendDisplayChunks(target, source) {
  for (const chunk of source) appendDisplayChunk(target, chunk.text, chunk.feature);
}

function joinDisplayChunkGroups(groups, separator = " ") {
  const chunks = [];
  for (const group of groups.filter((candidate) => candidate.length)) {
    if (chunks.length) appendDisplayChunk(chunks, separator);
    appendDisplayChunks(chunks, group);
  }
  return chunks;
}

function makeNotationRangeChunks(moves, features, rangeStart, rangeEnd, selectedFeature) {
  const featureAt = Array(rangeEnd - rangeStart).fill(null);
  for (const feature of features) {
    if (feature.start < rangeStart || feature.end > rangeEnd) continue;
    for (let index = feature.start; index < feature.end; index += 1) {
      const localIndex = index - rangeStart;
      if (!featureAt[localIndex]) featureAt[localIndex] = feature;
    }
  }

  const groups = [];
  for (let start = rangeStart; start < rangeEnd;) {
    const feature = featureAt[start - rangeStart];
    let end = start + 1;
    while (end < rangeEnd && featureAt[end - rangeStart] === feature) end += 1;
    if (feature && start === feature.start && end === feature.end) {
      groups.push(makeNotationFeatureChunks(moves, features, feature, selectedFeature));
    } else {
      groups.push([{ text: formatMoveRange(moves, start, end), feature: null }]);
    }
    start = end;
  }
  return joinDisplayChunkGroups(groups);
}

function makeNotationFeatureChunks(moves, features, feature, selectedFeature) {
  if (feature.type === "conjugate") {
    const setupStart = feature.start;
    const setupEnd = setupStart + feature.setupLength;
    const coreEnd = setupEnd + feature.coreLength;
    const chunks = [];
    appendDisplayChunk(chunks, "[");
    appendDisplayChunks(chunks, makeNotationRangeChunks(moves, features, setupStart, setupEnd, selectedFeature));
    appendDisplayChunk(chunks, ":");
    appendDisplayChunks(chunks, makeNotationRangeChunks(moves, features, setupEnd, coreEnd, selectedFeature));
    appendDisplayChunk(chunks, "]");
    return chunks;
  }
  const highlighted = ANNOTATED_FEATURE_TYPES.has(feature.type)
    && (selectedFeature === "all" || feature.type === selectedFeature);
  return [{ text: formatMoveRange(moves, feature.start, feature.end), feature: highlighted ? feature : null }];
}

function makeFeatureDisplayChunks(moves, features, selectedFeature) {
  const displayFeatures = features.filter((feature) => feature.type !== "commutator");
  return makeNotationRangeChunks(moves, displayFeatures, 0, moves.length, selectedFeature);
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

function insertSolutionsUnique(list, solutions) {
  const keys = new Set(list.map((solution) => algToString(solution)));
  const next = [...list];
  for (const solution of solutions) {
    const normalized = cleanMoves(solution);
    const key = algToString(normalized);
    if (keys.has(key)) continue;
    keys.add(key);
    next.push(normalized);
  }
  return next.length === list.length ? list : next;
}

const LANGUAGE_LABEL = { ja: "日本語", en: "English", ur: "اردو", ko: "한국어", hi: "हिन्दी", ar: "العربية" };
const TEXT = {
  ja: { title: "手順探索", darkMode: "ダークモード", showMoveCounts: "手数を表示", netInput: "入力方式", language: "言語", shareUrl: "URL共有", saved: "保存済み", history: "履歴", favorite: "保存", clear: "削除", copied: "コピーしました", unsafeContinue: "上限なしで続ける", inputPlaceholder: "既存の手順を入力…", searchFromAlg: "手順から探索", searchFromNet: "展開図から探索", algMode: "手順", netMode: "展開図", casePresets: "状態プリセット", generator: "生成系", requiredParts: "必須パーツ", requiredPartsPlaceholder: "例: R U R' U'", depthLimit: "手数上限", resultLimit: "表示件数", copy: "コピー", simultaneous: "同時回し", symbolMoves: "記号手数", quarterTurns: "90度手数", thinkingTitle: "探索中…", thinkingBody: (n) => `見つかった手順から順に表示しています。現在 ${n} 件。`, noResults: "条件に一致する手順が見つかりませんでした。", searchFinished: (n) => `${n}件の結果が見つかりました。`, initialHelp: "条件を入力して、探索を開始してください。" },
  en: { title: "Algorithm Search", darkMode: "Dark mode", showMoveCounts: "Show move counts", netInput: "Input mode", language: "Language", shareUrl: "Share URL", saved: "Saved", history: "History", favorite: "Save", clear: "Clear", copied: "Copied", unsafeContinue: "Continue without limit", inputPlaceholder: "Enter an existing solution…", searchFromAlg: "Search from algorithm", searchFromNet: "Search from net", algMode: "Algorithm", netMode: "Net", casePresets: "State presets", generator: "Generator", requiredParts: "Required parts", requiredPartsPlaceholder: "e.g. R U R' U'", depthLimit: "Move limit", resultLimit: "Results", copy: "Copy", simultaneous: "Simul moves", symbolMoves: "Move count", quarterTurns: "Quarter turns", thinkingTitle: "Searching…", thinkingBody: (n) => `Showing results as they are found. ${n} found so far.`, noResults: "No matching algorithms found.", searchFinished: (n) => `${n} result${n === 1 ? "" : "s"} found.`, initialHelp: "Enter conditions and start searching." },
  ur: { title: "طریقہ تلاش", darkMode: "ڈارک موڈ", showMoveCounts: "چالوں کی گنتی دکھائیں", netInput: "طریقۂ اندراج", language: "زبان", shareUrl: "URL شیئر کریں", saved: "محفوظ", history: "تاریخچہ", favorite: "محفوظ کریں", clear: "حذف", copied: "کاپی ہو گیا", unsafeContinue: "حد کے بغیر جاری رکھیں", inputPlaceholder: "موجودہ حل کا طریقہ درج کریں…", searchFromAlg: "طریقے سے تلاش", searchFromNet: "نیٹ سے تلاش", algMode: "طریقہ", netMode: "نیٹ", casePresets: "حالت presets", generator: "جنریٹر", requiredParts: "لازمی حصہ", requiredPartsPlaceholder: "مثال: R U R' U'", depthLimit: "چالوں کی حد", resultLimit: "نتائج", copy: "کاپی", simultaneous: "ساتھ چالیں", symbolMoves: "چالوں کی گنتی", quarterTurns: "کوارٹر ٹرنز", thinkingTitle: "تلاش جاری…", thinkingBody: (n) => `ملنے والے طریقے فوراً دکھائے جا رہے ہیں۔ اب تک ${n} ملے۔`, noResults: "شرائط سے ملتا ہوا کوئی طریقہ نہیں ملا۔", searchFinished: (n) => `${n} نتائج ملے۔`, initialHelp: "شرائط درج کریں اور تلاش شروع کریں۔" },
  ko: { title: "수순 탐색", darkMode: "다크 모드", showMoveCounts: "수순 수 표시", netInput: "입력 방식", language: "언어", shareUrl: "URL 공유", saved: "저장됨", history: "기록", favorite: "저장", clear: "삭제", copied: "복사했습니다", unsafeContinue: "제한 없이 계속", inputPlaceholder: "기존 해법을 입력…", searchFromAlg: "알고리즘으로 탐색", searchFromNet: "전개도에서 탐색", algMode: "알고리즘", netMode: "전개도", casePresets: "상태 프리셋", generator: "생성계", requiredParts: "필수 파트", requiredPartsPlaceholder: "예: R U R' U'", depthLimit: "수순 제한", resultLimit: "표시 개수", copy: "복사", simultaneous: "동시 회전", symbolMoves: "기호 수", quarterTurns: "90도 회전 수", thinkingTitle: "탐색 중…", thinkingBody: (n) => `찾은 수순을 순서대로 표시하고 있습니다. 현재 ${n}개.`, noResults: "조건에 맞는 수순을 찾지 못했습니다.", searchFinished: (n) => `${n}개 결과를 찾았습니다.`, initialHelp: "조건을 입력하고 탐색을 시작하세요." },
  hi: { title: "एल्गोरिदम खोज", darkMode: "डार्क मोड", showMoveCounts: "चालों की संख्या दिखाएँ", netInput: "इनपुट मोड", language: "भाषा", shareUrl: "URL साझा करें", saved: "सहेजे गए", history: "इतिहास", favorite: "सहेजें", clear: "हटाएँ", copied: "कॉपी हुआ", unsafeContinue: "सीमा के बिना जारी रखें", inputPlaceholder: "मौजूदा समाधान दर्ज करें…", searchFromAlg: "एल्गोरिदम से खोजें", searchFromNet: "नेट से खोजें", algMode: "एल्गोरिदम", netMode: "नेट", casePresets: "स्टेट प्रीसेट", generator: "जनरेटर", requiredParts: "ज़रूरी भाग", requiredPartsPlaceholder: "उदाहरण: R U R' U'", depthLimit: "चाल सीमा", resultLimit: "परिणाम संख्या", copy: "कॉपी", simultaneous: "साथ-साथ चालें", symbolMoves: "चालों की संख्या", quarterTurns: "90° चालें", thinkingTitle: "खोज जारी…", thinkingBody: (n) => `मिले हुए तरीके क्रम से दिखाए जा रहे हैं। अभी तक ${n} मिले।`, noResults: "शर्तों से मिलता कोई तरीका नहीं मिला।", searchFinished: (n) => `${n} परिणाम मिले।`, initialHelp: "शर्तें दर्ज करें और खोज शुरू करें।" },
  ar: { title: "البحث عن الخوارزميات", darkMode: "الوضع الداكن", showMoveCounts: "إظهار عدد الحركات", netInput: "طريقة الإدخال", language: "اللغة", shareUrl: "مشاركة الرابط", saved: "محفوظ", history: "السجل", favorite: "حفظ", clear: "حذف", copied: "تم النسخ", unsafeContinue: "المتابعة بلا حد", inputPlaceholder: "أدخل الحل الموجود…", searchFromAlg: "البحث من الخوارزمية", searchFromNet: "البحث من المخطط", algMode: "الخوارزمية", netMode: "المخطط", casePresets: "إعدادات الحالة", generator: "المولد", requiredParts: "جزء إلزامي", requiredPartsPlaceholder: "مثال: R U R' U'", depthLimit: "حد الحركات", resultLimit: "عدد النتائج", copy: "نسخ", simultaneous: "حركات متزامنة", symbolMoves: "عدد الحركات", quarterTurns: "دورات 90°", thinkingTitle: "جارٍ البحث…", thinkingBody: (n) => `يتم عرض النتائج فور العثور عليها. تم العثور على ${n} حتى الآن.`, noResults: "لم يتم العثور على خوارزميات مطابقة.", searchFinished: (n) => `تم العثور على ${n} نتيجة.`, initialHelp: "أدخل الشروط وابدأ البحث." },
};

const SEARCH_FORM_TEXT = {
  ja: { stateMode: "Cube", requiredPatterns: "必須パターン", forbiddenPatterns: "禁止パターン", patternPlaceholder: "例: R U R' U'", depthLimit: "HTM上限", search: "探索" },
  en: { stateMode: "State", requiredPatterns: "Required patterns", forbiddenPatterns: "Forbidden patterns", patternPlaceholder: "e.g. R U R' U'", depthLimit: "HTM limit", search: "Search" },
  ur: { stateMode: "حالت", requiredPatterns: "لازمی پیٹرن", forbiddenPatterns: "ممنوعہ پیٹرن", patternPlaceholder: "R U R' U'", depthLimit: "HTM حد", search: "تلاش" },
  ko: { stateMode: "상태", requiredPatterns: "필수 패턴", forbiddenPatterns: "금지 패턴", patternPlaceholder: "예: R U R' U'", depthLimit: "HTM 제한", search: "탐색" },
  hi: { stateMode: "स्थिति", requiredPatterns: "आवश्यक पैटर्न", forbiddenPatterns: "निषिद्ध पैटर्न", patternPlaceholder: "उदाहरण: R U R' U'", depthLimit: "HTM सीमा", search: "खोजें" },
  ar: { stateMode: "الحالة", requiredPatterns: "نمط مطلوب", forbiddenPatterns: "نمط ممنوع", patternPlaceholder: "مثال: R U R' U'", depthLimit: "حد HTM", search: "بحث" },
};

const SORT_BY_LABEL = { ja: "Sort", en: "Sort", ur: "Sort", ko: "정렬", hi: "Sort", ar: "Sort" };
const REGRIP_LABEL = { ja: "リグリップ", en: "Regrips", ur: "Regrips", ko: "리그립", hi: "Regrips", ar: "Regrips" };
const SOLUTION_SORT_LABELS = {
  ease: { ja: "EASE", en: "EASE", ur: "EASE", ko: "EASE", hi: "EASE", ar: "EASE" },
  symbol: { ja: "HTM", en: "HTM", ur: "HTM", ko: "HTM", hi: "HTM", ar: "HTM" },
  regrip: { ja: "リグリップ", en: "Regrips", ur: "Regrips", ko: "리그립", hi: "Regrips", ar: "Regrips" },
};
const RESULT_ANALYSIS_TEXT = {
  ja: {
    filters: "絞り込み",
    reset: "リセット",
    auf: "AUF",
    aufOptions: { all: "すべて", none: "なし", any: "あり", start: "先頭のみ", end: "末尾のみ", both: "両端" },
    regrip: "リグリップ",
    regripOptions: { all: "すべて", 0: "0回", 1: "1回以下", 2: "2回以下", known: "解析可能" },
    ease: "回しやすさ",
    easeOptions: { all: "すべて", 90: "90以上", 78: "78以上", 65: "65以上" },
    feature: "Pattern",
    featureOptions: { all: "All", sune: "Sune", sledge: "Sledgehammer" },
    filteredEmpty: "絞り込み条件に一致する手順がありません。",
    regripTitle: "最小リグリップ経路",
    regripTitles: { right: "右親指の最小経路", left: "左親指の最小経路" },
    regripUnavailable: "この手順は現在の左右リグリップモデルでは解析できません。",
    start: "開始",
    end: "終了",
    regripAction: "持ち替え",
    physicalAs: "として回す",
    easeTitle: "EASE",
    moveCountTitle: "手数の内訳",
    featureNames: { sune: "Sune", sledge: "Sledgehammer" },
    featureShortNames: { sune: "Sune", sledge: "Sledge" },
    breakdown: { base: "BASE", htm: "HTM", patterns: "PATTERN", regrips: "REGRIP", wide: "WIDE", left: "L", slice: "SLICE", rotation: "ROTATION" },
  },
  en: {
    filters: "Filters",
    reset: "Reset",
    auf: "AUF",
    aufOptions: { all: "All", none: "None", any: "Any", start: "Start only", end: "End only", both: "Both ends" },
    regrip: "Regrips",
    regripOptions: { all: "All", 0: "0", 1: "1 or less", 2: "2 or less", known: "Analyzed" },
    ease: "Ease",
    easeOptions: { all: "All", 90: "90+", 78: "78+", 65: "65+" },
    feature: "Pattern",
    featureOptions: { all: "All", sune: "Sune", sledge: "Sledgehammer" },
    filteredEmpty: "No algorithms match the current filters.",
    regripTitle: "Minimum regrip path",
    regripTitles: { right: "Minimum right-thumb path", left: "Minimum left-thumb path" },
    regripUnavailable: "This algorithm is not supported by the current left/right regrip model.",
    start: "Start",
    end: "End",
    regripAction: "Regrip",
    physicalAs: "execute as",
    easeTitle: "EASE",
    moveCountTitle: "Move counts",
    featureNames: { sune: "Sune", sledge: "Sledgehammer" },
    featureShortNames: { sune: "Sune", sledge: "Sledge" },
    breakdown: { base: "BASE", htm: "HTM", patterns: "PATTERN", regrips: "REGRIP", wide: "WIDE", left: "L", slice: "SLICE", rotation: "ROTATION" },
  },
};
const WORKSPACE_TEXT = {
  ja: { target: "探索対象", conditions: "探索条件", results: "探索結果", input: "入力", output: "出力", stickerColor: "ステッカー", bottomColor: "底面色", found: (n) => `${n}件` },
  en: { target: "Search target", conditions: "Search options", results: "Results", input: "Input", output: "Output", stickerColor: "Sticker", bottomColor: "Bottom", found: (n) => `${n}` },
  ur: { target: "تلاش کا ہدف", conditions: "تلاش کی شرائط", results: "تلاش کے نتائج", input: "ان پٹ", output: "نتائج", stickerColor: "اسٹیکر", bottomColor: "نیچے کا رنگ", found: (n) => `${n}` },
  ko: { target: "탐색 대상", conditions: "탐색 조건", results: "탐색 결과", input: "입력", output: "출력", stickerColor: "스티커", bottomColor: "바닥색", found: (n) => `${n}개` },
  hi: { target: "खोज लक्ष्य", conditions: "खोज शर्तें", results: "खोज परिणाम", input: "इनपुट", output: "आउटपुट", stickerColor: "स्टिकर", bottomColor: "नीचे का रंग", found: (n) => `${n}` },
  ar: { target: "هدف البحث", conditions: "شروط البحث", results: "نتائج البحث", input: "الإدخال", output: "النتائج", stickerColor: "الملصق", bottomColor: "لون الأسفل", found: (n) => `${n}` },
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
  for (const [face, index] of [["U", 1], ["U", 3], ["U", 5], ["U", 7], ["B", 1], ["L", 1], ["F", 1], ["R", 1]]) {
    preview[face][index] = preview[face][index] === "U" ? "U" : DONT_CARE;
  }
  return preview;
}

function collFamilyPreviewPattern(pattern) {
  const preview = collPreviewPattern(pattern);
  for (const [face, index] of [
    ["U", 0], ["U", 2], ["U", 6], ["U", 8],
    ["B", 0], ["B", 2], ["L", 0], ["L", 2],
    ["F", 0], ["F", 2], ["R", 0], ["R", 2],
  ]) {
    preview[face][index] = preview[face][index] === "U" ? "U" : DONT_CARE;
  }
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
    preview: collFamilyPreviewPattern(cases[0].pattern),
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
const STORAGE_KEYS = { history: "cube-search-history-v1" };
function readStorageList(key) { try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
function writeStorageList(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
function searchStateBudget() {
  const mobileViewport = window.matchMedia("(max-width: 720px)").matches;
  const mobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const lowMemoryDevice = Number(navigator.deviceMemory) > 0 && Number(navigator.deviceMemory) <= 4;
  return mobileViewport || mobileDevice || lowMemoryDevice ? 1800000 : 6000000;
}

function workerMain() {
  const FACE_ORDER = ["U", "R", "F", "D", "L", "B"];
  const SOLVED = FACE_ORDER.map((face) => face.repeat(9)).join("");
  const DONT_CARE = "X";
  const DEFAULT_MAX_STORED_STATES = 6000000;
  const SOLUTION_BATCH_SIZE = 16;
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
  const COLOR_CODE = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };

  function packState(state) { let packed = ""; for (let start = 0; start < 54; start += 5) { let value = 0; for (let offset = 0; offset < 5 && start + offset < 54; offset += 1) value |= COLOR_CODE[state[start + offset]] << (offset * 3); packed += String.fromCharCode(value); } return packed; }
  function packedColorAt(state, index) { return (state.charCodeAt(Math.floor(index / 5)) >> ((index % 5) * 3)) & 7; }
  function applyPackedPerm(state, perm) { let next = ""; for (let start = 0; start < 54; start += 5) { let value = 0; for (let offset = 0; offset < 5 && start + offset < 54; offset += 1) value |= packedColorAt(state, perm[start + offset]) << (offset * 3); next += String.fromCharCode(value); } return next; }
  const PACKED_SOLVED = packState(SOLVED);

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
  function parseMovePatterns(text) { return String(text || "").replaceAll("、", NL).replaceAll(",", NL).split(NL).map((part) => part.trim()).filter(Boolean).map((part) => cleanMoves(parseAlg(part))).filter((part) => part.length); }
  function listContainsPattern(list, pattern) { if (pattern.length > list.length) return false; for (let i = 0; i <= list.length - pattern.length; i += 1) { let ok = true; for (let j = 0; j < pattern.length; j += 1) if (list[i + j] !== pattern[j]) { ok = false; break; } if (ok) return true; } return false; }
  function solutionMatchesMovePatterns(solution, requiredPatterns, forbiddenPatterns) { const cleaned = cleanMoves(solution); return requiredPatterns.every((pattern) => listContainsPattern(cleaned, pattern)) && forbiddenPatterns.every((pattern) => !listContainsPattern(cleaned, pattern)); }
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
  function flushSolutions(job) { if (!job.pendingSolutions || !job.pendingSolutions.length) return; self.postMessage({ type: "solutions", solutions: job.pendingSolutions }); job.pendingSolutions = []; }
  function emitSolution(job, solution) { const normalized = trimRedundantFinalAuf(job, solution); if (symbolMoveCount(normalized) > job.maxSymbolDepth) return false; if (!solutionMatchesMovePatterns(normalized, job.requiredPatterns, job.forbiddenPatterns)) return false; if (!solutionMatchesJobTarget(job, normalized)) return false; const key = algToString(normalized); if (job.foundKeys.has(key)) return false; job.foundKeys.add(key); job.foundCount += 1; if (job.captureSolution) job.captureSolution(normalized); else { if (!job.pendingSolutions) job.pendingSolutions = []; job.pendingSolutions.push(normalized); if (job.foundCount === 1 || job.pendingSolutions.length >= SOLUTION_BATCH_SIZE) flushSolutions(job); } return true; }
  function pauseJob(job) { flushSolutions(job); self.postMessage({ type: "paused", message: "メモリ上限で停止しました。" }); }
  function totalStored(job) { return (job.storeA ? job.storeA.states.length : 0) + (job.storeB ? job.storeB.states.length : 0) + (job.forwardStore ? job.forwardStore.states.length : 0) + (job.secondNodes ? job.secondNodes.length : 0); }
  function shouldPause(job) { return totalStored(job) >= job.maxStoredStates; }
  function shouldPauseBeforeLayer(job, front) { const estimatedBranches = Math.max(1, job.moves.length - 3); return totalStored(job) + front.length * estimatedBranches > job.maxStoredStates; }
  function makeStore(initialState) { return { states: [initialState], parent: [-1], move: [""], cost: [0], seen: new Map([[initialState, 0]]) }; }
  function addNode(store, state, parentId, move, cost) { const id = store.states.length; store.states.push(state); store.parent.push(parentId); store.move.push(move); store.cost.push(cost); store.seen.set(state, id); return id; }
  function pathFromNode(store, id) { const out = []; while (id >= 0) { const move = store.move[id]; if (move) out.push(move); id = store.parent[id]; } out.reverse(); return out; }
  function lastTwoMoves(store, id) { if (id < 0) return []; const last = store.move[id]; if (!last) return []; const parentId = store.parent[id]; if (parentId < 0) return [last]; const prev = store.move[parentId]; return prev ? [prev, last] : [last]; }

  function expandAlgLayer(job, side) { const expandingFromStart = side === "A"; const front = expandingFromStart ? job.frontA : job.frontB; const storeSelf = expandingFromStart ? job.storeA : job.storeB; const storeOther = expandingFromStart ? job.storeB : job.storeA; const sideLimit = expandingFromStart ? job.sideSymbolLimitA : job.sideSymbolLimitB; const newFront = []; for (const id of front) { if (job.stopByLimit) break; const state = storeSelf.states[id]; const tail = lastTwoMoves(storeSelf, id); const cost = storeSelf.cost[id]; for (const move of job.moves) { if (job.stopByLimit) break; if (!canAddMove(tail, move)) continue; const nextCost = cost + symbolDelta(tail, move); if (nextCost > sideLimit) continue; const nextState = applyPackedPerm(state, job.movePerms.get(move)); if (storeSelf.seen.has(nextState)) continue; const nextId = addNode(storeSelf, nextState, id, move, nextCost); newFront.push(nextId); if (storeOther.seen.has(nextState)) { const otherId = storeOther.seen.get(nextState); const selfPath = pathFromNode(storeSelf, nextId); const otherPath = pathFromNode(storeOther, otherId); const solution = cleanMoves(expandingFromStart ? selfPath.concat(inverseAlgList(otherPath)) : otherPath.concat(inverseAlgList(selfPath))); if (symbolMoveCount(solution) <= job.maxSymbolDepth) emitSolution(job, solution); } } } if (expandingFromStart) job.frontA = newFront; else job.frontB = newFront; }
  function frontDepth(store, front) { return front.length ? store.cost[front[0]] : 0; }
  function emitPackedJoin(job, side, baseId, extraMoves, state) { const fromStart = side === "A"; const storeSelf = fromStart ? job.storeA : job.storeB; const storeOther = fromStart ? job.storeB : job.storeA; if (!storeOther.seen.has(state)) return; const selfPath = pathFromNode(storeSelf, baseId).concat(extraMoves); const otherPath = pathFromNode(storeOther, storeOther.seen.get(state)); const solution = cleanMoves(fromStart ? selfPath.concat(inverseAlgList(otherPath)) : otherPath.concat(inverseAlgList(selfPath))); if (symbolMoveCount(solution) <= job.maxSymbolDepth) emitSolution(job, solution); }
  function streamExactTail(job, side, extraDepth) { if (extraDepth < 1) return; const fromStart = side === "A"; const front = fromStart ? job.frontA : job.frontB; const store = fromStart ? job.storeA : job.storeB; for (const id of front) { const state = store.states[id]; const tail = lastTwoMoves(store, id); for (const firstMove of job.moves) { if (!canAddMove(tail, firstMove)) continue; const firstState = applyPackedPerm(state, job.movePerms.get(firstMove)); emitPackedJoin(job, side, id, [firstMove], firstState); if (extraDepth < 2) continue; const nextTail = tail.concat(firstMove).slice(-2); for (const secondMove of job.moves) { if (!canAddMove(nextTail, secondMove)) continue; const secondState = applyPackedPerm(firstState, job.movePerms.get(secondMove)); emitPackedJoin(job, side, id, [firstMove, secondMove], secondState); } } } }
  function completeExactSearchWithBoundedTail(job) { const depthA = frontDepth(job.storeA, job.frontA); const depthB = frontDepth(job.storeB, job.frontB); const extraDepth = job.maxSymbolDepth - depthA - depthB; if (extraDepth < 0 || extraDepth > 2) return false; const side = !job.frontA.length ? "B" : !job.frontB.length ? "A" : job.frontA.length <= job.frontB.length ? "A" : "B"; streamExactTail(job, side, extraDepth); return true; }
  function processAlgJob(job) { try { while ((job.frontA.length || job.frontB.length) && !job.stopByLimit) { const side = job.frontA.length && (job.frontA.length <= job.frontB.length || !job.frontB.length) ? "A" : "B"; const front = side === "A" ? job.frontA : job.frontB; const store = side === "A" ? job.storeA : job.storeB; const sideLimit = side === "A" ? job.sideSymbolLimitA : job.sideSymbolLimitB; if (frontDepth(store, front) >= sideLimit) { if (side === "A") job.frontA = []; else job.frontB = []; continue; } if (shouldPauseBeforeLayer(job, front)) { if (!completeExactSearchWithBoundedTail(job)) return pauseJob(job); break; } expandAlgLayer(job, side); if (shouldPause(job)) return pauseJob(job); } flushSolutions(job); self.postMessage({ type: "done", completed: !job.stopByLimit }); } catch (e) { flushSolutions(job); self.postMessage({ type: "error", message: e instanceof Error ? e.message : String(e) }); } }
  function generatorFaceCount(moves) { return new Set(moves.map((move) => move[0])).size; }
  function collectExactSolutions(start, job, maxDepth, stateBudget, onSolution) {
    const storeA = makeStore(packState(start));
    const storeB = makeStore(PACKED_SOLVED);
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
          const nextState = applyPackedPerm(state, job.movePerms.get(move));
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
      const requestedBudget = job.targetState ? FAST_RESTRICTED_STATE_BUDGET : FAST_PARTIAL_RESTRICTED_STATE_BUDGET;
      const restrictedBudget = Math.min(requestedBudget, job.maxStoredStates);
      collectExactSolutions(stateFromSolution(seed), restrictedJob, job.maxSymbolDepth, restrictedBudget, (solution) => emitSolution(job, solution));
    }
    let remainingBudget = Math.min(FAST_REWRITE_STATE_BUDGET, job.maxStoredStates);
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
    flushSolutions(job);
    self.postMessage({ type: "done", completed: true });
    return true;
  }
  function startExactStateJob(data, start, matcher = null) { const moves = makeSearchMoves(data.searchMovesText); const maxSymbolDepth = Number(data.maxSymbolDepth) || 1; const maxStoredStates = Math.max(100000, Number(data.maxStoredStates) || DEFAULT_MAX_STORED_STATES); const job = { kind: "alg", maxStoredStates, requiredPatterns: parseMovePatterns(data.requiredPatternsText || data.requiredPartsText || ""), forbiddenPatterns: parseMovePatterns(data.forbiddenPatternsText || ""), foundCount: 0, foundKeys: new Set(), stopByLimit: false, moves, maxSymbolDepth, sideSymbolLimitA: Math.ceil(maxSymbolDepth / 2), sideSymbolLimitB: Math.floor(maxSymbolDepth / 2), movePerms: buildMovePerms(moves), matcher, targetState: start, storeA: makeStore(packState(start)), storeB: makeStore(PACKED_SOLVED), frontA: [0], frontB: [0] }; const seed = parseFastSeed(job, data.seedAlg || ""); if (seed) emitSolution(job, seed); if (runSeededFastJob(job, data.seedAlg || "")) return; if (start === SOLVED) emitSolution(job, []); processAlgJob(job); }
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
  function ensureForwardDepth(job, targetDepth) { while (job.forwardDepth < targetDepth && job.forwardFront.length && !job.stopByLimit) { if (shouldPauseBeforeLayer(job, job.forwardFront)) return false; expandPatternForwardLayer(job); if (shouldPause(job)) return false; } return true; }
  function ensureSecondDepth(job, targetDepth) { while (job.secondDepth < targetDepth && job.secondFront.length && !job.stopByLimit) { if (shouldPauseBeforeLayer(job, job.secondFront)) return false; expandPatternSecondLayer(job); if (shouldPause(job)) return false; } return true; }
  function matchSecondNodesForCurrentForward(job) { if (job.lastMatchedForwardDepth === job.forwardDepth) return; for (let id = 0; id < job.secondNodes.length; id += 1) { if (job.stopByLimit) break; const node = job.secondNodes[id]; if (node.cost > job.maxSymbolDepth) continue; emitPatternMatchesNewForwardOnly(job, node, id); } job.lastMatchedForwardDepth = job.forwardDepth; }
  function processBidirectionalPatternJob(job) { try { while (job.searchDepth <= job.maxPhysicalDepth && !job.stopByLimit) { const firstDepth = Math.ceil(job.searchDepth / 2); const secondDepth = Math.floor(job.searchDepth / 2); if (!ensureForwardDepth(job, firstDepth)) return pauseJob(job); matchSecondNodesForCurrentForward(job); if (!ensureSecondDepth(job, secondDepth)) return pauseJob(job); job.searchDepth += 1; } flushSolutions(job); self.postMessage({ type: "done", completed: !job.stopByLimit }); } catch (e) { flushSolutions(job); self.postMessage({ type: "error", message: e instanceof Error ? e.message : String(e) }); } }
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
  function startPatternJob(data) { const pattern = data.targetPattern; validatePattern(pattern); const patternArr = patternToArray(pattern); const matcher = makeMatcher(patternArr); if (matcher.count === 54) { startExactStateJob(data, patternArr.join(""), matcher); return; } const moves = makeSearchMoves(data.searchMovesText); const maxSymbolDepth = Number(data.maxSymbolDepth) || 1; const maxStoredStates = Math.max(100000, Number(data.maxStoredStates) || DEFAULT_MAX_STORED_STATES); const requiredPatterns = parseMovePatterns(data.requiredPatternsText || data.requiredPartsText || ""); const forbiddenPatterns = parseMovePatterns(data.forbiddenPatternsText || ""); const baseJob = { kind: "pattern", maxStoredStates, requiredPatterns, forbiddenPatterns, foundCount: 0, foundKeys: new Set(), stopByLimit: false, moves, maxSymbolDepth, maxPhysicalDepth: maxSymbolDepth, movePerms: buildMovePerms(moves), matcher, targetState: null }; if (runSeededFastJob(baseJob, data.seedAlg || "")) return; if (generatorFaceCount(moves) >= 4) { const discoveredSeed = discoverPatternSeed(baseJob); if (discoveredSeed && runSeededFastJob(baseJob, algToString(discoveredSeed))) return; } if (matcher.matches(SOLVED)) emitSolution(baseJob, []); const job = makePatternSearchJob(baseJob); processBidirectionalPatternJob(job); }
  self.onmessage = function (event) { const data = event.data || {}; try { if (data.mode === "alg") startAlgJob(data); else startPatternJob(data); } catch (e) { self.postMessage({ type: "error", message: e instanceof Error ? e.message : String(e) }); } };
}

function MiniSticker({ filled, bottomColor, corner = false }) {
  if (corner) return <div className="h-2.5 w-2.5" />;
  const displayColor = displayColorSymbol("U", bottomColor);
  return <div data-display-color={filled ? displayColor : "X"} className="h-2.5 w-2.5 rounded-[2px] border border-slate-500/70" style={{ background: filled ? displayColorStyle("U", bottomColor) : "#374151" }} />;
}
function MiniColorSticker({ color, bottomColor, corner = false }) {
  if (corner) return <div className="h-2.5 w-2.5" />;
  const displayColor = displayColorSymbol(color, bottomColor);
  return <div data-color={color} data-display-color={displayColor} className="h-2.5 w-2.5 rounded-[2px] border border-slate-500/70" style={{ background: displayColorStyle(color, bottomColor) }} />;
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
function ThreeCubeEditor({ pattern, setPattern, selectedColor, bottomColor, displayBottomColor }) {
  const rootRef = useRef(null);
  const sceneRef = useRef(null);
  const setPatternRef = useRef(setPattern);
  const patternRef = useRef(pattern);
  const selectedColorRef = useRef(selectedColor);
  const bottomColorRef = useRef(bottomColor);
  const displayBottomColorRef = useRef(displayBottomColor);

  useLayoutEffect(() => { setPatternRef.current = setPattern; }, [setPattern]);
  useLayoutEffect(() => { patternRef.current = pattern; }, [pattern]);
  useLayoutEffect(() => { selectedColorRef.current = selectedColor; }, [selectedColor]);
  useLayoutEffect(() => {
    const previousDisplayBottom = displayBottomColorRef.current;
    displayBottomColorRef.current = displayBottomColor;
    if (previousDisplayBottom !== displayBottomColor) {
      sceneRef.current?.applyDisplayBottomColor(displayBottomColor);
    }
  }, [displayBottomColor]);
  useLayoutEffect(() => {
    const previousBottom = bottomColorRef.current;
    bottomColorRef.current = bottomColor;
    if (previousBottom !== bottomColor) {
      sceneRef.current?.transitionBottomColor(bottomColor);
    }
  }, [bottomColor]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x111315, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.setAttribute("data-testid", "cube-canvas");
    renderer.domElement.setAttribute("data-projection", "isometric");
    renderer.domElement.setAttribute("data-interaction", "azimuth-elevation");
    renderer.domElement.setAttribute("data-drag-target", "camera");
    renderer.domElement.dataset.animating = "false";
    renderer.domElement.dataset.azimuth = "0.0000";
    renderer.domElement.dataset.bodyLocalBottom = "D";
    renderer.domElement.dataset.bodyLocalFront = "F";
    renderer.domElement.dataset.dragging = "false";
    renderer.domElement.dataset.elevation = "0.0000";
    renderer.domElement.dataset.roll = "0.0000";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.width = "100%";
    root.appendChild(renderer.domElement);

    const camera = new THREE.OrthographicCamera(-3, 3, 2.5, -2.5, 0.1, 100);
    camera.position.set(6, 6, 6);
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
    const orbitRadius = Math.sqrt(108);
    const defaultAzimuth = Math.PI / 4;
    const defaultElevation = Math.atan(1 / Math.sqrt(2));
    const minElevation = -Math.PI / 2 + 0.08;
    const maxElevation = Math.PI / 2 - 0.08;
    const view = { azimuth: 0, elevation: 0 };
    const drag = {
      active: false,
      moved: false,
      pointerId: null,
      startAzimuth: 0,
      startElevation: 0,
      startX: 0,
      startY: 0,
    };
    let animationFrame = 0;

    function render() {
      renderer.render(scene, camera);
    }

    function normalizeAngle(angle) {
      return Math.atan2(Math.sin(angle), Math.cos(angle));
    }

    function clampElevation(elevation) {
      const absoluteElevation = defaultElevation + elevation;
      return Math.max(minElevation, Math.min(maxElevation, absoluteElevation)) - defaultElevation;
    }

    function bodyOrientationForBottom(selectedBottom) {
      const selectedFront = frontForBottom(selectedBottom);
      const localBottom = logicalFaceForDisplayColor(displayBottomColorRef.current, selectedBottom);
      const localFront = logicalFaceForDisplayColor(displayBottomColorRef.current, selectedFront);
      const bottomAxis = new THREE.Vector3(...NORMAL[localBottom]);
      const frontAxis = new THREE.Vector3(...NORMAL[localFront]);
      const rightAxis = new THREE.Vector3().crossVectors(frontAxis, bottomAxis);
      const upAxis = bottomAxis.clone().multiplyScalar(-1);
      const localBasis = new THREE.Matrix4().makeBasis(rightAxis, upAxis, frontAxis);
      return {
        localBottom,
        localFront,
        quaternion: new THREE.Quaternion().setFromRotationMatrix(localBasis.invert()),
      };
    }

    function applyBodyOrientation(orientation) {
      group.quaternion.copy(orientation.quaternion);
      group.updateMatrixWorld(true);
      renderer.domElement.dataset.bodyLocalBottom = orientation.localBottom;
      renderer.domElement.dataset.bodyLocalFront = orientation.localFront;
    }

    function applyView() {
      const azimuth = defaultAzimuth + view.azimuth;
      const elevation = defaultElevation + view.elevation;
      const horizontalRadius = orbitRadius * Math.cos(elevation);
      camera.position.set(
        horizontalRadius * Math.sin(azimuth),
        orbitRadius * Math.sin(elevation),
        horizontalRadius * Math.cos(azimuth),
      );
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      renderer.domElement.dataset.azimuth = view.azimuth.toFixed(4);
      renderer.domElement.dataset.elevation = view.elevation.toFixed(4);
      renderer.domElement.dataset.roll = "0.0000";
      render();
    }

    function resize() {
      const width = Math.max(1, root.clientWidth);
      const height = Math.max(1, root.clientHeight);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      const viewHeight = 5.35;
      camera.left = -viewHeight * aspect / 2;
      camera.right = viewHeight * aspect / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      render();
    }

    function paintStickerColors() {
      for (const mesh of stickerMeshes) {
        const { face, index } = mesh.userData;
        const color = patternRef.current[face][index];
        mesh.material.color.set(displayColorStyle(color, displayBottomColorRef.current));
      }
    }

    function updateStickerColors() {
      paintStickerColors();
      render();
    }

    function stopAnimation() {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      renderer.domElement.dataset.animating = "false";
    }

    function applyDisplayBottomColor(nextDisplayBottom) {
      stopAnimation();
      displayBottomColorRef.current = nextDisplayBottom;
      paintStickerColors();
      applyBodyOrientation(bodyOrientationForBottom(bottomColorRef.current));
      applyView();
    }

    function transitionBottomColor(nextBottom) {
      stopAnimation();
      bottomColorRef.current = nextBottom;
      const startAzimuth = normalizeAngle(view.azimuth);
      const startElevation = view.elevation;
      const startBodyQuaternion = group.quaternion.clone();
      const targetBodyOrientation = bodyOrientationForBottom(nextBottom);
      renderer.domElement.dataset.bodyLocalBottom = targetBodyOrientation.localBottom;
      renderer.domElement.dataset.bodyLocalFront = targetBodyOrientation.localFront;
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion) {
        view.azimuth = 0;
        view.elevation = 0;
        applyBodyOrientation(targetBodyOrientation);
        applyView();
        return;
      }

      const startedAt = performance.now();
      const duration = 420;
      renderer.domElement.dataset.animating = "true";
      function animate(now) {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        view.azimuth = startAzimuth * (1 - eased);
        view.elevation = clampElevation(startElevation * (1 - eased));
        group.quaternion.slerpQuaternions(startBodyQuaternion, targetBodyOrientation.quaternion, eased);
        group.updateMatrixWorld(true);
        applyView();
        if (progress < 1) {
          animationFrame = requestAnimationFrame(animate);
          return;
        }
        view.azimuth = 0;
        view.elevation = 0;
        applyBodyOrientation(targetBodyOrientation);
        animationFrame = 0;
        renderer.domElement.dataset.animating = "false";
        applyView();
      }
      animationFrame = requestAnimationFrame(animate);
    }

    function setSticker(face, index) {
      if (index === 4) return;
      setPatternRef.current((prev) => {
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
      const hit = raycaster.intersectObjects(stickerMeshes, false).find((item) => item.object.userData.index !== 4);
      if (hit?.object.userData.face) {
        setSticker(hit.object.userData.face, hit.object.userData.index);
        return;
      }

      let nearest = null;
      let nearestDistance = 0.22;
      for (const mesh of stickerMeshes) {
        if (mesh.userData.index === 4) continue;
        const worldPosition = mesh.getWorldPosition(new THREE.Vector3());
        const worldNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
        const viewDirection = camera.position.clone().sub(worldPosition).normalize();
        if (worldNormal.dot(viewDirection) <= 0) continue;
        const projected = worldPosition.clone().project(camera);
        const distance = Math.hypot(projected.x - pointer.x, projected.y - pointer.y);
        if (distance >= nearestDistance) continue;
        nearestDistance = distance;
        nearest = mesh;
      }
      if (nearest) setSticker(nearest.userData.face, nearest.userData.index);
    }

    function onPointerDown(event) {
      if (event.button !== 0) return;
      event.preventDefault();
      stopAnimation();
      drag.active = true;
      drag.moved = false;
      drag.pointerId = event.pointerId;
      drag.startAzimuth = view.azimuth;
      drag.startElevation = view.elevation;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      renderer.domElement.dataset.dragging = "true";
      renderer.domElement.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event) {
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      if (!drag.moved) return;
      view.azimuth = drag.startAzimuth - dx * 0.009;
      view.elevation = clampElevation(drag.startElevation + dy * 0.009);
      applyView();
    }

    function finishPointer(event, pick) {
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
      if (pick && !drag.moved) pickSticker(event);
      if (drag.moved) {
        view.azimuth = normalizeAngle(view.azimuth);
        applyView();
      }
      drag.active = false;
      drag.pointerId = null;
      renderer.domElement.dataset.dragging = "false";
    }

    function onPointerUp(event) {
      finishPointer(event, true);
    }

    function onPointerCancel(event) {
      finishPointer(event, false);
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    sceneRef.current = { applyDisplayBottomColor, transitionBottomColor, updateStickerColors };
    resize();
    applyBodyOrientation(bodyOrientationForBottom(bottomColorRef.current));
    updateStickerColors();

    return () => {
      stopAnimation();
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      sceneRef.current = null;
      root.removeChild(renderer.domElement);
      stickerGeometry.dispose();
      scene.traverse((object) => {
        if (object.geometry && object.geometry !== stickerGeometry) object.geometry.dispose();
        if (object.material) object.material.dispose();
      });
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.updateStickerColors();
  }, [pattern]);

  return (
    <div
      data-testid="cube-editor"
      data-pattern-state={FACE_ORDER.flatMap((face) => pattern[face]).join("")}
      data-display-bottom-color={displayBottomColor}
      className="cube-editor-surface"
      ref={rootRef}
    />
  );
}
function ColorPicker({ selectedColor, setSelectedColor, bottomColor, label }) {
  const paletteFaces = FACE_ORDER.map((displayColor) => logicalFaceForDisplayColor(bottomColor, displayColor));
  return (
    <div data-testid="sticker-hotbar" className="sticker-hotbar" role="toolbar" aria-label={label}>
      {[...paletteFaces, DONT_CARE].map((face) => {
        const displayColor = displayColorSymbol(face, bottomColor);
        const colorLabel = FACE_LABEL[displayColor] || displayColor;
        return (
          <button
            key={face}
            type="button"
            data-testid={`color-${face}`}
            data-display-color={displayColor}
            aria-label={colorLabel}
            aria-pressed={selectedColor === face}
            onClick={() => setSelectedColor(face)}
            className={`sticker-slot${selectedColor === face ? " is-active" : ""}`}
            title={colorLabel}
          >
            <span className="swatch" style={{ background: displayColorStyle(face, bottomColor) }}>{face === DONT_CARE ? "?" : ""}</span>
          </button>
        );
      })}
    </div>
  );
}
function BottomColorPicker({ bottomColor, setBottomColor, label }) {
  return (
    <div className="menu-color-grid" data-testid="bottom-color-picker" role="group" aria-label={label}>
      {FACE_ORDER.map((face) => (
        <button
          key={face}
          type="button"
          data-testid={`bottom-color-${face}`}
          aria-label={FACE_LABEL[face]}
          aria-pressed={bottomColor === face}
          onClick={() => setBottomColor(face)}
          className={`menu-color-option${bottomColor === face ? " is-active" : ""}`}
          title={FACE_LABEL[face]}
        >
          <span className="swatch" style={{ background: FACE_COLOR_STYLE[face] }} />
        </button>
      ))}
    </div>
  );
}
function PatternInputEditor({ pattern, setPattern, selectedColor, setSelectedColor, bottomColor, displayBottomColor, labels }) {
  return (
    <div className="pattern-editor">
      <div className="editor-stage"><ThreeCubeEditor pattern={pattern} setPattern={setPattern} selectedColor={selectedColor} bottomColor={bottomColor} displayBottomColor={displayBottomColor} /></div>
      <ColorPicker selectedColor={selectedColor} setSelectedColor={setSelectedColor} bottomColor={displayBottomColor} label={labels.stickerColor} />
    </div>
  );
}
function SolutionSortControls({ sortKey, setSortKey, language }) {
  const label = localizedLabel(SORT_BY_LABEL, language);
  return (
    <div className="solution-sort">
      <span>{label}</span>
      <select
        data-testid="solution-sort-select"
        aria-label={label}
        value={sortKey}
        onChange={(event) => setSortKey(event.target.value)}
      >
        {SOLUTION_SORT_KEYS.map((key) => (
          <option key={key} value={key}>{localizedLabel(SOLUTION_SORT_LABELS[key], language)}</option>
        ))}
      </select>
    </div>
  );
}
function analysisText(language) {
  return RESULT_ANALYSIS_TEXT[language] || RESULT_ANALYSIS_TEXT.en;
}
function SolutionFilterControls({ filters, setFilters, language }) {
  const labels = analysisText(language);
  return (
    <label data-testid="solution-filters" className="solution-pattern-filter">
      <span>{labels.feature}</span>
      <select
        data-testid="filter-feature"
        aria-label={labels.feature}
        className={filters.feature !== DEFAULT_SOLUTION_FILTERS.feature ? "is-active" : ""}
        value={filters.feature}
        onChange={(event) => setFilters((previous) => ({ ...previous, feature: event.target.value }))}
      >
        {SOLUTION_FILTER_OPTIONS.feature.map((value) => (
          <option key={value} value={value}>{labels.featureOptions[value]}</option>
        ))}
      </select>
    </label>
  );
}
function SolutionMetric({ testId, label, value, onClick, expanded = false, controls, title, className = "" }) {
  const content = <><span>{label}</span><strong>{value}</strong></>;
  if (onClick) {
    return (
      <button
        type="button"
        data-testid={testId}
        className={`solution-metric is-interactive ${className}`.trim()}
        aria-expanded={expanded}
        aria-controls={controls}
        title={title}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }
  return (
    <div data-testid={testId} className={`solution-metric ${className}`.trim()}>
      {content}
    </div>
  );
}
function thumbPositionLabel(thumb, language) {
  const face = { "-1": "D", 0: "F", 1: "U" }[thumb] || "?";
  const signed = thumb > 0 ? `+${thumb}` : String(thumb);
  return language === "ja" ? `${face}面 (${signed})` : `${face} face (${signed})`;
}
function RegripDetail({ analysis, language, id }) {
  const labels = analysisText(language);
  const { regrip } = analysis;
  const title = labels.regripTitles?.[regrip.hand] || labels.regripTitle;
  if (regrip.count === null) {
    return (
      <section id={id} data-testid="regrip-detail" className="solution-detail">
        <strong>{title}</strong>
        <p>{labels.regripUnavailable}{regrip.unsupportedMoves.length ? ` (${regrip.unsupportedMoves.join(", ")})` : ""}</p>
      </section>
    );
  }
  return (
    <section id={id} data-testid="regrip-detail" className="solution-detail">
      <header className="solution-detail-header">
        <strong>{title}</strong>
        <span>{language === "ja" ? `${regrip.count}回` : `${regrip.count}`}</span>
      </header>
      <div className="regrip-summary">
        <span>{labels.start} {thumbPositionLabel(regrip.startThumb, language)}</span>
        <span aria-hidden="true">→</span>
        <span>{labels.end} {thumbPositionLabel(regrip.endThumb, language)}</span>
      </div>
      {regrip.steps.length ? (
        <ol className="regrip-steps">
          {regrip.steps.map((step) => (
            <li key={step.index} data-testid="regrip-step" className={step.regripFrom !== null ? "has-regrip" : ""}>
              <span className="regrip-step-index">{step.index}</span>
              <code>{step.move}</code>
              <span className="regrip-step-path">
                {step.regripFrom !== null ? (
                  <span className="regrip-event">{labels.regripAction}: {thumbPositionLabel(step.regripFrom, language)} → {thumbPositionLabel(step.regripTo, language)}</span>
                ) : null}
                <span>{thumbPositionLabel(step.beforeThumb, language)} → {thumbPositionLabel(step.afterThumb, language)}</span>
                {step.physicalMove !== step.move ? <span>{step.physicalMove} {labels.physicalAs}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
function EaseDetail({ analysis, language, id }) {
  const labels = analysisText(language);
  const { formula } = analysis.ease;
  const adjustments = [
    ["base", 100],
    ...Object.entries(formula.adjustments).filter(([, value]) => value !== 0),
  ];
  return (
    <section id={id} data-testid="ease-detail" className="solution-detail compact-detail" aria-label={labels.easeTitle}>
      <dl className="ease-breakdown">
        {adjustments.map(([key, value]) => (
          <div key={key} data-testid={`ease-adjustment-${key}`}>
            <dt>{labels.breakdown[key]}</dt>
            <dd>{value > 0 && key !== "base" ? `+${value}` : value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
function MoveCountDetail({ analysis, language, id }) {
  const labels = analysisText(language);
  return (
    <section id={id} data-testid="move-count-detail" className="solution-detail compact-detail" aria-label={labels.moveCountTitle}>
      <dl className="ease-breakdown move-count-breakdown">
        <div><dt>STM</dt><dd>{analysis.metrics.effectiveMoves}</dd></div>
        <div><dt>HTM</dt><dd>{analysis.metrics.symbolMoves}</dd></div>
        <div><dt>QTM</dt><dd>{analysis.metrics.quarterTurns}</dd></div>
      </dl>
    </section>
  );
}
function SolutionCard({ solution, t, language, onCopy, highlightFeature }) {
  const displayMoves = cleanMoves(solution);
  const displaySegments = formatCleanMovesWithSimulUDSegments(displayMoves);
  const expandedDisplayAlg = displaySegments.map((segment) => segment.text).join(" ");
  const analysis = solutionAnalysis(solution);
  const labels = analysisText(language);
  const displayChunks = makeFeatureDisplayChunks(displayMoves, analysis.features, highlightFeature);
  const displayAlg = displayChunks.map((chunk) => chunk.text).join("");
  const [detail, setDetail] = useState(null);
  const detailId = useId();
  return (
    <article data-testid="solution-card" className="solution-card">
      <div className="solution-card-top">
        <button
          type="button"
          data-testid="solution-alg"
          data-alg={displayAlg}
          data-expanded-alg={expandedDisplayAlg}
          className="solution-alg"
          aria-label={`${displayAlg || "(空)"} ${t.copy}`}
          title={t.copy}
          onClick={() => onCopy(displayAlg)}
        >
          {displayChunks.length ? displayChunks.map((chunk, index) => {
            const featureType = chunk.feature?.type;
            return (
              <Fragment key={`${featureType || "plain"}-${index}`}>
                {featureType ? (
                  <mark
                    data-testid="feature-highlight"
                    data-feature={featureType}
                    data-feature-label={labels.featureShortNames[featureType]}
                    className="solution-feature-group"
                    title={labels.featureNames[featureType]}
                  >
                    {chunk.text}
                  </mark>
                ) : chunk.text}
              </Fragment>
            );
          }) : "(空)"}
        </button>
        <div className="solution-metrics">
          <SolutionMetric
            testId="metric-ease"
            label="EASE"
            value={analysis.ease.score}
            className={`ease-${analysis.ease.band}`}
            title={labels.ease}
            expanded={detail === "ease"}
            controls={detailId}
            onClick={() => setDetail((previous) => previous === "ease" ? null : "ease")}
          />
          <SolutionMetric
            testId="metric-symbol"
            label="HTM"
            value={analysis.metrics.symbolMoves}
            title={labels.moveCountTitle}
            expanded={detail === "moves"}
            controls={detailId}
            onClick={() => setDetail((previous) => previous === "moves" ? null : "moves")}
          />
          <SolutionMetric
            testId="metric-regrip"
            label={localizedLabel(REGRIP_LABEL, language)}
            value={analysis.regrip.count === null ? "—" : analysis.regrip.count}
            title={labels.regripTitle}
            expanded={detail === "regrip"}
            controls={detailId}
            onClick={() => setDetail((previous) => previous === "regrip" ? null : "regrip")}
          />
        </div>
        {detail === "regrip" ? <RegripDetail analysis={analysis} language={language} id={detailId} /> : null}
        {detail === "ease" ? <EaseDetail analysis={analysis} language={language} id={detailId} /> : null}
        {detail === "moves" ? <MoveCountDetail analysis={analysis} language={language} id={detailId} /> : null}
      </div>
    </article>
  );
}
function ThinkingCard({ foundCount, t }) { return <div className="search-status is-searching"><div className="thinking-dots" aria-hidden="true"><span /><span /><span /></div><div><strong>{t.thinkingTitle}</strong><span>{t.thinkingBody(foundCount)}</span></div></div>; }
function EmptyCard({ text }) { return <div className="search-status">{text}</div>; }
function FilteredEmptyCard({ language, onReset }) { const labels = analysisText(language); return <div className="search-status filtered-empty"><span>{labels.filteredEmpty}</span><button type="button" onClick={onReset}>{labels.reset}</button></div>; }
function NumberInput({ label, value, onChange, min = 1, max = 99 }) { function setClamped(nextValue) { const raw = String(nextValue); if (raw === "") { onChange(""); return; } const numeric = Number(raw); if (!Number.isFinite(numeric)) return; onChange(Math.min(max, Math.max(min, Math.trunc(numeric)))); } return <label className="field"><span>{label}</span><input type="number" inputMode="numeric" pattern="[0-9]*" min={min} max={max} step="1" value={value} onChange={(e) => setClamped(e.target.value)} onBlur={() => { if (value === "") onChange(min); }} /></label>; }
function PresetTile({ label, pattern, previewMask, previewVariant, title, testId, selected = false, bottomColor, onClick }) {
  const isZblsPreview = previewVariant === "zbls";
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      title={title || label}
      className={`preset-tile${isZblsPreview ? " is-zbls" : ""}${selected ? " is-selected" : ""}`}
    >
      <MiniPatternPreview pattern={pattern} previewMask={previewMask} variant={previewVariant} bottomColor={bottomColor} />
      <span>{label}</span>
    </button>
  );
}
function PresetTileList({ children, withDivider = false }) {
  return <div className={`preset-tile-list${withDivider ? " with-divider" : ""}`}>{children}</div>;
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
  const workerUrlRef = useRef(new WeakMap());
  const [showNetInput, setShowNetInput] = useState(false);
  const [bottomColor, setBottomColor] = useState("U");
  const [patternBottomColor, setPatternBottomColor] = useState("U");
  const [menuOpen, setMenuOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [bottomColorOpen, setBottomColorOpen] = useState(false);
  const [language, setLanguage] = useState("ja");
  const t = TEXT[language] || TEXT.ja;
  const form = SEARCH_FORM_TEXT[language] || SEARCH_FORM_TEXT.en;
  const ui = WORKSPACE_TEXT[language] || WORKSPACE_TEXT.en;
  const isRtl = language === "ar" || language === "ur";
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState(() =>
    readStorageList(STORAGE_KEYS.history),
  );
  const [toastMessage, setToastMessage] = useState("");
  const messageTimerRef = useRef(null);
  const [targetAlg, setTargetAlg] = useState("");
  const [targetPattern, setTargetPattern] = useState(() => solvedPattern());
  const [patternSeedAlg, setPatternSeedAlg] = useState("");
  const [selectedColor, setSelectedColor] = useState("F");
  const [casePresetOpen, setCasePresetOpen] = useState(null);
  const [collGroupOpen, setCollGroupOpen] = useState(null);
  const [zbllFamilyOpen, setZbllFamilyOpen] = useState(null);
  const [zbllCollOpen, setZbllCollOpen] = useState(null);
  const [zblsF2lOpen, setZblsF2lOpen] = useState(null);
  const [searchMovesText, setSearchMovesText] = useState("");
  const [requiredPatternsText, setRequiredPatternsText] = useState("");
  const [forbiddenPatternsText, setForbiddenPatternsText] = useState("");
  const [maxSymbolDepth, setMaxSymbolDepth] = useState(15);
  const [solutionSortKey, setSolutionSortKey] = useState("symbol");
  const [solutionFilters, setSolutionFilters] = useState(DEFAULT_SOLUTION_FILTERS);
  const [solutions, setSolutions] = useState([]);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchSessionRef = useRef(0);
  const workerRef = useRef(null);
  function createSearchWorker() {
    const source = `(${workerMain.toString()})();`;
    const blob = new Blob([source], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    workerUrlRef.current.set(worker, url);
    return worker;
  }
  function terminateSearchWorker(worker) {
    if (!worker) return;
    worker.terminate();
    const url = workerUrlRef.current.get(worker);
    if (url) URL.revokeObjectURL(url);
    workerUrlRef.current.delete(worker);
  }
  useEffect(
    () => () => {
      if (workerRef.current) terminateSearchWorker(workerRef.current);
      if (messageTimerRef.current)
        clearTimeout(messageTimerRef.current);
    },
    [],
  );
  function selectInputMode(mode) {
    setShowNetInput(mode === "pattern");
  }
  function showTemporaryMessage(message) {
    if (messageTimerRef.current)
      clearTimeout(messageTimerRef.current);
    setToastMessage(message);
    messageTimerRef.current = setTimeout(() => {
      setToastMessage("");
      messageTimerRef.current = null;
    }, 1600);
  }
  function saveHistoryItem(mode) {
    const item = {
      id: Date.now(),
      mode,
      targetAlg,
      targetPattern,
      patternSeedAlg,
      bottomColor,
      patternBottomColor,
      searchMovesText,
      requiredPatternsText,
      forbiddenPatternsText,
      maxSymbolDepth,
    };
    const itemKey = JSON.stringify({
      mode,
      targetAlg,
      targetPattern,
      patternSeedAlg,
      bottomColor,
      patternBottomColor,
      searchMovesText,
      requiredPatternsText,
      forbiddenPatternsText,
      maxSymbolDepth,
    });
    const next = [
      item,
      ...history.filter(
        (x) =>
          JSON.stringify({
            mode: x.mode,
            targetAlg: x.targetAlg,
            targetPattern: x.targetPattern,
            patternSeedAlg: x.patternSeedAlg || "",
            bottomColor: x.bottomColor || "U",
            patternBottomColor: x.patternBottomColor || x.bottomColor || "U",
            searchMovesText: x.searchMovesText,
            requiredPatternsText: x.requiredPatternsText || x.requiredPartsText || "",
            forbiddenPatternsText: x.forbiddenPatternsText || "",
            maxSymbolDepth: x.maxSymbolDepth,
          }) !== itemKey,
      ),
    ].slice(0, 12);
    setHistory(next);
    writeStorageList(STORAGE_KEYS.history, next);
  }
  function applyHistoryItem(item) {
    if (item.targetAlg !== undefined) setTargetAlg(item.targetAlg);
    if (item.targetPattern) setTargetPattern(item.targetPattern);
    const restoredPatternBottom = item.patternBottomColor || item.bottomColor || "U";
    setBottomColor(item.bottomColor || restoredPatternBottom);
    setPatternBottomColor(restoredPatternBottom);
    setPatternSeedAlg(item.patternSeedAlg || "");
    if (item.searchMovesText !== undefined)
      setSearchMovesText(item.searchMovesText);
    setRequiredPatternsText(item.requiredPatternsText || item.requiredPartsText || "");
    setForbiddenPatternsText(item.forbiddenPatternsText || "");
    if (item.maxSymbolDepth !== undefined)
      setMaxSymbolDepth(item.maxSymbolDepth);
    setShowNetInput(item.mode === "pattern");
    setMenuOpen(false);
    setBottomColorOpen(false);
  }
  async function copyText(text) {
    let copied;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      const activeElement = document.activeElement;
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      copied = document.execCommand("copy");
      textarea.remove();
      if (activeElement instanceof HTMLElement) activeElement.focus();
    }
    showTemporaryMessage(copied ? t.copied : text);
  }
  function applyCasePreset(preset) {
    setPatternBottomColor(bottomColor);
    setTargetPattern(clonePattern(preset.pattern));
    setPatternSeedAlg(preset.seedAlg || preset.alg || "");
    setSelectedColor(DONT_CARE);
    setCasePresetOpen(null);
  }
  function editTargetPattern(nextPattern) {
    setPatternSeedAlg("");
    setTargetPattern(nextPattern);
  }
  function stopSearch() {
    searchSessionRef.current += 1;
    if (workerRef.current) {
      terminateSearchWorker(workerRef.current);
      workerRef.current = null;
    }
    setIsSearching(false);
  }
  async function runSearch(mode) {
    let expandedTargetAlg = targetAlg;
    if (mode === "alg") {
      try {
        expandedTargetAlg = algToString(parseAlg(targetAlg));
      } catch (searchError) {
        setError(searchError instanceof Error ? searchError.message : String(searchError));
        setHasSearched(true);
        setIsSearching(false);
        return;
      }
    }
    const currentSession = searchSessionRef.current + 1;
    searchSessionRef.current = currentSession;
    if (workerRef.current) {
      terminateSearchWorker(workerRef.current);
      workerRef.current = null;
    }
    setError("");
    setHasSearched(true);
    setIsSearching(true);
    setSolutions([]);
    saveHistoryItem(mode);
    const worker = createSearchWorker();
    workerRef.current = worker;
    let receivedAnySolution = false;
    worker.onmessage = (event) => {
      if (searchSessionRef.current !== currentSession) return;
      const data = event.data;
      if (data.type === "solutions" || data.type === "solution") {
        const incoming = data.type === "solutions" ? data.solutions : [data.solution];
        if (!incoming.length) return;
        receivedAnySolution = true;
        setSolutions((prev) => insertSolutionsUnique(prev, incoming));
        return;
      }
      if (data.type === "paused") {
        setError(data.message);
        setIsSearching(false);
        terminateSearchWorker(worker);
        if (workerRef.current === worker) workerRef.current = null;
        return;
      }
      if (data.type === "error") {
        setError(data.message);
        setIsSearching(false);
        terminateSearchWorker(worker);
        if (workerRef.current === worker) workerRef.current = null;
        return;
      }
      if (data.type === "done") {
        if (!receivedAnySolution) setSolutions([]);
        setIsSearching(false);
        terminateSearchWorker(worker);
        if (workerRef.current === worker) workerRef.current = null;
      }
    };
    worker.onerror = (event) => {
      if (searchSessionRef.current !== currentSession) return;
      setError(event.message || "Worker error");
      setIsSearching(false);
      terminateSearchWorker(worker);
      if (workerRef.current === worker) workerRef.current = null;
    };
    worker.postMessage({
      mode,
      targetAlg: expandedTargetAlg,
      targetPattern,
      seedAlg: mode === "alg" ? expandedTargetAlg : patternSeedAlg,
      searchMovesText,
      requiredPatternsText,
      forbiddenPatternsText,
      maxSymbolDepth: Number(maxSymbolDepth),
      maxStoredStates: searchStateBudget(),
    });
  }
  const filteredSolutions = useMemo(
    () => solutions.filter((solution) => matchesSolutionFilters(solutionAnalysis(solution), solutionFilters)),
    [solutions, solutionFilters],
  );
  const displayedSolutions = useMemo(
    () => sortedSolutions(filteredSolutions, solutionSortKey),
    [filteredSolutions, solutionSortKey],
  );
  const hasActiveSolutionFilters = Object.entries(solutionFilters).some(([key, value]) => value !== DEFAULT_SOLUTION_FILTERS[key]);
  const showResults = hasSearched || isSearching || Boolean(error);

  return (
    <div className="app-page dark-mode" dir={isRtl ? "rtl" : "ltr"}>
      {menuOpen ? (
        <button
          type="button"
          aria-label="close menu"
          className="menu-backdrop"
          onClick={() => {
            setMenuOpen(false);
            setLanguageOpen(false);
            setBottomColorOpen(false);
          }}
        />
      ) : null}

      <header className="topbar">
        <div className="topbar-inner">
          <h1 className="app-title">{t.title}</h1>
          <div className="header-actions">
            <div className="menu-anchor">
              <button
                type="button"
                className="menu-button"
                aria-label="menu"
                aria-expanded={menuOpen}
                onClick={() => {
                  setMenuOpen((value) => !value);
                  if (menuOpen) {
                    setLanguageOpen(false);
                    setBottomColorOpen(false);
                  }
                }}
              >
                <span aria-hidden="true">•••</span>
              </button>
              {menuOpen ? (
                <div className="menu-panel">
                  <button type="button" className="menu-row" onClick={() => {
                    setHistoryOpen((value) => !value);
                    setLanguageOpen(false);
                    setBottomColorOpen(false);
                  }}>
                    <span>{t.history}</span>
                    <span className="menu-value">{historyOpen ? "−" : history.length}</span>
                  </button>
                  {historyOpen ? (
                    <div className="menu-list">
                      {history.length ? history.map((item) => (
                        <button key={item.id} type="button" className="menu-list-item" onClick={() => applyHistoryItem(item)}>
                          <span className="algorithm">{item.searchMovesText}</span>
                          <span>{item.mode === "alg" ? item.targetAlg : form.stateMode}</span>
                        </button>
                      )) : <div className="menu-list-empty">0</div>}
                      {history.length ? (
                        <button
                          type="button"
                          className="menu-clear"
                          onClick={() => {
                            setHistory([]);
                            writeStorageList(STORAGE_KEYS.history, []);
                          }}
                        >
                          {t.clear}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <button type="button" className="menu-row" aria-expanded={bottomColorOpen} onClick={() => {
                    setBottomColorOpen((value) => !value);
                    setHistoryOpen(false);
                    setLanguageOpen(false);
                  }}>
                    <span>{ui.bottomColor}</span>
                    <span className="menu-color-value">
                      <span className="menu-color-swatch" style={{ background: FACE_COLOR_STYLE[bottomColor] }} />
                      {FACE_LABEL[bottomColor]}
                    </span>
                  </button>
                  {bottomColorOpen ? (
                    <BottomColorPicker
                      bottomColor={bottomColor}
                      label={ui.bottomColor}
                      setBottomColor={(face) => {
                        setBottomColor(face);
                        setBottomColorOpen(false);
                        setMenuOpen(false);
                      }}
                    />
                  ) : null}

                  <button type="button" className="menu-row" onClick={() => {
                    setLanguageOpen((value) => !value);
                    setHistoryOpen(false);
                    setBottomColorOpen(false);
                  }}>
                    <span>{t.language}</span>
                    <span className="menu-value">{languageOpen ? "−" : LANGUAGE_LABEL[language]}</span>
                  </button>
                  {languageOpen ? (
                    <div className="menu-list language-list">
                      {Object.keys(TEXT).map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          className={"menu-list-item language-option" + (language === lang ? " is-active" : "")}
                          onClick={() => {
                            setLanguage(lang);
                            setLanguageOpen(false);
                          }}
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
          </div>
        </div>
      </header>

      <main className={"workspace" + (showNetInput ? " pattern-mode" : "")}>
        <section className="input-panel">
          <div className="input-toolbar">
            <div className="segmented-control input-mode-control" role="tablist" aria-label={t.netInput}>
              <button
                type="button"
                role="tab"
                data-testid="input-mode-alg"
                aria-selected={!showNetInput}
                className={!showNetInput ? "is-active" : ""}
                onClick={() => selectInputMode("alg")}
              >
                {language === "ja" ? "Algorithm" : t.algMode}
              </button>
              <button
                type="button"
                role="tab"
                data-testid="input-mode-pattern"
                aria-selected={showNetInput}
                className={showNetInput ? "is-active" : ""}
                onClick={() => selectInputMode("pattern")}
              >
                {form.stateMode}
              </button>
            </div>
          </div>

          {!showNetInput ? (
            <div className="algorithm-target">
              <input
                type="text"
                value={targetAlg}
                onChange={(event) => setTargetAlg(event.target.value)}
                placeholder={t.inputPlaceholder}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          ) : (
            <div className="pattern-input">
              <section className="preset-selector" aria-label={t.casePresets}>
                <div className="preset-category-tabs" role="tablist" aria-label={t.casePresets}>
                  {CASE_PRESET_CATEGORIES.map((category) => (
                    <button
                      key={category}
                      type="button"
                      role="tab"
                      data-testid={"preset-category-" + category}
                      aria-selected={casePresetOpen === category}
                      className={casePresetOpen === category ? "is-active" : ""}
                      onClick={() => {
                        setCasePresetOpen((previous) => previous === category ? null : category);
                      }}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                {casePresetOpen ? (
                  <div data-testid="preset-panel" className="preset-panel">
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
              </section>

              <PatternInputEditor
                pattern={targetPattern}
                setPattern={editTargetPattern}
                selectedColor={selectedColor}
                setSelectedColor={setSelectedColor}
                bottomColor={bottomColor}
                displayBottomColor={patternBottomColor}
                labels={ui}
              />
            </div>
          )}

          <section className="conditions-block" aria-label={ui.conditions}>
            <div className="conditions-grid">
              <label className="field">
                <span>{t.generator}</span>
                <input
                  value={searchMovesText}
                  onChange={(event) => setSearchMovesText(event.target.value)}
                  className="algorithm"
                  placeholder="例: R U D"
                />
              </label>
              <label className="field">
                <span>{form.requiredPatterns}</span>
                <input
                  value={requiredPatternsText}
                  onChange={(event) => setRequiredPatternsText(event.target.value)}
                  className="algorithm"
                  placeholder={form.patternPlaceholder}
                />
              </label>
              <label className="field">
                <span>{form.forbiddenPatterns}</span>
                <input
                  value={forbiddenPatternsText}
                  onChange={(event) => setForbiddenPatternsText(event.target.value)}
                  className="algorithm"
                  placeholder={form.patternPlaceholder}
                />
              </label>
              <NumberInput label={form.depthLimit} value={maxSymbolDepth} onChange={setMaxSymbolDepth} min={1} max={30} />
            </div>
          </section>

          <button
            type="button"
            className={"search-primary" + (isSearching ? " is-stop" : "")}
            onClick={() => isSearching ? stopSearch() : runSearch(showNetInput ? "pattern" : "alg")}
          >
            {isSearching ? "停止" : form.search}
          </button>
        </section>

        {showResults ? <section className="results-panel" aria-live="polite">
          <header className="results-header">
            <h2>{ui.results}</h2>
            {hasSearched || isSearching ? (
              <span className="result-count">
                {hasActiveSolutionFilters ? `${displayedSolutions.length} / ${solutions.length}` : ui.found(solutions.length)}
              </span>
            ) : null}
          </header>

          {solutions.length ? (
            <div className="solution-controls">
              <SolutionSortControls sortKey={solutionSortKey} setSortKey={setSolutionSortKey} language={language} />
              <SolutionFilterControls filters={solutionFilters} setFilters={setSolutionFilters} language={language} />
            </div>
          ) : null}

          {error ? (
            <div className="error-banner" role="alert">
              <span>{error}</span>
            </div>
          ) : null}

          {isSearching ? <ThinkingCard foundCount={solutions.length} t={t} /> : null}

          <div data-testid="solution-list" className="solution-list">
            {displayedSolutions.map((solution) => (
              <SolutionCard
                key={algToString(solution)}
                solution={solution}
                t={t}
                language={language}
                onCopy={copyText}
                highlightFeature={solutionFilters.feature}
              />
            ))}
          </div>

          {!isSearching && !error && solutions.length > 0 && displayedSolutions.length === 0 ? <FilteredEmptyCard language={language} onReset={() => setSolutionFilters(DEFAULT_SOLUTION_FILTERS)} /> : null}
          {!isSearching && !error && hasSearched && solutions.length === 0 ? <EmptyCard text={t.noResults} /> : null}
        </section> : null}
      </main>

      {toastMessage ? <div className="toast" role="status">{toastMessage}</div> : null}
    </div>
  );
}
