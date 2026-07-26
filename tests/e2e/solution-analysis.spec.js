import { expect, test } from "@playwright/test";
import {
  analyzeSolutionMoves,
  matchesSolutionFilters,
} from "../../src/solutionAnalysis.js";

function moves(algorithm) {
  return algorithm.trim() ? algorithm.trim().split(/\s+/) : [];
}

test("ease scoring gives exact commutators a pattern bonus before clamping", () => {
  const commutator = analyzeSolutionMoves(moves("R U R' U'"));
  const plain = analyzeSolutionMoves(moves("R U R U"));

  expect(commutator.features.some((feature) => feature.type === "sexy")).toBe(false);
  expect(commutator.features.some((feature) => feature.type === "commutator")).toBe(true);
  expect(commutator.ease.formula).toMatchObject({
    baseScore: 120,
    totalMoves: 4,
    triggerMoves: 4,
    namedTriggerMoves: 0,
    commutators: 1,
    regrips: 0,
    halfTurns: 0,
    wideMoves: 0,
    leftMoves: 0,
    sliceMoves: 0,
    regripKnown: true,
  });
  expect(commutator.ease.formula.adjustments).toEqual({
    htm: -12,
    halfTurns: -0,
    patterns: 4,
    regrips: -0,
    wide: -0,
    left: -0,
    slice: -0,
    rotation: -0,
  });
  expect(plain.ease.formula.adjustments.patterns).toBe(0);
  expect(commutator.ease.score).toBe(100);
  expect(plain.ease.score).toBe(100);
});

test("inverse, mirror and side-rotated named triggers are all recognized", () => {
  const equivalentClasses = [
    { type: "sune", algorithms: ["R U R' U R U2 R'", "R U2 R' U' R U' R'", "L' U' L U' L' U2 L", "B U B' U B U2 B'"] },
    { type: "sledge", algorithms: ["R' F R F'", "F R' F' R", "L F' L' F", "B' R B R'"] },
  ];

  for (const equivalentClass of equivalentClasses) {
    for (const algorithm of equivalentClass.algorithms) {
      const analysis = analyzeSolutionMoves(moves(algorithm));
      expect(analysis.features.some((feature) => feature.type === equivalentClass.type), algorithm).toBe(true);
      expect(analysis.ease.formula.namedTriggerMoves, algorithm).toBe(analysis.metrics.symbolMoves);
    }
  }
});

test("commutator detection is exact, primitive, and non-overlapping", () => {
  for (const algorithm of [
    "R D R' D'",
    "D R D' R'",
    "L' D' L D",
    "B D B' D'",
    "R U R' U'",
    "U R U' R'",
    "L' U' L U",
    "B U B' U'",
  ]) {
    const analysis = analyzeSolutionMoves(moves(algorithm));
    expect(analysis.features.filter((feature) => feature.type === "commutator"), algorithm).toHaveLength(1);
    expect(analysis.features.some((feature) => feature.type === "sexy"), algorithm).toBe(false);
  }

  const compound = analyzeSolutionMoves(moves("R U R' D R U' R' D'"));
  expect(compound.features.filter((feature) => feature.type === "commutator")).toHaveLength(1);

  const repeated = analyzeSolutionMoves(moves("R2 U' R2 U R2 U' R2 U"));
  expect(repeated.features.filter((feature) => feature.type === "commutator").map(({ start, end }) => [start, end])).toEqual([[0, 4], [4, 8]]);
  expect(repeated.ease.formula.commutators).toBe(2);
  expect(repeated.ease.formula.adjustments.patterns).toBe(8);

  for (const algorithm of ["R L R' L'", "R R R' R'"]) {
    const analysis = analyzeSolutionMoves(moves(algorithm));
    expect(analysis.features.some((feature) => feature.type === "commutator"), algorithm).toBe(false);
  }

  expect(analyzeSolutionMoves(moves("R U R' U'")).features)
    .toEqual(expect.arrayContaining([expect.objectContaining({ type: "commutator", aLength: 1, bLength: 1 })]));

  const overlappingFormerSexy = analyzeSolutionMoves(moves("R U R' U' R U R D R U' R D' R' U2 R'"));
  expect(overlappingFormerSexy.features).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "commutator", start: 0, end: 4, aLength: 1, bLength: 1 }),
  ]));
  expect(overlappingFormerSexy.features.some((feature) => feature.type === "sexy")).toBe(false);
});

test("commutator boundaries and conjugate setup remain available to analysis", () => {
  const commutator = analyzeSolutionMoves(moves("R U R' D R U' R' D'"))
    .features.find((feature) => feature.type === "commutator");
  expect(commutator).toMatchObject({ start: 0, end: 8, aLength: 3, bLength: 1 });

  const conjugated = analyzeSolutionMoves(moves("F R D R' D' F'"));
  expect(conjugated.features.find((feature) => feature.type === "conjugate"))
    .toMatchObject({ start: 0, end: 6, setupLength: 1, coreLength: 4 });
  expect(conjugated.features.some((feature) => feature.type === "commutator")).toBe(true);
  expect(conjugated.ease.formula.commutators).toBe(1);
  expect(conjugated.ease.formula.adjustments.patterns).toBe(4);

  const longCommutator = analyzeSolutionMoves(moves("R U F L D L' F' U' R' D'"))
    .features.find((feature) => feature.type === "commutator");
  expect(longCommutator).toMatchObject({ aLength: 4, bLength: 1 });
  const longConjugate = analyzeSolutionMoves(moves("R U F L D L' F' U' R'"))
    .features.find((feature) => feature.type === "conjugate");
  expect(longConjugate).toMatchObject({ setupLength: 4, coreLength: 1 });
});

test("L, slice, and rotation moves lower EASE", () => {
  const right = analyzeSolutionMoves(moves("R U R' U' R U R' U' R U R' U'"));
  const left = analyzeSolutionMoves(moves("L' U' L U L' U' L U L' U' L U"));
  const slice = analyzeSolutionMoves(moves("M2 U M2 U2 M2 U M2"));
  const rotated = analyzeSolutionMoves(moves("x R U R' U' x'"));

  expect(left.ease.formula.leftMoves).toBe(6);
  expect(left.ease.formula.adjustments.left).toBe(-24);
  expect(left.ease.score).toBe(72);
  expect(left.ease.score).toBeLessThan(right.ease.score);
  expect(slice.ease.formula.sliceMoves).toBe(4);
  expect(slice.ease.formula.adjustments.slice).toBe(-16);
  expect(slice.ease.formula.halfTurns).toBe(5);
  expect(slice.ease.formula.adjustments.halfTurns).toBe(-5);
  expect(slice.ease.score).toBe(78);
  expect(rotated.ease.formula.rotationMoves).toBe(2);
  expect(rotated.ease.formula.adjustments.rotation).toBe(-12);
  expect(rotated.ease.score).toBeLessThan(right.ease.score);
});

test("regrip analysis reconstructs a concrete minimum path", () => {
  const analysis = analyzeSolutionMoves(moves("R U R U R"));

  expect(analysis.regrip.count).toBe(1);
  expect(analysis.regrip.steps).toHaveLength(5);
  expect(analysis.regrip.steps.some((step) => step.regripFrom !== null)).toBe(true);
  expect(analysis.regrip.steps.every((step) => Number.isInteger(step.beforeThumb) && Number.isInteger(step.afterThumb))).toBe(true);
});

test("mirrored algorithms use the equivalent left-thumb path", () => {
  const right = analyzeSolutionMoves(moves("R U R' U'"));
  const left = analyzeSolutionMoves(moves("L' U' L U"));

  expect(right.regrip.hand).toBe("right");
  expect(left.regrip.hand).toBe("left");
  expect(left.regrip.count).toBe(right.regrip.count);
  expect(left.regrip.steps.map((step) => step.move)).toEqual(moves("L' U' L U"));
});

test("wide turns reuse single-layer regrip paths with a small per-move penalty", () => {
  const pairs = [
    ["R U R U R", "r U r U r"],
    ["L' U' L U", "l' U' l U"],
    ["F U F'", "f U f'"],
    ["B U B'", "b U b'"],
    ["U R U'", "u R u'"],
    ["D R D'", "d R d'"],
  ];
  for (const [singleAlgorithm, wideAlgorithm] of pairs) {
    const singleAnalysis = analyzeSolutionMoves(moves(singleAlgorithm));
    const wideAnalysis = analyzeSolutionMoves(moves(wideAlgorithm));
    expect(wideAnalysis.regrip.count, wideAlgorithm).toBe(singleAnalysis.regrip.count);
  }

  const singleLayer = analyzeSolutionMoves(moves(pairs[0][0]));
  const wide = analyzeSolutionMoves(moves(pairs[0][1]));
  expect(wide.regrip.count).toBe(singleLayer.regrip.count);
  expect(wide.regrip.hand).toBe(singleLayer.regrip.hand);
  expect(wide.regrip.steps.map((step) => step.move)).toEqual(moves("r U r U r"));
  expect(wide.ease.formula.wideMoves).toBe(3);
  expect(wide.ease.score).toBe(singleLayer.ease.score - 3);

  const leftWide = analyzeSolutionMoves(moves("l' U' l U"));
  expect(leftWide.regrip.count).toBe(0);
  expect(leftWide.regrip.hand).toBe("left");
});

test("AUF filters ignore a U move that belongs to a recognized trigger", () => {
  const triggerOnly = analyzeSolutionMoves(moves("R U R' U'"));
  const leadingAuf = analyzeSolutionMoves(moves("U R U R' U'"));

  expect(triggerOnly.auf.position).toBe("none");
  expect(leadingAuf.auf.position).toBe("start");
  expect(matchesSolutionFilters(leadingAuf, { auf: "any", regrip: "all", ease: "all", feature: "all" })).toBe(true);
  expect(matchesSolutionFilters(triggerOnly, { auf: "any", regrip: "all", ease: "all", feature: "all" })).toBe(false);
});
