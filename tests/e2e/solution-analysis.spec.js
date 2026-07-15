import { expect, test } from "@playwright/test";
import {
  analyzeSolutionMoves,
  matchesSolutionFilters,
} from "../../src/solutionAnalysis.js";

function moves(algorithm) {
  return algorithm.trim() ? algorithm.trim().split(/\s+/) : [];
}

test("ease scoring rewards recognizable triggers", () => {
  const sexy = analyzeSolutionMoves(moves("R U R' U'"));
  const plain = analyzeSolutionMoves(moves("R U R U"));

  expect(sexy.features.some((feature) => feature.type === "sexy")).toBe(true);
  expect(sexy.ease.formula).toEqual({
    totalMoves: 4,
    triggerMoves: 4,
    unrecognizedMoves: 0,
    regrips: 0,
    regripKnown: true,
  });
  expect(sexy.ease.score).toBe(96);
  expect(plain.ease.score).toBe(88);
});

test("inverse, mirror and side-rotated trigger equivalents receive the same credit", () => {
  const equivalentClasses = [
    { type: "sexy", algorithms: ["R U R' U'", "U R U' R'", "L' U' L U", "B U B' U'"] },
    { type: "sune", algorithms: ["R U R' U R U2 R'", "R U2 R' U' R U' R'", "L' U' L U' L' U2 L", "B U B' U B U2 B'"] },
    { type: "sledge", algorithms: ["R' F R F'", "F R' F' R", "L F' L' F", "B' R B R'"] },
    { type: "commutator", algorithms: ["R D R' D'", "D R D' R'", "L' D' L D", "B D B' D'", "R U R' U' R D R' U R U' R' D'"] },
  ];

  for (const equivalentClass of equivalentClasses) {
    for (const algorithm of equivalentClass.algorithms) {
      const analysis = analyzeSolutionMoves(moves(algorithm));
      expect(analysis.features.some((feature) => feature.type === equivalentClass.type), algorithm).toBe(true);
      expect(analysis.ease.formula.triggerMoves, algorithm).toBe(analysis.metrics.symbolMoves);
      expect(analysis.ease.score, algorithm).toBe(100 - analysis.metrics.symbolMoves - 8 * analysis.ease.formula.regrips);
    }
  }
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

test("AUF filters ignore a U move that belongs to a recognized trigger", () => {
  const triggerOnly = analyzeSolutionMoves(moves("R U R' U'"));
  const leadingAuf = analyzeSolutionMoves(moves("U R U R' U'"));

  expect(triggerOnly.auf.position).toBe("none");
  expect(leadingAuf.auf.position).toBe("start");
  expect(matchesSolutionFilters(leadingAuf, { auf: "any", regrip: "all", ease: "all", feature: "all" })).toBe(true);
  expect(matchesSolutionFilters(triggerOnly, { auf: "any", regrip: "all", ease: "all", feature: "all" })).toBe(false);
});
