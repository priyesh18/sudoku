// Pure sudoku logic, no DOM. A board is 81 numbers (0 = empty); candidates are 9-bit masks (bit d = digit d).
const R = (i) => (i / 9) | 0, C = (i) => i % 9, B = (i) => ((i / 27) | 0) * 3 + (((i % 9) / 3) | 0);
const range = (n) => [...Array(n).keys()];
// Units 0-8 are rows, 9-17 columns, 18-26 boxes.
export const UNITS = [
  ...range(9).map((r) => range(9).map((c) => r * 9 + c)),
  ...range(9).map((c) => range(9).map((r) => r * 9 + c)),
  ...range(9).map((b) => range(9).map((k) => (((b / 3) | 0) * 3 + ((k / 3) | 0)) * 9 + (b % 3) * 3 + (k % 3))),
];
export const PEERS = range(81).map((i) => range(81).filter((j) => j !== i && (R(j) === R(i) || C(j) === C(i) || B(j) === B(i))));
export const LEVELS = ["Easy", "Medium", "Hard", "Expert"];

const ALL = 0x3fe;
const bit = (d) => 1 << d;
const count = (m) => { let n = 0; for (; m; n++) m &= m - 1; return n; };
const digitsOf = (m) => range(10).filter((d) => d && m & bit(d));
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const list = (a) => (a.length < 2 ? `${a[0]}` : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`);
export const cellName = (i) => `R${R(i) + 1}C${C(i) + 1}`;
export const unitName = (u) => (u < 9 ? `row ${u + 1}` : u < 18 ? `column ${u - 8}` : `box ${u - 17}`);

const seen = (v, i) => PEERS[i].reduce((m, p) => m | bit(v[p]), 0) & ALL;
export const candidates = (v) => v.map((d, i) => (d ? 0 : ALL & ~seen(v, i)));

// Backtracking, always branching on the cell with the fewest candidates.
function search(v, limit, random) {
  let n = 0, sol = null;
  const rec = () => {
    let best = -1, bm = 0, bn = 10;
    for (let i = 0; i < 81 && bn > 1; i++) {
      if (v[i]) continue;
      const m = ALL & ~seen(v, i), k = count(m);
      if (k < bn) { best = i; bm = m; bn = k; }
    }
    if (best < 0) { n++; sol ??= v.slice(); return n >= limit; }
    const ds = digitsOf(bm);
    if (random) shuffle(ds);
    for (const d of ds) { v[best] = d; if (rec()) { v[best] = 0; return true; } }
    v[best] = 0;
    return false;
  };
  rec();
  return { n, sol };
}
export const countSolutions = (v, limit = 2) => search(v.slice(), limit).n;
export const solve = (v) => search(v.slice(), 1).sol;

function* combos(a, k, s = 0, acc = []) {
  if (acc.length === k) { yield acc; return; }
  for (let i = s; i < a.length; i++) yield* combos(a, k, i + 1, [...acc, a[i]]);
}

// ---- Techniques. Each returns a step {name, level, place?:[i,d] | elim:[[i,mask]], unit?, region, cells, nudge, why, habit} or undefined.

function hiddenSingle(v, c) {
  for (const u of [...range(9).map((k) => 18 + k), ...range(18)]) {
    for (let d = 1; d <= 9; d++) {
      const spots = UNITS[u].filter((i) => c[i] & bit(d));
      if (spots.length !== 1) continue;
      const i = spots[0];
      return {
        name: "Hidden single", level: 0, place: [i, d], unit: u, region: UNITS[u], cells: [i],
        nudge: `Look at ${unitName(u)}. Where can a ${d} go?`,
        why: `${d} has only one possible spot left in ${unitName(u)}: ${cellName(i)}.`,
        whyBasic: `Every other empty cell there already sees a ${d} in its row, column or box.`,
        habit: "Pick a digit and sweep a box (or a row or column): cross out every cell that already sees that digit. If only one cell survives, the digit goes there.",
      };
    }
  }
}

function nakedSingle(v, c) {
  for (let i = 0; i < 81; i++) {
    if (count(c[i]) !== 1) continue;
    const d = digitsOf(c[i])[0];
    return {
      name: "Naked single", level: 0, place: [i, d], region: [i, ...PEERS[i]], cells: [i],
      nudge: `Look closely at ${cellName(i)}. Which digits can it still take?`,
      why: `That leaves ${cellName(i)} with only one option: ${d}.`,
      whyBasic: `Its row, column and box already contain ${list(digitsOf(ALL & ~c[i]))}.`,
      habit: "For a crowded cell, list the digits its row, column and box already use. If eight are taken, the ninth is forced.",
    };
  }
}

const nakedSubset = (k) => (v, c) => {
  for (let u = 0; u < 27; u++) {
    const open = UNITS[u].filter((i) => c[i] && count(c[i]) <= k);
    for (const set of combos(open, k)) {
      const m = set.reduce((a, i) => a | c[i], 0);
      if (count(m) !== k) continue;
      const elim = UNITS[u].filter((i) => !set.includes(i) && c[i] & m).map((i) => [i, c[i] & m]);
      if (!elim.length) continue;
      const ds = digitsOf(m), word = k === 2 ? "two" : "three";
      return {
        name: k === 2 ? "Naked pair" : "Naked triple", level: k === 2 ? 1 : 2, elim, region: UNITS[u], cells: set,
        nudge: `Look at ${unitName(u)}. ${k === 2 ? "Two" : "Three"} cells there only share ${word} candidates between them.`,
        why: `${list(set.map(cellName))} can only hold ${list(ds)}. Those ${word} digits must fill those ${word} cells, so no other cell in ${unitName(u)} can be ${ds.join(" or ")}.`,
        habit: `When ${word} cells in one row, column or box use only the same ${word} candidates, those digits are spoken for. Cross them off the rest of that unit.`,
      };
    }
  }
};

function hiddenPair(v, c) {
  for (let u = 0; u < 27; u++) {
    const spots = range(10).map((d) => (d ? UNITS[u].filter((i) => c[i] & bit(d)) : []));
    for (const [d1, d2] of combos(range(10).filter((d) => spots[d].length === 2), 2)) {
      if (spots[d1].join() !== spots[d2].join()) continue;
      const m = bit(d1) | bit(d2);
      const elim = spots[d1].filter((i) => c[i] & ~m).map((i) => [i, c[i] & ~m]);
      if (!elim.length) continue;
      return {
        name: "Hidden pair", level: 2, elim, region: UNITS[u], cells: spots[d1],
        nudge: `Look at ${unitName(u)}. Two digits there have exactly the same two possible spots.`,
        why: `In ${unitName(u)}, ${d1} and ${d2} both fit only in ${list(spots[d1].map(cellName))}. Those cells must hold ${d1} and ${d2}, so any other candidates in them can go.`,
        habit: "Look for two digits that can only go in the same two cells of a unit. That pair owns those cells, so anything else pencilled there is out.",
      };
    }
  }
}

// Box -> line ("pointing") and line -> box ("claiming") are the same idea from opposite sides.
const intersection = (pointing) => (v, c) => {
  for (const u of pointing ? range(9).map((k) => 18 + k) : range(18)) {
    for (let d = 1; d <= 9; d++) {
      const spots = UNITS[u].filter((i) => c[i] & bit(d));
      if (spots.length < 2) continue;
      const others = pointing
        ? [R, C].map((f, t) => spots.every((i) => f(i) === f(spots[0])) && t * 9 + f(spots[0])).filter((x) => x !== false)
        : spots.every((i) => B(i) === B(spots[0])) ? [18 + B(spots[0])] : [];
      for (const o of others) {
        const elim = UNITS[o].filter((i) => !UNITS[u].includes(i) && c[i] & bit(d)).map((i) => [i, bit(d)]);
        if (!elim.length) continue;
        return pointing
          ? {
              name: "Pointing", level: 1, elim, region: UNITS[u], cells: spots,
              nudge: `Look at ${unitName(u)}. Where can its ${d} go?`,
              why: `In ${unitName(u)}, every possible spot for ${d} is in ${unitName(o)}. The box's ${d} must sit on that line, so remove ${d} from the rest of ${unitName(o)}.`,
              habit: "If a digit's options inside a box all line up in one row or column, that digit is claimed. No other cell on that line, outside the box, can take it.",
            }
          : {
              name: "Box/line reduction", level: 2, elim, region: UNITS[u], cells: spots,
              nudge: `Look at ${unitName(u)}. Where can its ${d} go?`,
              why: `In ${unitName(u)}, ${d} can only go in cells inside ${unitName(o)}. So that box's ${d} must be on this line, and you can remove ${d} from the box's other cells.`,
              habit: "Check each row and column: if a digit's options all fall inside one box, the rest of that box can't have it.",
            };
      }
    }
  }
};

function xWing(v, c) {
  for (const [base, cross] of [[0, 9], [9, 0]]) {
    const at = base === 0 ? C : R;
    for (let d = 1; d <= 9; d++) {
      const lines = range(9).map((k) => UNITS[base + k].filter((i) => c[i] & bit(d)));
      for (const [a, b] of combos(range(9).filter((k) => lines[k].length === 2), 2)) {
        const xs = lines[a].map(at);
        if (xs.join() !== lines[b].map(at).join()) continue;
        const cells = [...lines[a], ...lines[b]];
        const elim = xs.flatMap((x) => UNITS[cross + x]).filter((i) => !cells.includes(i) && c[i] & bit(d)).map((i) => [i, bit(d)]);
        if (!elim.length) continue;
        const crossWord = cross === 9 ? "columns" : "rows";
        return {
          name: "X-wing", level: 3, elim, region: [...UNITS[base + a], ...UNITS[base + b]], cells,
          nudge: `Look at where ${d} can go in ${unitName(base + a)} and ${unitName(base + b)}.`,
          why: `In ${unitName(base + a)} and ${unitName(base + b)}, ${d} can only go in ${unitName(cross + xs[0])} or ${unitName(cross + xs[1])}. Either way, those two ${crossWord} get their ${d} from these four corners, so remove ${d} from the rest of them.`,
          habit: `Find a digit with exactly two spots in each of two lines, where the spots line up. The four corners form an X that locks the digit into those cross lines.`,
        };
      }
    }
  }
}

const TECHNIQUES = [hiddenSingle, nakedSingle, nakedSubset(2), intersection(true), intersection(false), hiddenPair, nakedSubset(3), xWing];
const logicStep = (v, c) => { for (const t of TECHNIQUES) { const s = t(v, c); if (s) return s; } };

function apply(s, v, c) {
  if (s.place) {
    const [i, d] = s.place;
    v[i] = d; c[i] = 0;
    for (const p of PEERS[i]) c[p] &= ~bit(d);
  } else for (const [i, m] of s.elim) c[i] &= ~m;
}

// Solve with techniques only; returns the steps taken and whether it finished.
export function logicSolve(puzzle) {
  const v = puzzle.slice(), c = candidates(v), steps = [];
  for (let s; v.includes(0) && (s = logicStep(v, c)); ) { steps.push(s); apply(s, v, c); }
  return { steps, solved: !v.includes(0) };
}

// 0 Easy … 3 Expert. Anything our techniques can't finish counts as Expert.
export function grade(puzzle) {
  const { steps, solved } = logicSolve(puzzle);
  return solved ? Math.max(0, ...steps.map((s) => s.level)) : 3;
}

const MIN_CLUES = [36, 30, 0, 0];
export function generate(level, deadline = Infinity) {
  while (Date.now() < deadline) {
    const solution = search(Array(81).fill(0), 1, true).sol;
    const p = solution.slice();
    let clues = 81;
    for (const i of shuffle(range(41))) {
      if (clues <= MIN_CLUES[level]) break;
      const j = 80 - i, keep = [p[i], p[j]];
      p[i] = p[j] = 0;
      if (countSolutions(p) !== 1 || grade(p) > level) [p[i], p[j]] = keep;
      else clues -= i === j ? 1 : 2;
    }
    if (grade(p) === level) return { puzzle: p, solution };
  }
  return null;
}

// The next move for a player, explained. Elimination steps that lead to the placement are folded into one hint.
export function nextHint(values, solution) {
  const v = values.slice(), c = candidates(v), pre = [];
  for (let s; (s = logicStep(v, c)); apply(s, v, c)) {
    if (!s.place) { pre.push(s); continue; }
    const [i, d] = s.place;
    const used = pre.filter((p) => p.elim.some(([j, m]) => (s.unit == null ? j === i : UNITS[s.unit].includes(j) && m & bit(d))));
    const lead = used[0] ?? s;
    return {
      technique: [...new Set([...used.map((p) => p.name), s.name])].join(" → "),
      cell: i, value: d, region: lead.region,
      focus: [...new Set([...used.flatMap((p) => p.cells), i])],
      nudge: lead.nudge,
      why: [...used.map((p) => p.why), used.length ? s.why : `${s.why} ${s.whyBasic}`].join(" "),
      habit: (used.at(-1) ?? s).habit,
    };
  }
  const c0 = candidates(values);
  const i = range(81).filter((k) => !values[k]).sort((a, b) => count(c0[a]) - count(c0[b]))[0];
  return {
    technique: "Reveal", cell: i, value: solution[i], region: [i], focus: [i],
    nudge: `This position needs a technique beyond the hint toolkit. Start with ${cellName(i)}, which has the fewest options.`,
    why: `${cellName(i)} is ${solution[i]}. No simple pattern proves it from here, so take this one as a gift.`,
    habit: "When you're stuck, look first at the cells with the fewest candidates. That's where advanced patterns tend to show up.",
  };
}
