import { expect, test } from "@playwright/test";
import {
  analyzeSolutionMoves,
  detectAlgorithmFeatures,
  matchesSolutionFilters,
} from "../../src/solutionAnalysis.js";

function moves(algorithm) {
  return algorithm.trim() ? algorithm.trim().split(/\s+/) : [];
}

test("ease scoring rewards recognizable triggers", () => {
  const sexy = analyzeSolutionMoves(moves("R U R' U'"));
  const awkward = analyzeSolutionMoves(moves("B D2 F' L"));

  expect(sexy.features.some((feature) => feature.type === "sexy")).toBe(true);
  expect(sexy.ease.score).toBeGreaterThan(awkward.ease.score);
  expect(sexy.ease.score).toBeGreaterThanOrEqual(90);
});

test("Sune and commutator structures are recognized", () => {
  expect(detectAlgorithmFeatures(moves("R U R' U R U2 R'")).some((feature) => feature.type === "sune")).toBe(true);
  expect(detectAlgorithmFeatures(moves("R D R' D'")).some((feature) => feature.type === "commutator")).toBe(true);
});

test("regrip analysis reconstructs a concrete minimum path", () => {
  const analysis = analyzeSolutionMoves(moves("R U R U R"));

  expect(analysis.regrip.count).toBe(1);
  expect(analysis.regrip.steps).toHaveLength(5);
  expect(analysis.regrip.steps.some((step) => step.regripFrom !== null)).toBe(true);
  expect(analysis.regrip.steps.every((step) => Number.isInteger(step.beforeThumb) && Number.isInteger(step.afterThumb))).toBe(true);
});

test("AUF filters ignore a U move that belongs to a recognized trigger", () => {
  const triggerOnly = analyzeSolutionMoves(moves("R U R' U'"));
  const leadingAuf = analyzeSolutionMoves(moves("U R U R' U'"));

  expect(triggerOnly.auf.position).toBe("none");
  expect(leadingAuf.auf.position).toBe("start");
  expect(matchesSolutionFilters(leadingAuf, { auf: "any", regrip: "all", ease: "all", feature: "all" })).toBe(true);
  expect(matchesSolutionFilters(triggerOnly, { auf: "any", regrip: "all", ease: "all", feature: "all" })).toBe(false);
});
