# CLAUDE.md — TailMate Project Guide

This file gives Claude Code the full context needed to work on TailMate effectively.
Read it completely before making any changes.

---

## Project Overview

**TailMate** is a single-page homemade dog food calculator. Users configure their
dogs' profiles (weight, life stage, etc.), select ingredients across five macro
categories (proteins, fats/oils, carbohydrates, vegetables, fruits, extras/enticers), and
receive a complete batch plan: shopping weights, prepped batch weights, per-pet
per-meal portions, and a BalanceIT supplement callout.

- **Live URL:** GitHub Pages (see repo settings)
- **Entry point:** `index.html` loads `src/app.js` as an ES module
- **No build step, no framework** — vanilla HTML/CSS/JS with native ES modules
- **External resources:** Google Fonts (Lora + Nunito) CDN, Firebase SDK (compat)

---

## File Structure

```
/
├── index.html          ← HTML + CSS only (no inline JS)
├── src/
│   ├── app.js          ← Entry point: init, window.* globals, auth listener
│   ├── db.js           ← Ingredient database (DB, LIFE_STAGE constants)
│   ├── state.js        ← Application state, helpers, saveState wrapper
│   ├── storage.js      ← StorageAdapter (async, dual-write localStorage + Firestore)
│   ├── auth.js         ← Firebase Auth (Google sign-in), renderAuth
│   ├── themes.js       ← 11 color themes, applyTheme, renderThemePicker
│   └── ui.js           ← All rendering + event handlers (~500 lines)
├── CLAUDE.md           ← This file
├── README.md
├── LICENSE
└── .gitignore
```

### Module Dependency Graph (DAG, no cycles)

```
db.js ←── state.js ←── ui.js ←── app.js
              ↑           ↑         ↑
storage.js ───┘           │         │
              ↑           │         │
auth.js ──────┴───────────┘         │
themes.js (imports storage.js) ─────┘
```

### onclick Handlers

Since ES module exports are not globals, all functions referenced by `onclick`
attributes in HTML templates are registered on `window.*` in `app.js`. There are
18 such registrations. When adding new onclick-callable functions, add a
`window.functionName = functionName` line in `app.js`.

---

## Architecture: StorageAdapter Pattern

**This is the most important architectural rule in the project.**

All storage I/O — reading and writing state, recipes, and user preferences —
MUST go through the `StorageAdapter` module in `src/storage.js`. Nothing in the
app calls `localStorage` directly except inside `StorageAdapter` (and theme
storage in `themes.js`, which is separate by design).

```javascript
// src/storage.js
export const StorageAdapter = {
  provider: 'local', // 'local' | 'firestore'
  async loadState()           { ... }
  async saveState(s)          { ... }
  async loadRecipes()         { ... }
  async saveRecipe(r)         { ... }
  async deleteRecipe(id)      { ... }
  async syncRecipes(uid)      { ... }   // last-write-wins merge
};
```

**All methods are async** and return Promises, regardless of provider. Callers
use `await` for reads (loadState, loadRecipes) and fire-and-forget for writes
(saveState is called from the synchronous `saveState()` wrapper in `state.js`
without awaiting — the localStorage write is synchronous and happens first).

### Dual-Write Strategy

When `provider === 'firestore'`:
- **Writes** go to BOTH localStorage (sync, instant) AND Firestore (async)
- **Reads** try Firestore first, fall back to localStorage on error
- Every Firestore call is wrapped in try/catch — failures log warnings, never crash

When `provider === 'local'`:
- Behavior is identical to pure localStorage, just wrapped in async

---

## Architecture: Auth Module

The `Auth` module in `src/auth.js` handles Google sign-in via Firebase.

```javascript
export const Auth = {
  user: null,
  isLoggedIn()    { return !!this.user; },
  async signIn()  { /* Firebase popup, sync recipes, reload state */ },
  async signOut() { /* Firebase sign-out, revert to local */ },
};
```

- `signIn()` uses `signInWithPopup` with `GoogleAuthProvider`
- On sign-in: sets `StorageAdapter.provider = 'firestore'`, runs `syncRecipes()`,
  reloads state from Firestore, refreshes UI
- On sign-out: reverts to `'local'` provider; data remains in localStorage
- `onAuthStateChanged` listener in `app.js` handles page refresh (session persistence)

### Circular Dependency Resolution

`auth.js` needs `applyStateToUI` from `ui.js`, but `ui.js` imports from
`state.js` which imports from `storage.js` — creating a potential cycle.
This is resolved with a setter: `auth.js` exports `setApplyStateToUI(fn)`,
and `app.js` wires it up after importing both modules.

---

## Recipe Sync (Last-Write-Wins)

Recipes have a UUID (`crypto.randomUUID()`) and `updatedAt` timestamp.
On sign-in, `StorageAdapter.syncRecipes(uid)` merges local and remote recipes:

1. Load local recipes from localStorage
2. Load remote recipes from Firestore
3. For each unique ID:
   - Only local → upload to Firestore
   - Only remote → download to localStorage
   - Both → keep the one with newer `updatedAt`
4. Write merged set to both stores

This lets users sign out, create recipes offline, sign back in, and have
everything sync properly.

---

## Firebase Configuration

Firebase SDK scripts (compat, v10.14.1) are loaded in `<head>` of `index.html`.
The config block uses placeholder values — replace with real Firebase project values:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### Firestore Data Structure

```
/users/{uid}/
  state          ← full app state object
  theme          ← theme ID string
  recipes/
    {recipeId}   ← individual recipe documents (UUID + updatedAt)
```

### Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## Theme System

TailMate has 11 color themes selectable via dot swatches in the header.
Defined in `src/themes.js`.

**Default theme:** `stormy-morning`

**Note:** Chili Spice (`chili-spice`) uses approximated hex values.
The exact values are at figma.com/color-palettes/chili-spice/ — update when confirmed.

CSS variables controlled per-theme:
`--bg`, `--panel-alt`, `--border`, `--accent`, `--accent2`, `--amber`, `--text`, `--muted`, `--sh`

Fixed (not theme-controlled):
`--panel` (#fff), `--ok` (green), `--danger` (red), `--warn-bg`, `--warn-bdr`

Theme storage: saved to localStorage always (instant), and to Firestore when
signed in (fire-and-forget). Loaded from Firestore first when signed in.

---

## Application State

Defined in `src/state.js`:

```javascript
export let state = {
  pets: [
    { id, name, breed, status, age, weight, wunit }
  ],
  batchDays: 7,
  mealsPerDay: 2,
  macros: { p: 45, fa: 15, c: 20, v: 15, f: 5 },   // must sum to 100
  sel: {
    proteins:   { [id]: { pct, prep } },
    fats:       { [id]: { pct, prep } },
    carbs:      { [id]: { pct, prep } },
    vegetables: { [id]: { pct, prep } },
    fruits:     { [id]: { pct, prep } },
    extras:     { [id]: true }
  },
  actualBatchWeight: null
};
```

State is saved on every change via `saveState()` (wrapper in `state.js`).

**State reassignment:** Use `replaceState(newState)` from `state.js` to fully
replace the state object. Direct reassignment (`state = x`) only works within
`state.js` due to ES module live binding rules.

---

## Ingredient Database

`DB` is exported from `src/db.js` containing six arrays:
`proteins`, `fats`, `carbs`, `vegetables`, `fruits`, `extras`.

Fats/oils are a full macro category with `kcalPerG` and `r` values like other
macros. Extras (treats & enticers) remain fixed daily amounts per dog and do
not participate in the macro percentage calculation.

**Do not reorder or renumber ingredient IDs** — saved recipes reference them
by ID. If adding new ingredients, append to the end of each array with the
next sequential ID.

---

## Calorie Calculation

```
RER = 70 × (weightKg ^ 0.75)
MER = RER × lifeStage.factor
```

Life stage factors are in the `LIFE_STAGE` constant (`src/db.js`). Key values:
- Spayed/Neutered: 1.6
- Intact adult: 1.8
- Late pregnancy: 3.0
- Lactating: 4.8

---

## Key Conventions

- **No external JS libraries** — vanilla JS only unless explicitly approved
- **All storage through StorageAdapter** — never call localStorage directly
  (except theme storage in `themes.js`)
- **All StorageAdapter methods are async** — callers await reads, fire-and-forget writes
- **Weights in grams internally** — convert for display using `fmtWeight(g)`
- **Volumes in mL internally** — convert for display using `fmtVol(mL)`
- **All panels are collapsible** via `togglePanel(hdr)` — Pets and Batch
  Settings open by default, all others closed
- **Ingredient IDs are stable** — never change existing IDs, only append new ones
- **New onclick-callable functions** must be registered on `window.*` in `app.js`
- **ES modules** — use `import`/`export`, no CommonJS, no bundler

---

## Known Issues / TODO

- [ ] Chili Spice theme: confirm exact hex codes from Figma
- [ ] Replace Firebase config placeholders with real project values
- [ ] URL-based recipe sharing (encode state as compressed URL param)
- [x] Firebase Firestore integration (dual-write + sync)
- [x] Modularize into ES modules
- [x] Add fats/oils as a proper macro category (moved from extras)
