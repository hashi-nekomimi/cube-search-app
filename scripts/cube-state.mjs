export const FACE_ORDER = ["U", "R", "F", "D", "L", "B"];
export const SOLVED_STATE = FACE_ORDER.map((face) => face.repeat(9)).join("");

const NORMAL = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  R: [1, 0, 0],
  L: [-1, 0, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};

function keyOf(pos, normal) {
  return `${pos.join(",")}|${normal.join(",")}`;
}

function facePos(face, row, column) {
  return {
    U: [column - 1, 1, row - 1],
    D: [column - 1, -1, 1 - row],
    F: [column - 1, 1 - row, 1],
    B: [1 - column, 1 - row, -1],
    R: [1, 1 - row, 1 - column],
    L: [-1, 1 - row, column - 1],
  }[face];
}

function buildStickers() {
  const stickers = [];
  const indexOf = new Map();
  for (const face of FACE_ORDER) {
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const pos = facePos(face, row, column);
        const normal = NORMAL[face];
        indexOf.set(keyOf(pos, normal), stickers.length);
        stickers.push({ face, index: row * 3 + column, pos, normal });
      }
    }
  }
  return { stickers, indexOf };
}

export const { stickers: STICKERS, indexOf: INDEX_OF } = buildStickers();

const faceletIndex = (face, index) => FACE_ORDER.indexOf(face) * 9 + index;

export const CORNER_NAMES = ["URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB"];
export const EDGE_NAMES = ["UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR"];

const CORNER_FACELETS = [
  [["U", 8], ["R", 0], ["F", 2]],
  [["U", 6], ["F", 0], ["L", 2]],
  [["U", 0], ["L", 0], ["B", 2]],
  [["U", 2], ["B", 0], ["R", 2]],
  [["D", 2], ["F", 8], ["R", 6]],
  [["D", 0], ["L", 8], ["F", 6]],
  [["D", 6], ["B", 8], ["L", 6]],
  [["D", 8], ["R", 8], ["B", 6]],
].map((facelets) => facelets.map(([face, index]) => faceletIndex(face, index)));

const CORNER_COLORS = [
  ["U", "R", "F"],
  ["U", "F", "L"],
  ["U", "L", "B"],
  ["U", "B", "R"],
  ["D", "F", "R"],
  ["D", "L", "F"],
  ["D", "B", "L"],
  ["D", "R", "B"],
];

const EDGE_FACELETS = [
  [["U", 5], ["R", 1]],
  [["U", 7], ["F", 1]],
  [["U", 3], ["L", 1]],
  [["U", 1], ["B", 1]],
  [["D", 5], ["R", 7]],
  [["D", 1], ["F", 7]],
  [["D", 3], ["L", 7]],
  [["D", 7], ["B", 7]],
  [["F", 5], ["R", 3]],
  [["F", 3], ["L", 5]],
  [["B", 5], ["L", 3]],
  [["B", 3], ["R", 5]],
].map((facelets) => facelets.map(([face, index]) => faceletIndex(face, index)));

const EDGE_COLORS = [
  ["U", "R"],
  ["U", "F"],
  ["U", "L"],
  ["U", "B"],
  ["D", "R"],
  ["D", "F"],
  ["D", "L"],
  ["D", "B"],
  ["F", "R"],
  ["F", "L"],
  ["B", "L"],
  ["B", "R"],
];

function assertPermutation(values, length, label) {
  if (values.length !== length || new Set(values).size !== length || values.some((value) => value < 0 || value >= length)) {
    throw new Error(`${label} is not a permutation of 0..${length - 1}`);
  }
}

export function permutationParity(permutation) {
  let inversions = 0;
  for (let left = 0; left < permutation.length; left += 1) {
    for (let right = left + 1; right < permutation.length; right += 1) {
      if (permutation[left] > permutation[right]) inversions += 1;
    }
  }
  return inversions % 2;
}

export function stateFromCubieCoordinates({
  cornerPermutation = CORNER_NAMES.map((_, index) => index),
  cornerOrientation = CORNER_NAMES.map(() => 0),
  edgePermutation = EDGE_NAMES.map((_, index) => index),
  edgeOrientation = EDGE_NAMES.map(() => 0),
}) {
  assertPermutation(cornerPermutation, CORNER_NAMES.length, "cornerPermutation");
  assertPermutation(edgePermutation, EDGE_NAMES.length, "edgePermutation");
  if (cornerOrientation.length !== CORNER_NAMES.length || cornerOrientation.some((value) => !Number.isInteger(value) || value < 0 || value > 2)) {
    throw new Error("cornerOrientation must contain eight values in 0..2");
  }
  if (edgeOrientation.length !== EDGE_NAMES.length || edgeOrientation.some((value) => value !== 0 && value !== 1)) {
    throw new Error("edgeOrientation must contain twelve values in 0..1");
  }
  if (cornerOrientation.reduce((sum, value) => sum + value, 0) % 3 !== 0) {
    throw new Error("corner orientation sum must be divisible by three");
  }
  if (edgeOrientation.reduce((sum, value) => sum + value, 0) % 2 !== 0) {
    throw new Error("edge orientation sum must be even");
  }
  if (permutationParity(cornerPermutation) !== permutationParity(edgePermutation)) {
    throw new Error("corner and edge permutation parity must match");
  }

  const state = [...SOLVED_STATE];
  CORNER_FACELETS.forEach((facelets, position) => {
    const cubie = cornerPermutation[position];
    const orientation = cornerOrientation[position];
    CORNER_COLORS[cubie].forEach((color, colorIndex) => {
      state[facelets[(colorIndex + orientation) % 3]] = color;
    });
  });
  EDGE_FACELETS.forEach((facelets, position) => {
    const cubie = edgePermutation[position];
    const orientation = edgeOrientation[position];
    EDGE_COLORS[cubie].forEach((color, colorIndex) => {
      state[facelets[(colorIndex + orientation) % 2]] = color;
    });
  });
  return state.join("");
}

export function cubieCoordinatesFromState(state) {
  if (typeof state !== "string" || state.length !== 54) {
    throw new Error("Cube state must contain 54 stickers");
  }
  const normalized = normalizeCenters(state);
  const cornerPermutation = [];
  const cornerOrientation = [];
  const edgePermutation = [];
  const edgeOrientation = [];

  CORNER_FACELETS.forEach((facelets, position) => {
    const orientation = facelets.findIndex((index) => normalized[index] === "U" || normalized[index] === "D");
    if (orientation < 0) throw new Error(`Corner ${CORNER_NAMES[position]} has no U/D sticker`);
    const second = normalized[facelets[(orientation + 1) % 3]];
    const third = normalized[facelets[(orientation + 2) % 3]];
    const cubie = CORNER_COLORS.findIndex((colors) => colors[1] === second && colors[2] === third);
    if (cubie < 0) throw new Error(`Corner ${CORNER_NAMES[position]} has an invalid color order`);
    cornerPermutation.push(cubie);
    cornerOrientation.push(orientation % 3);
  });

  EDGE_FACELETS.forEach((facelets, position) => {
    let cubie = -1;
    let orientation = -1;
    for (let candidate = 0; candidate < EDGE_COLORS.length && cubie < 0; candidate += 1) {
      for (let flip = 0; flip < 2; flip += 1) {
        if (normalized[facelets[0]] === EDGE_COLORS[candidate][flip]
          && normalized[facelets[1]] === EDGE_COLORS[candidate][1 - flip]) {
          cubie = candidate;
          orientation = flip;
          break;
        }
      }
    }
    if (cubie < 0) throw new Error(`Edge ${EDGE_NAMES[position]} has invalid colors`);
    edgePermutation.push(cubie);
    edgeOrientation.push(orientation);
  });

  assertPermutation(cornerPermutation, CORNER_NAMES.length, "cornerPermutation");
  assertPermutation(edgePermutation, EDGE_NAMES.length, "edgePermutation");
  if (cornerOrientation.reduce((sum, value) => sum + value, 0) % 3 !== 0) {
    throw new Error("corner orientation sum must be divisible by three");
  }
  if (edgeOrientation.reduce((sum, value) => sum + value, 0) % 2 !== 0) {
    throw new Error("edge orientation sum must be even");
  }
  if (permutationParity(cornerPermutation) !== permutationParity(edgePermutation)) {
    throw new Error("corner and edge permutation parity must match");
  }
  return { cornerPermutation, cornerOrientation, edgePermutation, edgeOrientation };
}

function rotateVector(vector, axis, direction) {
  const [x, y, z] = vector;
  if (axis === "x") return [x, -direction * z, direction * y];
  if (axis === "y") return [direction * z, y, -direction * x];
  if (axis === "z") return [-direction * y, direction * x, z];
  throw new Error(`Unknown axis: ${axis}`);
}

function makePermutation(axis, layers, direction) {
  const layerSet = new Set(layers);
  const axisIndex = { x: 0, y: 1, z: 2 }[axis];
  const permutation = Array.from({ length: 54 }, (_, index) => index);
  for (let index = 0; index < STICKERS.length; index += 1) {
    const { pos, normal } = STICKERS[index];
    if (!layerSet.has(pos[axisIndex])) continue;
    const destination = INDEX_OF.get(keyOf(
      rotateVector(pos, axis, direction),
      rotateVector(normal, axis, direction),
    ));
    permutation[destination] = index;
  }
  return permutation;
}

function composePermutations(first, second) {
  return Array.from({ length: 54 }, (_, index) => first[second[index]]);
}

function permutationPower(permutation, power) {
  let result = Array.from({ length: 54 }, (_, index) => index);
  for (let index = 0; index < power; index += 1) {
    result = composePermutations(result, permutation);
  }
  return result;
}

const BASE_PERMUTATIONS = {
  U: makePermutation("y", [1], -1),
  D: makePermutation("y", [-1], 1),
  R: makePermutation("x", [1], -1),
  L: makePermutation("x", [-1], 1),
  F: makePermutation("z", [1], -1),
  B: makePermutation("z", [-1], 1),
  M: makePermutation("x", [0], 1),
  E: makePermutation("y", [0], 1),
  S: makePermutation("z", [0], -1),
  x: makePermutation("x", [-1, 0, 1], -1),
  y: makePermutation("y", [-1, 0, 1], -1),
  z: makePermutation("z", [-1, 0, 1], -1),
  u: makePermutation("y", [0, 1], -1),
  d: makePermutation("y", [-1, 0], 1),
  r: makePermutation("x", [0, 1], -1),
  l: makePermutation("x", [-1, 0], 1),
  f: makePermutation("z", [0, 1], -1),
  b: makePermutation("z", [-1, 0], 1),
};

function normalizeAlgText(algorithm) {
  return String(algorithm || "")
    .replace(/[’′`]/g, "'")
    .replace(/([URFDLBMESxyzurfdlb](?:w)?)3'/g, "$1")
    .replace(/([URFDLBMESxyzurfdlb](?:w)?)3/g, "$1'")
    .replace(/2'/g, "2")
    .replace(/([URFDLB])w/g, (_, face) => face.toLowerCase())
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAlg(algorithm) {
  const text = normalizeAlgText(algorithm);
  if (!text) return [];
  const tokenPattern = /([URFDLBMESxyzurfdlb])(?:w)?(2|')?/g;
  const moves = [];
  let position = 0;
  for (;;) {
    const match = tokenPattern.exec(text);
    if (!match) break;
    if (text.slice(position, match.index).trim()) {
      throw new Error(`Unsupported algorithm fragment: ${text.slice(position, match.index)}`);
    }
    moves.push(match[1] + (match[2] || ""));
    position = tokenPattern.lastIndex;
  }
  if (text.slice(position).trim()) {
    throw new Error(`Unsupported algorithm fragment: ${text.slice(position)}`);
  }
  return moves;
}

function inverseMove(move) {
  if (move.endsWith("'")) return move.slice(0, -1);
  if (move.endsWith("2")) return move;
  return `${move}'`;
}

export function inverseAlg(algorithm) {
  return parseAlg(algorithm).reverse().map(inverseMove).join(" ");
}

function movePermutation(move) {
  const base = BASE_PERMUTATIONS[move[0]];
  if (!base) throw new Error(`Unsupported move: ${move}`);
  const power = move.endsWith("2") ? 2 : move.endsWith("'") ? 3 : 1;
  return permutationPower(base, power);
}

function applyPermutation(state, permutation) {
  return permutation.map((source) => state[source]).join("");
}

export function applyAlg(state, algorithm) {
  return parseAlg(algorithm).reduce(
    (current, move) => applyPermutation(current, movePermutation(move)),
    state,
  );
}

export function normalizeCenters(state) {
  const colorToFace = new Map();
  FACE_ORDER.forEach((face, faceIndex) => {
    colorToFace.set(state[faceIndex * 9 + 4], face);
  });
  if (colorToFace.size !== FACE_ORDER.length) {
    throw new Error("State does not contain six unique centers");
  }
  return [...state].map((color) => colorToFace.get(color) || color).join("");
}

export function stateFromSetup(setup) {
  return normalizeCenters(applyAlg(SOLVED_STATE, setup));
}

export function stateFromSolution(solution) {
  return normalizeCenters(applyAlg(SOLVED_STATE, inverseAlg(solution)));
}

export function patternMatchesState(pattern, state) {
  return [...pattern].every((color, index) => color === "X" || color === state[index]);
}

export function isSolvedUpToAuf(state) {
  return ["", "U", "U2", "U'"].some((auf) => (
    normalizeCenters(applyAlg(state, auf)) === SOLVED_STATE
  ));
}

export function isCollGoal(state) {
  return ["", "U", "U2", "U'"].some((auf) => {
    const candidate = normalizeCenters(applyAlg(state, auf));
    for (let index = 0; index < 54; index += 1) {
      const { face, index: faceIndex, pos } = STICKERS[index];
      const isLastLayerEdge = pos[1] === 1 && pos.filter((value) => value === 0).length === 1;
      if (isLastLayerEdge) {
        if (face === "U" && candidate[index] !== "U") return false;
        continue;
      }
      if (candidate[index] !== SOLVED_STATE[index]) return false;
      if (faceIndex === 4 && candidate[index] !== face) return false;
    }
    return true;
  });
}

export function isZblsGoal(state) {
  const candidate = normalizeCenters(state);
  for (let index = 0; index < 54; index += 1) {
    const { face, pos } = STICKERS[index];
    const isLastLayer = pos[1] === 1;
    if (!isLastLayer && candidate[index] !== SOLVED_STATE[index]) return false;
    if (isLastLayer && pos.filter((value) => value === 0).length === 1 && face === "U" && candidate[index] !== "U") return false;
  }
  return true;
}

function positionKey(pos) {
  return pos.join(",");
}

function cubieStickerGroups() {
  const groups = new Map();
  STICKERS.forEach((sticker, index) => {
    const key = positionKey(sticker.pos);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  return [...groups.values()].filter((indices) => indices.length > 1);
}

const CUBIE_STICKER_GROUPS = cubieStickerGroups();

function isEdgePosition(pos) {
  return pos.filter((value) => value === 0).length === 1;
}

export function makeCollPattern(fullState) {
  const pattern = [...fullState];
  for (const indices of CUBIE_STICKER_GROUPS) {
    const pos = STICKERS[indices[0]].pos;
    if (pos[1] !== 1 || !isEdgePosition(pos)) continue;
    for (const index of indices) {
      pattern[index] = STICKERS[index].face === "U" ? "U" : "X";
    }
  }
  return pattern.join("");
}

function isZblsUnsolvedPosition(pos) {
  return pos[1] === 1
    || positionKey(pos) === "1,0,1"
    || positionKey(pos) === "1,-1,1";
}

export function makeF2lPattern(fullState) {
  const pattern = [...SOLVED_STATE];

  for (const indices of CUBIE_STICKER_GROUPS) {
    if (!isZblsUnsolvedPosition(STICKERS[indices[0]].pos)) continue;
    for (const index of indices) pattern[index] = "X";
  }

  for (const indices of CUBIE_STICKER_GROUPS) {
    const colors = indices.map((index) => fullState[index]).sort().join("");
    if (colors === "DFR" || colors === "FR") {
      for (const index of indices) pattern[index] = fullState[index];
    }
  }
  return pattern.join("");
}

export function makeZblsPattern(fullState) {
  const pattern = [...makeF2lPattern(fullState)];
  for (const indices of CUBIE_STICKER_GROUPS) {
    const pos = STICKERS[indices[0]].pos;
    const colors = indices.map((index) => fullState[index]).sort().join("");
    if (colors === "FR") continue;
    if (isZblsUnsolvedPosition(pos) && isEdgePosition(pos)) {
      for (const index of indices) {
        if (fullState[index] === "U") pattern[index] = "U";
      }
    }
  }
  return pattern.join("");
}
