// ── STATE + HELPERS ──────────────────────────────────────────
import { LIFE_STAGE } from './db.js';
import { StorageAdapter } from './storage.js';

// ── STATE ─────────────────────────────────────────────────────
export let state = {
  pets: [],
  batchDays: 7,
  mealsPerDay: 2,
  macros: {p:45, fa:15, c:20, v:15, f:5},
  sel: {
    proteins:    {},  // {[id]: {pct:number, prep:string}}
    fats:        {},
    carbs:       {},
    vegetables:  {},
    fruits:      {},
    extras:      {}   // {[id]: true}
  },
  actualBatchWeight: null
};

// Reassignment helper — ES module live bindings can only be
// reassigned within the declaring module.
export function replaceState(newState) {
  state = newState;
}

let petIdCounter = 1;
export function nextPetId() { return petIdCounter++; }
export function setPetIdCounter(n) { petIdCounter = n; }

// ── HELPERS ───────────────────────────────────────────────────
export const $ = id => document.getElementById(id);

export function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function calcMER(weightKg, status) {
  const RER = 70 * Math.pow(weightKg, 0.75);
  const ls = LIFE_STAGE[status] || {factor:1.6};
  return Math.round(RER * ls.factor);
}

export function toKg(w, unit) { return unit === 'kg' ? +w : +w / 2.20462; }

export function fmtWeight(g) {
  if (!g || isNaN(g)) return '—';
  if (g >= 1000) {
    const kg = (g/1000).toFixed(2);
    const lb = (g/453.592).toFixed(2);
    return `${kg} kg (${lb} lb)`;
  }
  const oz = (g/28.3495).toFixed(1);
  return `${Math.round(g)} g (${oz} oz)`;
}

export function fmtVol(mL) {
  if (!mL || isNaN(mL)) return '—';
  if (mL >= 240) { const c = (mL/236.588).toFixed(1); return `${Math.round(mL)} mL (${c} cups)`; }
  if (mL >= 15)  { const t = (mL/14.787).toFixed(1);  return `${Math.round(mL)} mL (${t} tbsp)`; }
  const t = (mL/4.92892).toFixed(2); return `${mL.toFixed(1)} mL (${t} tsp)`;
}

export function fmtAmt(amt, unit) {
  return unit === 'mL' ? fmtVol(amt) : fmtWeight(amt);
}

export function togglePanel(hdr) {
  hdr.classList.toggle('open');
  const body = hdr.nextElementSibling;
  body.classList.toggle('hidden');
}

export function saveState() { StorageAdapter.saveState(state); }
