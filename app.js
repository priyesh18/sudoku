import { PEERS, UNITS, LEVELS, cellName, nextHint } from "./sudoku.js";

const $ = (id) => document.getElementById(id);
const LIVES = { normal: 3, hardcore: 5 };
const COLORS = ["#22c55e", "#3b82f6", "#f97316", "#d946ef"];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const store = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

let S = store.get("sudoku-game"); // the whole game; saved on every change
let sel = -1, focusDigit = 0, notesMode = false, flash = null, popped = -1, shine = [];
let chosenMode = S?.mode ?? "normal";
const save = () => S && store.set("sudoku-game", S);
const commit = () => { save(); render(); };

const fresh = (level, mode, puzzle, solution) => ({
  level, mode, puzzle, solution, values: puzzle.slice(), notes: Array(81).fill(0),
  lives: LIVES[mode], elapsed: 0, undo: [], status: "playing", hint: null,
});

// ---- build the board and keypad once
const cells = Array.from({ length: 81 }, (_, i) => {
  const b = document.createElement("button");
  b.className = "cell"; b.dataset.r = (i / 9) | 0; b.dataset.c = i % 9;
  b.onclick = () => { sel = i; focusDigit = 0; render(); };
  $("grid").append(b);
  return b;
});
const keys = Array.from({ length: 9 }, (_, k) => {
  const b = document.createElement("button");
  b.onclick = () => input(k + 1);
  $("pad").append(b);
  return b;
});

// ---- moves
const snapshot = () => { S.undo.push({ values: S.values.slice(), notes: S.notes.slice() }); if (S.undo.length > 300) S.undo.shift(); };
const playing = () => S?.status === "playing";

function input(d) {
  if (!playing()) return;
  // No empty cell selected: the keypad just highlights every copy of that digit.
  if (sel < 0 || S.values[sel]) { sel = -1; focusDigit = d; return render(); }
  if (notesMode) { snapshot(); S.notes[sel] ^= 1 << d; return commit(); }
  if (S.solution[sel] !== d) {
    S.lives--;
    flash = { i: sel, d };
    setTimeout(() => { flash = null; render(); }, 700);
    if (S.lives <= 0) end("lost");
    return commit();
  }
  snapshot();
  place(sel, d);
  commit();
}

function place(i, d) {
  S.values[i] = d; S.notes[i] = 0;
  for (const p of PEERS[i]) S.notes[p] &= ~(1 << d);
  S.hint = null;
  popped = i;
  shine = UNITS.filter((u) => u.includes(i) && u.every((k) => S.values[k])).flat();
  if (S.values.every((v, k) => v === S.solution[k])) end("won");
}

function erase() {
  if (!playing() || sel < 0 || S.values[sel] || !S.notes[sel]) return;
  snapshot(); S.notes[sel] = 0; commit();
}

function undo() {
  if (!playing() || !S.undo.length) return;
  Object.assign(S, S.undo.pop(), { hint: null }); // lives are never refunded
  commit();
}

// ---- hints: nudge → technique → reasoning → place
function hint() {
  if (!playing()) return;
  if (S.hint) return hintMore();
  if (S.mode === "hardcore") { if (S.lives <= 1) return; S.lives--; }
  S.hint = { ...nextHint(S.values, S.solution), step: 0 };
  commit();
}
const hintMore = () => { S.hint.step = Math.min(2, S.hint.step + 1); commit(); };
function hintApply() {
  const { cell, value } = S.hint;
  snapshot(); sel = cell; place(cell, value); commit();
}

// ---- game end
function end(status) {
  S.status = status; S.hint = null;
  const key = `${S.level}-${S.mode}`, best = store.get("sudoku-best") ?? {};
  const won = status === "won", record = won && !(best[key] <= S.elapsed);
  if (record) { best[key] = S.elapsed; store.set("sudoku-best", best); }
  $("endTitle").textContent = won ? "Solved! 🎉" : "Out of lives";
  $("endText").textContent = won
    ? `${LEVELS[S.level]} · ${S.mode === "hardcore" ? "Hardcore" : "Normal"} in ${fmt(S.elapsed)}. ${record ? "New best time!" : `Best: ${fmt(best[key])}`}`
    : "That puzzle got you. Try it again from the start, or pick a new one.";
  $("retryBtn").hidden = won;
  save();
  $("endDlg").showModal();
  if (won) confetti();
}

function confetti() {
  if (reduceMotion.matches) return;
  for (let k = 0; k < 90; k++) {
    const p = document.createElement("i");
    p.className = "confetti";
    p.style.cssText = `left:${Math.random() * 100}vw;background:hsl(${Math.random() * 360} 90% 60%);animation-delay:${Math.random() * 0.5}s;--x:${(Math.random() - 0.5) * 40}vw;--r:${Math.random() * 900}deg`;
    $("endDlg").append(p); // inside the dialog so it draws above the modal's top layer
    setTimeout(() => p.remove(), 3200);
  }
}

// ---- new game
const worker = new Worker("worker.js", { type: "module" });
function openNew() {
  const best = store.get("sudoku-best") ?? {};
  for (const b of $("modes").children) b.setAttribute("aria-pressed", b.dataset.mode === chosenMode);
  $("levels").replaceChildren(...LEVELS.map((name, level) => {
    const b = document.createElement("button");
    b.className = "opt lvl"; b.style.background = COLORS[level];
    const t = best[`${level}-${chosenMode}`];
    b.innerHTML = `${name} <small>${t ? `Best ${fmt(t)}` : ""}</small>`;
    b.onclick = () => start(level);
    return b;
  }));
  $("status").textContent = "";
  $("newCancel").hidden = !playing();
  if (!$("newDlg").open) $("newDlg").showModal();
}
function start(level) {
  $("status").textContent = "Making a puzzle…";
  for (const b of $("levels").children) b.disabled = true;
  worker.onmessage = ({ data }) => {
    S = fresh(level, chosenMode, data.puzzle, data.solution);
    sel = -1;
    $("newDlg").close();
    commit();
  };
  worker.postMessage(level);
}
for (const b of $("modes").children) b.onclick = () => { chosenMode = b.dataset.mode; openNew(); };
$("newDlg").addEventListener("cancel", (e) => { if (!playing()) e.preventDefault(); }); // no game to go back to
$("newCancel").onclick = () => $("newDlg").close();
$("newBtn").onclick = openNew;
$("retryBtn").onclick = () => { S = fresh(S.level, S.mode, S.puzzle, S.solution); sel = -1; $("endDlg").close(); commit(); };
$("againBtn").onclick = () => { $("endDlg").close(); openNew(); };
$("endDlg").addEventListener("cancel", (e) => e.preventDefault());

// ---- render
function render() {
  if (!S) return;
  document.body.dataset.level = S.level;
  $("levelName").textContent = LEVELS[S.level];
  $("modeTag").hidden = S.mode !== "hardcore";
  $("timer").textContent = fmt(S.elapsed);
  $("lives").textContent = "♥".repeat(Math.max(0, S.lives)) + "♡".repeat(LIVES[S.mode] - Math.max(0, S.lives));
  $("lives").setAttribute("aria-label", `${S.lives} lives left`);

  const h = S.hint, region = new Set(h?.region), focus = new Set(h?.step >= 2 ? h.focus : []);
  const selVal = sel >= 0 ? S.values[sel] : focusDigit;
  cells.forEach((el, i) => {
    const v = S.values[i], bad = flash?.i === i;
    el.className = "cell" +
      (S.puzzle[i] ? " given" : "") +
      (sel >= 0 && PEERS[sel].includes(i) ? " peer" : "") +
      (region.has(i) ? " region" : "") +
      (selVal && v === selVal ? " same" : "") +
      (focus.has(i) ? " focus" : "") +
      (h?.step >= 2 && i === h.cell ? " target" : "") +
      (i === sel ? " selected" : "") +
      (bad ? " bad" : "");
    if (bad || v) el.textContent = bad ? flash.d : v;
    else el.innerHTML = S.notes[i] ? `<span class="notes">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<i>${S.notes[i] & (1 << d) ? d : ""}</i>`).join("")}</span>` : "";
    const notes = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => S.notes[i] & (1 << d));
    el.setAttribute("aria-label", `${cellName(i)}, ${v || (notes.length ? `notes ${notes.join(" ")}` : "empty")}`);
  });
  if (popped >= 0) cells[popped].classList.add("pop");
  shine.forEach((i, k) => { cells[i].classList.add("shine"); cells[i].style.setProperty("--d", `${(k % 9) * 40}ms`); });
  popped = -1; shine = [];

  keys.forEach((b, k) => {
    const left = 9 - S.values.filter((v) => v === k + 1).length;
    b.innerHTML = `${k + 1}<small>${left || ""}</small>`;
    b.disabled = !left || !playing();
    b.setAttribute("aria-label", `${k + 1}, ${left} left`);
  });
  document.body.classList.toggle("notes-on", notesMode);
  $("notesBtn").setAttribute("aria-pressed", notesMode);
  $("undoBtn").disabled = !playing() || !S.undo.length;
  $("hintBtn").innerHTML = S.mode === "hardcore" && !h ? "💡 Hint<small>costs 1 ♥</small>" : "💡 Hint";
  $("hintBtn").disabled = !playing() || (S.mode === "hardcore" && !h && S.lives <= 1);

  $("hint").hidden = !h;
  if (h) {
    $("hintTitle").textContent = h.step === 0 ? "Hint" : h.technique;
    $("hintText").textContent = h.step < 2 ? h.nudge : h.why;
    $("hintHabit").textContent = h.step < 2 ? "" : `Next time: ${h.habit}`;
    $("hintHabit").hidden = h.step < 2;
    $("hintMore").hidden = h.step >= 2;
    $("hintMore").textContent = h.step === 0 ? "Which technique?" : "Show me why";
    $("hintApply").hidden = h.step < 2;
    $("hintApply").textContent = `Place ${h.value} in ${cellName(h.cell)}`;
  }
}

// ---- wiring
$("undoBtn").onclick = undo;
$("eraseBtn").onclick = erase;
$("notesBtn").onclick = () => { notesMode = !notesMode; render(); };
$("hintBtn").onclick = hint;
$("hintMore").onclick = hintMore;
$("hintApply").onclick = hintApply;
$("hintClose").onclick = () => { S.hint = null; commit(); };

addEventListener("keydown", (e) => {
  if (document.querySelector("dialog[open]")) return;
  if (/^[1-9]$/.test(e.key)) input(+e.key);
  else if (["Backspace", "Delete", "0"].includes(e.key)) erase();
  else if (e.key === "n") $("notesBtn").click();
  else if (e.key === "z" && (e.metaKey || e.ctrlKey)) undo();
  else if (e.key.startsWith("Arrow")) {
    const r = sel < 0 ? 0 : (sel / 9) | 0, c = sel < 0 ? 0 : sel % 9;
    const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    sel = ((r + dr + 9) % 9) * 9 + ((c + dc + 9) % 9);
    e.preventDefault(); render();
  }
});

// Timer only runs while the game is visible and no dialog is up.
setInterval(() => {
  if (!playing() || document.hidden || document.querySelector("dialog[open]")) return;
  S.elapsed += 1000;
  $("timer").textContent = fmt(S.elapsed);
}, 1000);
addEventListener("visibilitychange", save);
addEventListener("pagehide", save);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

render();
if (!S) openNew();
else if (S.status !== "playing") end(S.status);
