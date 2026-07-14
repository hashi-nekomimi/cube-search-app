import { expect, test } from "@playwright/test";
import {
  COLL_PRESET_DATA,
  ZBLL_PRESET_DATA,
  ZBLS_F2L_PRESET_DATA,
  ZBLS_PRESET_DATA,
} from "../../src/presetData.generated.js";
import {
  applyAlg,
  cubieCoordinatesFromState,
  isCollGoal,
  isSolvedUpToAuf,
  makeCollPattern,
  makeF2lPattern,
  makeZblsPattern,
  patternMatchesState,
  SOLVED_STATE,
  stateFromSetup,
  stateFromCubieCoordinates,
  STICKERS,
} from "../../scripts/cube-state.mjs";

const FAMILY_ORDER = ["H", "Pi", "U", "T", "L", "S", "AS"];

function countsBy(records, key) {
  return Object.fromEntries(
    [...new Set(records.map((record) => record[key]))].map((value) => [
      value,
      records.filter((record) => record[key] === value).length,
    ]),
  );
}

function isZblsUnsolvedPosition(pos) {
  const key = pos.join(",");
  return pos[1] === 1 || key === "1,0,1" || key === "1,-1,1";
}

test("SpeedCubeDB COLL and ZBLL setups are solved by their published algorithms", () => {
  expect(COLL_PRESET_DATA).toHaveLength(40);
  expect(ZBLL_PRESET_DATA).toHaveLength(472);

  for (const record of COLL_PRESET_DATA) {
    const sourceState = stateFromSetup(record.setup);
    expect(isCollGoal(applyAlg(sourceState, record.solution)), record.name).toBe(true);
  }
  for (const record of ZBLL_PRESET_DATA) {
    const sourceState = stateFromSetup(record.setup);
    expect(isSolvedUpToAuf(applyAlg(sourceState, record.solution)), record.name).toBe(true);
  }
});

test("COLL and ZBLL form the exact 7-family, 40-subgroup, 472-case hierarchy", () => {
  expect(countsBy(COLL_PRESET_DATA, "family")).toEqual({
    H: 4,
    Pi: 6,
    U: 6,
    T: 6,
    L: 6,
    S: 6,
    AS: 6,
  });
  expect(countsBy(ZBLL_PRESET_DATA, "family")).toEqual({
    H: 40,
    Pi: 72,
    U: 72,
    T: 72,
    L: 72,
    S: 72,
    AS: 72,
  });

  const collByName = new Map(COLL_PRESET_DATA.map((record) => [record.name, record]));
  for (const family of FAMILY_ORDER) {
    const collCases = COLL_PRESET_DATA.filter((record) => record.family === family);
    const subgroupCounts = collCases.map((coll) => (
      ZBLL_PRESET_DATA.filter((record) => record.coll === coll.name).length
    )).sort((left, right) => left - right);
    expect(subgroupCounts, family).toEqual(family === "H" ? [8, 8, 12, 12] : [12, 12, 12, 12, 12, 12]);
  }

  const zbllStates = new Set();
  for (const record of ZBLL_PRESET_DATA) {
    const coll = collByName.get(record.coll);
    expect(coll, record.name).toBeTruthy();
    expect(makeCollPattern(record.state), record.name).toBe(coll.state);
    expect([record.state[0], record.state[2], record.state[6], record.state[8]]).not.toEqual(["U", "U", "U", "U"]);
    zbllStates.add(record.state);
  }
  expect(zbllStates.size).toBe(472);
});

test("ZBLS enumerates 42 F2L states and 302 non-mirrored EO cases", () => {
  expect(ZBLS_F2L_PRESET_DATA).toHaveLength(42);
  expect(ZBLS_PRESET_DATA).toHaveLength(302);
  expect(countsBy(ZBLS_F2L_PRESET_DATA, "kind")).toEqual({
    top: 24,
    "edge-in-slot": 6,
    "corner-in-slot": 6,
    "both-in-slot": 6,
  });

  const solved = ZBLS_F2L_PRESET_DATA.filter((record) => record.solved);
  expect(solved).toHaveLength(1);
  expect(solved[0].id).toBe("f2l-42");
  expect(solved[0].caseCount).toBe(0);

  const slotCounts = ZBLS_F2L_PRESET_DATA
    .filter((record) => record.kind === "both-in-slot")
    .map((record) => record.caseCount)
    .sort((left, right) => left - right);
  expect(slotCounts).toEqual([0, 2, 2, 2, 4, 4]);
  expect(ZBLS_F2L_PRESET_DATA.filter((record) => record.kind !== "both-in-slot").every((record) => record.caseCount === 8)).toBe(true);

  const f2lById = new Map(ZBLS_F2L_PRESET_DATA.map((record) => [record.id, record]));
  const states = new Set();
  for (const record of ZBLS_PRESET_DATA) {
    const group = f2lById.get(record.f2l);
    expect(group, record.name).toBeTruthy();
    expect(record.f2lState, record.name).toBe(group.state);
    expect(makeF2lPattern(record.fullState), record.name).toBe(record.f2lState);
    expect(makeZblsPattern(record.fullState), record.name).toBe(record.state);
    expect(patternMatchesState(record.state, record.fullState), record.name).toBe(true);
    expect(record.fullState).toHaveLength(54);
    expect(stateFromCubieCoordinates(cubieCoordinatesFromState(record.fullState)), record.name).toBe(record.fullState);
    for (const color of ["U", "R", "F", "D", "L", "B"]) {
      expect([...record.fullState].filter((value) => value === color), `${record.name} ${color}`).toHaveLength(9);
    }
    STICKERS.forEach((sticker, index) => {
      if (!isZblsUnsolvedPosition(sticker.pos)) {
        expect(record.fullState[index], `${record.name} sticker ${index}`).toBe(SOLVED_STATE[index]);
      }
    });
    states.add(record.state);
  }
  expect(states.size).toBe(302);

  for (const group of ZBLS_F2L_PRESET_DATA) {
    const cases = ZBLS_PRESET_DATA.filter((record) => record.f2l === group.id);
    expect(cases, group.id).toHaveLength(group.caseCount);
    expect(new Set(cases.map((record) => record.eoMask)).size, group.id).toBe(group.caseCount);
  }
});
