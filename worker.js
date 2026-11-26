import { generate } from "./sudoku.js";
// Generation can take a few hundred ms on a phone; doing it here keeps the UI responsive.
onmessage = (e) => postMessage(generate(e.data));
