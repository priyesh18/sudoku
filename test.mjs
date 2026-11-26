// Self-check for sudoku.js: `node test.mjs`
import assert from "node:assert/strict";
import { generate, grade, countSolutions, logicSolve, nextHint, solve, LEVELS } from "./sudoku.js";

const seen = {};
for (let level = 0; level < 4; level++) {
  const t = Date.now();
  for (let n = 0; n < 10; n++) {
    const { puzzle, solution } = generate(level);
    assert.equal(countSolutions(puzzle), 1, "unique solution");
    assert.equal(grade(puzzle), level, "grades at requested level");
    assert.deepEqual(solve(puzzle), solution);

    // Every technique step must agree with the real solution: placements correct, never eliminates the true digit.
    for (const s of logicSolve(puzzle).steps) {
      seen[s.name] = (seen[s.name] ?? 0) + 1;
      if (s.place) assert.equal(solution[s.place[0]], s.place[1], `${s.name} placed wrong digit`);
      else for (const [i, m] of s.elim) assert.ok(!(m & (1 << solution[i])), `${s.name} eliminated the answer`);
    }

    // Following hints alone must solve the puzzle, each hint correct.
    const v = puzzle.slice();
    while (v.includes(0)) {
      const h = nextHint(v, solution);
      assert.equal(h.value, solution[h.cell], `hint ${h.technique} wrong`);
      assert.ok(h.nudge && h.why && h.habit && h.region.length && h.focus.includes(h.cell));
      v[h.cell] = h.value;
    }
  }
  console.log(`${LEVELS[level]}: 10 puzzles ok, ${((Date.now() - t) / 10).toFixed(0)}ms avg`);
}
console.log("techniques used:", seen);
for (const name of ["Hidden single", "Naked single", "Naked pair", "Pointing"]) assert.ok(seen[name], `${name} never exercised`);
console.log("all checks passed");
