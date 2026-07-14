import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  applyAlg,
  CORNER_NAMES,
  EDGE_NAMES,
  isCollGoal,
  isSolvedUpToAuf,
  makeCollPattern,
  makeF2lPattern,
  makeZblsPattern,
  normalizeCenters,
  patternMatchesState,
  permutationParity,
  stateFromCubieCoordinates,
  stateFromSetup,
} from "./cube-state.mjs";

const SPEEDCUBEDB_BASE = "https://speedcubedb.com/a/3x3";
const ZBLS_REFERENCE = "https://www.speedsolving.com/wiki/index.php?title=ZBLS";
const OUTPUT_PATH = fileURLToPath(new URL("../src/presetData.generated.js", import.meta.url));
const FAMILY_ORDER = ["H", "Pi", "U", "T", "L", "S", "AS"];
const sourceWarnings = [];

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function plainText(value) {
  return decodeHtml(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function slug(value) {
  return value.toLowerCase().replaceAll("+", "-plus").replaceAll("-", "-minus").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "cube-search-app preset generator" } });
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return response.text();
}

function parseSpeedCubeDbPage(html, category) {
  const headingPattern = new RegExp(`data-title="3x3 - ${category} - ([^"]+)"`, "g");
  const headings = [...html.matchAll(headingPattern)];
  return headings.map((heading, index) => {
    const fragment = html.slice(heading.index, headings[index + 1]?.index || html.length);
    const setup = plainText(fragment.match(/class="setup-case[^"]*"><div>setup:<\/div>([\s\S]*?)<\/div>/)?.[1]);
    const subgroup = plainText(fragment.match(/data-filter="([^"]+)"/)?.[1]);
    const solutions = [...fragment.matchAll(/class="formatted-alg">([\s\S]*?)<\/div>/g)]
      .map((match) => plainText(match[1]))
      .filter(Boolean);
    if (!setup || !solutions.length) {
      throw new Error(`${category} ${heading[1]} is missing setup or solutions`);
    }
    return { name: plainText(heading[1]), setup, subgroup, solutions };
  });
}

function validateUnique(records, key, label) {
  const values = records.map((record) => record[key]);
  if (new Set(values).size !== values.length) {
    const duplicate = values.find((value, index) => values.indexOf(value) !== index);
    const duplicateNames = records.filter((record) => record[key] === duplicate).map((record) => record.name || record.id);
    throw new Error(`${label} contains a duplicate ${key} (${duplicateNames.join(", ")}): ${duplicate}`);
  }
}

function splitValidSolutions(set, name, solutions, predicate) {
  const valid = [];
  for (const solution of solutions) {
    try {
      if (predicate(solution)) {
        valid.push(solution);
      } else {
        sourceWarnings.push({ set, name, solution, reason: "goal mismatch" });
      }
    } catch (error) {
      sourceWarnings.push({ set, name, solution, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return valid;
}

function makeCollRecords(sourceCases) {
  return sourceCases.map((source) => {
    const family = source.name.split(/\s+/)[0];
    const fullState = stateFromSetup(source.setup);
    const state = makeCollPattern(fullState);
    const validSolutions = splitValidSolutions(
      "COLL",
      source.name,
      source.solutions,
      (solution) => isCollGoal(applyAlg(fullState, solution)),
    );
    if (!validSolutions.length) throw new Error(`${source.name} has no valid COLL solutions`);
    if (!patternMatchesState(state, fullState)) throw new Error(`${source.name} COLL mask is invalid`);
    return {
      id: `coll-${slug(source.name)}`,
      name: source.name.replace(/\s+/g, ""),
      family,
      setup: source.setup,
      solution: validSolutions[0],
      fullState,
      state,
    };
  }).sort((left, right) => (
    FAMILY_ORDER.indexOf(left.family) - FAMILY_ORDER.indexOf(right.family)
    || left.name.localeCompare(right.name, undefined, { numeric: true })
  ));
}

function makeZbllRecords(sourceCases, family) {
  return sourceCases.map((source) => {
    const fullState = stateFromSetup(source.setup);
    const validSolutions = splitValidSolutions(
      "ZBLL",
      source.name,
      source.solutions,
      (solution) => isSolvedUpToAuf(applyAlg(fullState, solution)),
    );
    if (!validSolutions.length) throw new Error(`${source.name} has no valid ZBLL solutions`);
    return {
      id: `zbll-${slug(source.name)}`,
      name: source.name.replace(/^ZBLL\s+/, ""),
      family,
      coll: source.subgroup.replace(/\s+/g, ""),
      setup: source.setup,
      solution: validSolutions[0],
      state: fullState,
    };
  });
}

function alignZbllRecordsToColl(records, collRecords) {
  function matchesForRecord(record) {
    const matches = [];
    for (const collCase of collRecords.filter((candidate) => candidate.family === record.family)) {
      for (const view of ["", "y", "y2", "y'"]) {
        const viewedState = view ? normalizeCenters(applyAlg(record.state, view)) : record.state;
        for (const auf of ["", "U", "U2", "U'"]) {
          const fullState = applyAlg(viewedState, auf);
          if (makeCollPattern(fullState) === collCase.state) {
            matches.push({ collCase, view, auf, fullState });
            break;
          }
        }
      }
    }
    return matches;
  }

  const recordsWithMatches = records.map((record) => ({ record, matches: matchesForRecord(record) }));
  const sourceGroups = new Map();
  for (const item of recordsWithMatches) {
    const key = `${item.record.family}:${item.record.coll}`;
    if (!sourceGroups.has(key)) sourceGroups.set(key, []);
    sourceGroups.get(key).push(item);
  }

  const groupCandidates = [...sourceGroups].map(([key, items]) => {
    let candidates = new Set(items[0].matches.map((match) => match.collCase.name));
    for (const item of items.slice(1)) {
      const names = new Set(item.matches.map((match) => match.collCase.name));
      candidates = new Set([...candidates].filter((name) => names.has(name)));
    }
    if (!candidates.size) throw new Error(`${key} has no common COLL mapping`);
    return { key, family: items[0].record.family, candidates: [...candidates].sort() };
  });

  const assignment = new Map();
  for (const family of FAMILY_ORDER) {
    const groups = groupCandidates
      .filter((group) => group.family === family)
      .sort((left, right) => left.candidates.length - right.candidates.length || left.key.localeCompare(right.key));
    function assign(index, used) {
      if (index === groups.length) return true;
      for (const candidate of groups[index].candidates) {
        if (used.has(candidate)) continue;
        assignment.set(groups[index].key, candidate);
        used.add(candidate);
        if (assign(index + 1, used)) return true;
        used.delete(candidate);
        assignment.delete(groups[index].key);
      }
      return false;
    }
    if (!assign(0, new Set())) throw new Error(`${family} ZBLL subgroups cannot be mapped one-to-one to COLL`);
  }

  return recordsWithMatches.map(({ record, matches }) => {
    const target = assignment.get(`${record.family}:${record.coll}`);
    const match = matches.find((candidate) => candidate.collCase.name === target);
    if (!match) throw new Error(`${record.name} cannot be aligned to assigned COLL ${target}`);
    const { collCase, view, auf, fullState } = match;
    return {
      ...record,
      sourceSubgroup: record.coll,
      coll: collCase.name,
      view,
      auf,
      fullState,
      state: fullState,
    };
  });
}

const LAST_SLOT_CORNER_POSITIONS = [0, 1, 2, 3, 4];
const LAST_SLOT_EDGE_POSITIONS = [0, 1, 2, 3, 8];

function rotateLastLayerPosition(position) {
  return { 0: 3, 1: 0, 2: 1, 3: 2, 4: 4, 8: 8 }[position];
}

function f2lTupleKey(tuple) {
  return [
    CORNER_NAMES[tuple.cornerPosition],
    tuple.cornerOrientation,
    EDGE_NAMES[tuple.edgePosition],
    tuple.edgeOrientation,
  ].join(":");
}

function canonicalF2lTuple(tuple) {
  const rotations = [];
  let current = { ...tuple };
  for (let turn = 0; turn < 4; turn += 1) {
    rotations.push({ ...current, key: f2lTupleKey(current) });
    current = {
      ...current,
      cornerPosition: rotateLastLayerPosition(current.cornerPosition),
      edgePosition: rotateLastLayerPosition(current.edgePosition),
    };
  }
  return rotations.sort((left, right) => left.key.localeCompare(right.key))[0];
}

function f2lKind(tuple) {
  const cornerInSlot = tuple.cornerPosition === 4;
  const edgeInSlot = tuple.edgePosition === 8;
  if (!cornerInSlot && !edgeInSlot) return "top";
  if (!cornerInSlot) return "edge-in-slot";
  if (!edgeInSlot) return "corner-in-slot";
  return "both-in-slot";
}

function enumerateF2lGroups() {
  const groups = new Map();
  for (const cornerPosition of LAST_SLOT_CORNER_POSITIONS) {
    for (let cornerOrientation = 0; cornerOrientation < 3; cornerOrientation += 1) {
      for (const edgePosition of LAST_SLOT_EDGE_POSITIONS) {
        for (let edgeOrientation = 0; edgeOrientation < 2; edgeOrientation += 1) {
          const canonical = canonicalF2lTuple({
            cornerPosition,
            cornerOrientation,
            edgePosition,
            edgeOrientation,
          });
          groups.set(canonical.key, canonical);
        }
      }
    }
  }
  const kindOrder = ["top", "edge-in-slot", "corner-in-slot", "both-in-slot"];
  const isSolvedTuple = (tuple) => tuple.cornerPosition === 4
    && tuple.cornerOrientation === 0
    && tuple.edgePosition === 8
    && tuple.edgeOrientation === 0;
  return [...groups.values()]
    .sort((left, right) => (
      kindOrder.indexOf(f2lKind(left)) - kindOrder.indexOf(f2lKind(right))
      || Number(isSolvedTuple(left)) - Number(isSolvedTuple(right))
      || left.key.localeCompare(right.key)
    ))
    .map((tuple, index) => {
      const solved = isSolvedTuple(tuple);
      return {
        ...tuple,
        id: `f2l-${index + 1}`,
        label: `F${String(index + 1).padStart(2, "0")}`,
        kind: f2lKind(tuple),
        solved,
        title: `${CORNER_NAMES[tuple.cornerPosition]}/${tuple.cornerOrientation} ${EDGE_NAMES[tuple.edgePosition]}/${tuple.edgeOrientation}`,
      };
    });
}

function eoMasksForGroup(group) {
  const remainingPositions = LAST_SLOT_EDGE_POSITIONS.filter((position) => position !== group.edgePosition);
  const candidates = [];
  for (let value = 0; value < 16; value += 1) {
    const bits = remainingPositions.map((_, index) => (value >> index) & 1);
    if ((bits.reduce((sum, bit) => sum + bit, group.edgeOrientation) % 2) === 0) {
      candidates.push(bits);
    }
  }
  if (group.kind !== "both-in-slot") return candidates;

  const unique = new Map();
  for (const bits of candidates) {
    let orientationByPosition = new Map(remainingPositions.map((position, index) => [position, bits[index]]));
    const rotations = [];
    for (let turn = 0; turn < 4; turn += 1) {
      rotations.push(LAST_SLOT_EDGE_POSITIONS.slice(0, 4).map((position) => orientationByPosition.get(position)).join(""));
      orientationByPosition = new Map(
        [...orientationByPosition].map(([position, bit]) => [rotateLastLayerPosition(position), bit]),
      );
    }
    const canonical = rotations.sort()[0];
    if (!unique.has(canonical)) unique.set(canonical, [...canonical].map(Number));
  }
  return [...unique.values()].sort((left, right) => left.join("").localeCompare(right.join("")));
}

function representativeState(group, eoMask) {
  const cornerPermutation = CORNER_NAMES.map((_, index) => index);
  const cornerOrientation = CORNER_NAMES.map(() => 0);
  const edgePermutation = EDGE_NAMES.map((_, index) => index);
  const edgeOrientation = EDGE_NAMES.map(() => 0);

  const remainingCornerPositions = LAST_SLOT_CORNER_POSITIONS.filter((position) => position !== group.cornerPosition);
  cornerPermutation[group.cornerPosition] = 4;
  remainingCornerPositions.forEach((position, index) => {
    cornerPermutation[position] = index;
  });
  cornerOrientation[group.cornerPosition] = group.cornerOrientation;
  cornerOrientation[remainingCornerPositions[0]] = (3 - group.cornerOrientation) % 3;

  const remainingEdgePositions = LAST_SLOT_EDGE_POSITIONS.filter((position) => position !== group.edgePosition);
  edgePermutation[group.edgePosition] = 8;
  remainingEdgePositions.forEach((position, index) => {
    edgePermutation[position] = index;
    edgeOrientation[position] = eoMask[index];
  });
  edgeOrientation[group.edgePosition] = group.edgeOrientation;

  if (permutationParity(cornerPermutation) !== permutationParity(edgePermutation)) {
    const [first, second] = remainingCornerPositions;
    [cornerPermutation[first], cornerPermutation[second]] = [cornerPermutation[second], cornerPermutation[first]];
  }

  return stateFromCubieCoordinates({
    cornerPermutation,
    cornerOrientation,
    edgePermutation,
    edgeOrientation,
  });
}

function makeZblsData() {
  const cases = [];
  const groups = enumerateF2lGroups().map((group) => {
    const masks = group.solved ? [] : eoMasksForGroup(group);
    const previewState = representativeState(group, masks[0] || [0, 0, 0, 0]);
    const f2lState = makeF2lPattern(previewState);
    masks.forEach((eoMask, index) => {
      const fullState = representativeState(group, eoMask);
      const state = makeZblsPattern(fullState);
      if (!patternMatchesState(state, fullState)) {
        throw new Error(`${group.id} EO${index + 1} generated an invalid mask`);
      }
      cases.push({
        id: `zbls-${group.id}-${index + 1}`,
        name: `${group.label}-EO${String(index + 1).padStart(2, "0")}`,
        f2l: group.id,
        eo: index + 1,
        eoMask: eoMask.join(""),
        fullState,
        f2lState,
        state,
      });
    });
    return {
      id: group.id,
      label: group.label,
      title: group.title,
      kind: group.kind,
      solved: group.solved,
      cornerPosition: CORNER_NAMES[group.cornerPosition],
      cornerOrientation: group.cornerOrientation,
      edgePosition: EDGE_NAMES[group.edgePosition],
      edgeOrientation: group.edgeOrientation,
      state: f2lState,
      caseCount: masks.length,
    };
  });
  return { groups, cases };
}

function validateRelationships(coll, zbll, zblsGroups, zbls) {
  if (coll.length !== 40) throw new Error(`Expected 40 COLL cases, found ${coll.length}`);
  if (zbll.length !== 472) throw new Error(`Expected 472 ZBLL cases, found ${zbll.length}`);
  if (zblsGroups.length !== 42) throw new Error(`Expected 42 F2L cases, found ${zblsGroups.length}`);
  if (zbls.length !== 302) throw new Error(`Expected 302 ZBLS cases, found ${zbls.length}`);
  if (new Set(zbls.map((record) => record.f2l)).size !== 41 || zblsGroups.filter((record) => record.solved).length !== 1) {
    throw new Error("Expected 41 unsolved F2L groups in the 302-case ZBLS set");
  }
  const kindCounts = Object.fromEntries(
    ["top", "edge-in-slot", "corner-in-slot", "both-in-slot"].map((kind) => [
      kind,
      zblsGroups.filter((record) => record.kind === kind).length,
    ]),
  );
  if (JSON.stringify(kindCounts) !== JSON.stringify({ top: 24, "edge-in-slot": 6, "corner-in-slot": 6, "both-in-slot": 6 })) {
    throw new Error(`Unexpected F2L distribution: ${JSON.stringify(kindCounts)}`);
  }
  const slotCounts = zblsGroups
    .filter((record) => record.kind === "both-in-slot")
    .map((record) => record.caseCount)
    .sort((left, right) => left - right);
  if (slotCounts.join(",") !== "0,2,2,2,4,4") {
    throw new Error(`Unexpected in-slot EO distribution: ${slotCounts.join(",")}`);
  }
  validateUnique(coll, "state", "COLL");
  validateUnique(zbll, "state", "ZBLL");
  validateUnique(zblsGroups, "state", "F2L");
  validateUnique(zbls, "state", "ZBLS");
  validateUnique(coll, "id", "COLL");
  validateUnique(zbll, "id", "ZBLL");
  validateUnique(zbls, "id", "ZBLS");

  const collByName = new Map(coll.map((record) => [record.name, record]));
  for (const record of zbll) {
    const collCase = collByName.get(record.coll);
    if (!collCase) throw new Error(`${record.name} references missing COLL ${record.coll}`);
    if (makeCollPattern(record.state) !== collCase.state) {
      throw new Error(`${record.name} does not match COLL subgroup ${record.coll}`);
    }
  }

  for (const record of zbls) {
    const colorCounts = Object.fromEntries(
      ["U", "R", "F", "D", "L", "B"].map((color) => [color, [...record.fullState].filter((value) => value === color).length]),
    );
    if (Object.values(colorCounts).some((count) => count !== 9)) {
      throw new Error(`${record.name} has invalid color counts: ${JSON.stringify(colorCounts)}`);
    }
    if (!patternMatchesState(record.f2lState, record.fullState) || !patternMatchesState(record.state, record.fullState)) {
      throw new Error(`${record.name} does not match its generated full state`);
    }
  }
}

async function main() {
  const [collHtml, ...zbllHtml] = await Promise.all([
    fetchText(`${SPEEDCUBEDB_BASE}/COLL`),
    ...FAMILY_ORDER.map((family) => fetchText(`${SPEEDCUBEDB_BASE}/ZBLL${family}`)),
  ]);

  const coll = makeCollRecords(parseSpeedCubeDbPage(collHtml, "COLL"));
  const rawZbll = FAMILY_ORDER.flatMap((family, index) => (
    makeZbllRecords(parseSpeedCubeDbPage(zbllHtml[index], `ZBLL ${family}`), family)
  ));
  const zbll = alignZbllRecordsToColl(rawZbll, coll);
  const { groups: zblsGroups, cases: zbls } = makeZblsData();
  validateRelationships(coll, zbll, zblsGroups, zbls);

  const output = [
    "// Generated by scripts/generate-preset-data.mjs. Do not edit by hand.",
    `export const PRESET_DATA_SOURCES = ${JSON.stringify({
      collZbll: SPEEDCUBEDB_BASE,
      zbls: { method: "complete cubie-coordinate enumeration", reference: ZBLS_REFERENCE },
    }, null, 2)};`,
    `export const COLL_PRESET_DATA = ${JSON.stringify(coll, null, 2)};`,
    `export const ZBLL_PRESET_DATA = ${JSON.stringify(zbll, null, 2)};`,
    `export const ZBLS_F2L_PRESET_DATA = ${JSON.stringify(zblsGroups, null, 2)};`,
    `export const ZBLS_PRESET_DATA = ${JSON.stringify(zbls, null, 2)};`,
  ].join("\n\n") + "\n";

  await mkdir(fileURLToPath(new URL("../src", import.meta.url)), { recursive: true });
  await writeFile(OUTPUT_PATH, output, "utf8");
  console.log(JSON.stringify({
    coll: coll.length,
    zbll: zbll.length,
    zbls: zbls.length,
    f2lGroups: zblsGroups.length,
    sourceWarnings,
    output: OUTPUT_PATH,
  }, null, 2));
}

await main();
