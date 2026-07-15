const FACE_ORDER = ["U", "R", "F", "D", "L", "B"];
const PARALLEL_GROUP = { U: "UD", D: "UD", R: "RL", L: "RL", F: "FB", B: "FB" };
const ACTIVE_REGRIP_THUMBS = [-1, 0, 1];
const Y_ROTATION_FACE = { U: "U", R: "B", B: "L", L: "F", F: "R", D: "D" };
const MIRROR_FACE = { U: "U", R: "L", F: "F", D: "D", L: "R", B: "B" };

const REGRIP_SUFFIXES_BY_FACE = {
  R: ["'3", "'2", "'", "", "2", "3"],
  U: ["'2", "'", "", "2"],
  D: ["'2", "'", "", "2"],
  F: ["'", "", "2"],
  B: ["'", "", "2"],
};

const REGRIP_ALLOWED = {
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
};

const ANALYSIS_CACHE = new Map();

function inverseMove(move) {
  if (move.endsWith("2")) return move;
  if (move.endsWith("'")) return move.slice(0, -1);
  return `${move}'`;
}

function inverseSequence(moves) {
  return [...moves].reverse().map(inverseMove);
}

function invertTurnSuffix(suffix) {
  if (suffix === "") return "'";
  if (suffix === "'") return "";
  if (suffix === "3") return "'3";
  if (suffix === "'3") return "3";
  return suffix;
}

function transformMove(move, faceMap, invertDirection = false) {
  const face = move[0];
  const mappedFace = faceMap[face];
  if (!mappedFace) return move;
  const suffix = move.slice(1);
  return mappedFace + (invertDirection ? invertTurnSuffix(suffix) : suffix);
}

function mirrorMove(move) {
  return transformMove(move, MIRROR_FACE, true);
}

function mirrorSequence(moves) {
  return moves.map(mirrorMove);
}

function rotateYSequence(moves, turns) {
  let rotated = [...moves];
  for (let turn = 0; turn < turns; turn += 1) {
    rotated = rotated.map((move) => transformMove(move, Y_ROTATION_FACE));
  }
  return rotated;
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

function choosePhysicalMove(move, thumb) {
  const parts = splitRegripMove(move);
  if (!parts) return null;
  const [face, suffix] = parts;
  const suffixes = REGRIP_SUFFIXES_BY_FACE[face];
  const allowed = REGRIP_ALLOWED[thumb]?.[face];
  if (!suffixes || !allowed) return null;
  for (const physicalSuffix of equivalentPhysicalSuffixes(face, suffix)) {
    if (suffixes.includes(physicalSuffix) && allowed[physicalSuffix]) return face + physicalSuffix;
  }
  return null;
}

function nextThumbForPhysicalMove(physicalMove, thumb) {
  const [face, suffix] = splitRegripMove(physicalMove);
  if (face !== "R") return thumb;
  const delta = { "'3": -3, "'2": -2, "'": -1, "": 1, 2: 2, 3: 3 }[suffix];
  const next = thumb + delta;
  return REGRIP_ALLOWED[next] ? next : null;
}

function startThumbRank(thumb) {
  return thumb === 0 ? 0 : thumb === -1 ? 1 : 2;
}

function isBetterRegripPath(candidate, current) {
  if (!current) return true;
  if (candidate.count !== current.count) return candidate.count < current.count;
  if (candidate.physicalVariants !== current.physicalVariants) {
    return candidate.physicalVariants < current.physicalVariants;
  }
  return startThumbRank(candidate.startThumb) < startThumbRank(current.startThumb);
}

function analyzeRightHandRegrips(normalized) {
  let states = new Map(ACTIVE_REGRIP_THUMBS.map((thumb) => [thumb, {
    startThumb: thumb,
    thumb,
    count: 0,
    physicalVariants: 0,
    steps: [],
  }]));

  for (let index = 0; index < normalized.length; index += 1) {
    const move = normalized[index];
    const nextStates = new Map();
    for (const state of states.values()) {
      for (const gripThumb of ACTIVE_REGRIP_THUMBS) {
        const physicalMove = choosePhysicalMove(move, gripThumb);
        if (!physicalMove) continue;
        const afterThumb = nextThumbForPhysicalMove(physicalMove, gripThumb);
        if (afterThumb === null || !ACTIVE_REGRIP_THUMBS.includes(afterThumb)) continue;
        const changedGrip = gripThumb !== state.thumb;
        const candidate = {
          startThumb: state.startThumb,
          thumb: afterThumb,
          count: state.count + (changedGrip ? 1 : 0),
          physicalVariants: state.physicalVariants + (physicalMove === move ? 0 : 1),
          steps: [...state.steps, {
            index: index + 1,
            move,
            physicalMove,
            beforeThumb: gripThumb,
            afterThumb,
            regripFrom: changedGrip ? state.thumb : null,
            regripTo: changedGrip ? gripThumb : null,
          }],
        };
        if (isBetterRegripPath(candidate, nextStates.get(afterThumb))) {
          nextStates.set(afterThumb, candidate);
        }
      }
    }
    if (!nextStates.size) {
      return {
        count: null,
        startThumb: null,
        endThumb: null,
        steps: [],
        unsupportedMoves: [...new Set(normalized.filter((item) => !REGRIP_SUFFIXES_BY_FACE[item[0]]))],
        hand: "right",
      };
    }
    states = nextStates;
  }

  let best = null;
  for (const state of states.values()) {
    if (isBetterRegripPath(state, best)) best = state;
  }
  return {
    count: best?.count ?? 0,
    startThumb: best?.startThumb ?? 0,
    endThumb: best?.thumb ?? 0,
    steps: best?.steps ?? [],
    unsupportedMoves: [],
    hand: "right",
    physicalVariants: best?.physicalVariants ?? 0,
  };
}

function mirroredRegripResult(moves) {
  const mirrored = analyzeRightHandRegrips(mirrorSequence(moves));
  if (mirrored.count === null) return { ...mirrored, hand: "left" };
  return {
    ...mirrored,
    hand: "left",
    steps: mirrored.steps.map((step, index) => ({
      ...step,
      move: moves[index],
      physicalMove: mirrorMove(step.physicalMove),
    })),
  };
}

function isBetterHandPath(candidate, current) {
  if (candidate.count === null) return false;
  if (!current || current.count === null) return true;
  if (candidate.count !== current.count) return candidate.count < current.count;
  if (candidate.physicalVariants !== current.physicalVariants) {
    return candidate.physicalVariants < current.physicalVariants;
  }
  return candidate.hand === "right" && current.hand !== "right";
}

export function analyzeRegrips(moves) {
  const normalized = [...moves];
  const key = normalized.join(" ");
  const cacheKey = `regrip:${key}`;
  if (ANALYSIS_CACHE.has(cacheKey)) return ANALYSIS_CACHE.get(cacheKey);

  const right = analyzeRightHandRegrips(normalized);
  const left = mirroredRegripResult(normalized);
  const result = isBetterHandPath(left, right) ? left : right;
  ANALYSIS_CACHE.set(cacheKey, result);
  return result;
}

const BASE_FEATURE_SIGNATURES = [
  { type: "sune", variant: "Sune", moves: ["R", "U", "R'", "U", "R", "U2", "R'"] },
  { type: "sune", variant: "Anti-Sune", moves: ["R", "U2", "R'", "U'", "R", "U'", "R'"] },
  { type: "sexy", variant: "Sexy Move", moves: ["R", "U", "R'", "U'"] },
  { type: "sledge", variant: "Sledgehammer", moves: ["R'", "F", "R", "F'"] },
];

function makeFeatureSignatures() {
  const signatures = [];
  const seen = new Set();
  for (const feature of BASE_FEATURE_SIGNATURES) {
    for (let yTurns = 0; yTurns < 4; yTurns += 1) {
      const rotated = rotateYSequence(feature.moves, yTurns);
      for (const [mirrored, oriented] of [[false, rotated], [true, mirrorSequence(rotated)]]) {
        for (const [inverted, moves] of [[false, oriented], [true, inverseSequence(oriented)]]) {
          const key = `${feature.type}:${moves.join(" ")}`;
          if (seen.has(key)) continue;
          seen.add(key);
          signatures.push({
            ...feature,
            variant: `${feature.variant}${mirrored ? " / mirror" : ""}${inverted ? " / inverse" : ""}`,
            moves,
          });
        }
      }
    }
  }
  return signatures.sort((a, b) => b.moves.length - a.moves.length);
}

const FEATURE_SIGNATURES = makeFeatureSignatures();

function sequenceAt(moves, expected, start) {
  if (start + expected.length > moves.length) return false;
  return expected.every((move, offset) => moves[start + offset] === move);
}

function sameSequence(a, b) {
  return a.length === b.length && a.every((move, index) => move === b[index]);
}

function findNamedFeatures(moves) {
  const features = [];
  for (let start = 0; start < moves.length; start += 1) {
    for (const signature of FEATURE_SIGNATURES) {
      if (!sequenceAt(moves, signature.moves, start)) continue;
      features.push({
        type: signature.type,
        variant: signature.variant,
        start,
        end: start + signature.moves.length,
        moves: signature.moves,
      });
    }
  }
  return features;
}

function findCommutators(moves, namedFeatures) {
  const commutators = [];
  const seenRanges = new Set(namedFeatures.map((feature) => `${feature.start}:${feature.end}`));
  for (let start = 0; start < moves.length; start += 1) {
    let best = null;
    for (let aLength = 1; start + (aLength + 1) * 2 <= moves.length; aLength += 1) {
      for (let bLength = 1; start + (aLength + bLength) * 2 <= moves.length; bLength += 1) {
        const end = start + (aLength + bLength) * 2;
        if (end > moves.length || seenRanges.has(`${start}:${end}`)) continue;
        const a = moves.slice(start, start + aLength);
        const b = moves.slice(start + aLength, start + aLength + bLength);
        const inverseA = moves.slice(start + aLength + bLength, start + aLength * 2 + bLength);
        const inverseB = moves.slice(start + aLength * 2 + bLength, end);
        if (!sameSequence(inverseA, inverseSequence(a)) || !sameSequence(inverseB, inverseSequence(b))) continue;
        if (!best || end - start > best.end - best.start) {
          best = {
            type: "commutator",
            variant: "Commutator",
            start,
            end,
            moves: moves.slice(start, end),
          };
        }
      }
    }
    if (best) commutators.push(best);
  }
  return commutators;
}

export function detectAlgorithmFeatures(moves) {
  const named = findNamedFeatures(moves);
  return [...named, ...findCommutators(moves, named)].sort((a, b) => a.start - b.start || b.end - a.end);
}

function calculateMetrics(moves) {
  let effectiveMoves = 0;
  for (let index = 0; index < moves.length;) {
    const currentGroup = PARALLEL_GROUP[moves[index][0]];
    const nextGroup = PARALLEL_GROUP[moves[index + 1]?.[0]];
    if (currentGroup && currentGroup === nextGroup && moves[index][0] !== moves[index + 1][0]) {
      effectiveMoves += 1;
      index += 2;
    } else {
      effectiveMoves += 1;
      index += 1;
    }
  }
  return {
    effectiveMoves,
    symbolMoves: moves.length,
    quarterTurns: moves.reduce((total, move) => total + (move.endsWith("2") ? 2 : 1), 0),
  };
}

function detectAuf(moves, features) {
  const covered = new Set();
  for (const feature of features) {
    for (let index = feature.start; index < feature.end; index += 1) covered.add(index);
  }
  const hasStart = moves[0]?.[0] === "U" && !covered.has(0);
  const lastIndex = moves.length - 1;
  const hasEnd = moves[lastIndex]?.[0] === "U" && !covered.has(lastIndex);
  const position = hasStart && hasEnd ? "both" : hasStart ? "start" : hasEnd ? "end" : "none";
  return { hasStart, hasEnd, position };
}

function analyzeEase(moves, metrics, regrip, features) {
  const coveredMoves = new Set();
  const featureTypes = new Set();
  for (const feature of features) {
    featureTypes.add(feature.type);
    for (let index = feature.start; index < feature.end; index += 1) coveredMoves.add(index);
  }

  const totalMoves = metrics.symbolMoves;
  const triggerMoves = coveredMoves.size;
  const unrecognizedMoves = Math.max(0, totalMoves - triggerMoves);
  const regrips = regrip.count ?? 0;
  const rawScore = 100 - 3 * totalMoves + 2 * triggerMoves - 8 * regrips;
  const score = Math.max(0, Math.min(100, rawScore));
  const band = score >= 90 ? "excellent" : score >= 78 ? "easy" : score >= 65 ? "average" : score >= 50 ? "difficult" : "hard";

  return {
    score,
    band,
    featureTypes: [...featureTypes],
    formula: {
      totalMoves,
      triggerMoves,
      unrecognizedMoves,
      regrips,
      regripKnown: regrip.count !== null,
    },
  };
}

export function analyzeSolutionMoves(moves) {
  const normalized = [...moves];
  const key = `solution:${normalized.join(" ")}`;
  if (ANALYSIS_CACHE.has(key)) return ANALYSIS_CACHE.get(key);
  const metrics = calculateMetrics(normalized);
  const regrip = analyzeRegrips(normalized);
  const features = detectAlgorithmFeatures(normalized);
  const result = {
    metrics,
    regrip,
    features,
    auf: detectAuf(normalized, features),
    ease: analyzeEase(normalized, metrics, regrip, features),
  };
  ANALYSIS_CACHE.set(key, result);
  return result;
}

export function matchesSolutionFilters(analysis, filters) {
  if (filters.auf !== "all") {
    if (filters.auf === "any" && analysis.auf.position === "none") return false;
    if (!["any", analysis.auf.position].includes(filters.auf)) return false;
  }
  if (filters.regrip !== "all") {
    if (analysis.regrip.count === null) return false;
    if (filters.regrip === "known") {
      // A known count is enough for this option.
    } else if (analysis.regrip.count > Number(filters.regrip)) {
      return false;
    }
  }
  if (filters.ease !== "all" && analysis.ease.score < Number(filters.ease)) return false;
  if (filters.feature !== "all") {
    if (filters.feature === "any" && !analysis.features.length) return false;
    if (filters.feature !== "any" && !analysis.features.some((feature) => feature.type === filters.feature)) return false;
  }
  return true;
}
