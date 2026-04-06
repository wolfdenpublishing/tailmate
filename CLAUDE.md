# CLAUDE.md — TailMate Project Guide

This file gives Claude Code the full context needed to work on TailMate effectively.
Read it completely before making any changes.

---

## Project Overview

**TailMate** is a single-page homemade dog food calculator. Users configure their
dogs' profiles (weight, life stage, etc.), select ingredients across five macro
categories (proteins, carbohydrates, vegetables, fruits, extras/enticers), and
receive a complete batch plan: shopping weights, prepped batch weights, per-pet
per-meal portions, and a BalanceIT supplement callout.

- **Live URL:** GitHub Pages (see repo settings)
- **Entry point:** `index.html` — the entire app is one self-contained HTML file
- **No build step, no framework, no dependencies** — vanilla HTML/CSS/JS only
- **Google Fonts** (Lora + Nunito) loaded from CDN — the only external resource

---

## File Structure

```
/
├── index.html          ← The entire application
├── CLAUDE.md           ← This file
├── README.md
├── LICENSE
└── .gitignore
```

The app is intentionally kept as a single file for simplicity and GitHub Pages
compatibility. If the project grows significantly, consider splitting into
`/src/db.js`, `/src/state.js`, etc. — but do not do this without explicit
instruction, as it would require a build step or module bundler.

---

## Architecture: StorageAdapter Pattern

**This is the most important architectural rule in the project.**

All storage I/O — reading and writing state, recipes, and user preferences —
MUST go through the `StorageAdapter` module. Nothing in the app calls
`localStorage` directly except inside `StorageAdapter`.

```javascript
const StorageAdapter = {
  provider: 'local', // 'local' | 'firestore' (when Firebase is added)
  loadState()    { ... }
  saveState(s)   { ... }
  loadRecipes()  { ... }
  saveRecipe(r)  { ... }
  deleteRecipe(id) { ... }
  migrateLocalToFirestore(uid) { ... }
};
```

Every method that needs a Firestore equivalent is marked with a comment:

```javascript
// FIRESTORE HOOK: <exact Firestore call goes here>
localStorage.setItem(KEY, JSON.stringify(data));
```

**When adding Firebase:** replace the localStorage line with the Firestore call.
Do not change any call sites elsewhere in the app — they all go through
StorageAdapter and will work automatically.

---

## Architecture: Auth Module

The `Auth` module is currently stubbed. It exposes the correct interface for
the rest of the app but does nothing real yet.

```javascript
const Auth = {
  user: null,
  isLoggedIn()  { return !!this.user; },
  async signIn() { /* FIREBASE HOOK */ },
  async signOut() { /* FIREBASE HOOK */ },
};
```

The "Sign in with Google" button in the header calls `Auth.signIn()`, which
currently shows an alert explaining the feature is coming. The `renderAuth()`
function updates the header UI based on `Auth.isLoggedIn()`.

---

## Adding Firebase Firestore (Next Major Task)

### Overview

The goal is optional Google authentication. If the user is not logged in,
the app uses localStorage exactly as it does today. If the user logs in,
data syncs to Firestore per-user. Logging out reverts to localStorage.

### Firestore Data Structure

```
/users/{uid}/
  state          ← Current working session (pets, selections, macros, etc.)
  prefs          ← User preferences (theme choice, etc.)
  recipes/
    {recipeId}   ← Each saved recipe as a document
```

### Step-by-Step Implementation Plan

**1. Create a Firebase project**
- Go to console.firebase.google.com
- Create a new project, enable Google Auth and Firestore
- Copy the Firebase config object

**2. Add Firebase SDK to index.html**
Add these script tags in `<head>` before the closing `</head>`:
```html
<script src="https://www.gstatic.com/firebasejs/10.x.x/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.x.x/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.x.x/firebase-firestore-compat.js"></script>
```

**3. Add Firebase config and initialization**
Add this just after the SDK scripts (replace with real values from Firebase console):
```javascript
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
```

**4. Implement Auth.signIn() and signOut()**
Find the `Auth` object and replace the stubs:
```javascript
async signIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
  const result = await firebase.auth().signInWithPopup(provider);
  this.user = result.user;
  StorageAdapter.provider = 'firestore';
  await StorageAdapter.migrateLocalToFirestore(this.user.uid);
  renderAuth();
  await loadAndSyncState();
},
async signOut() {
  await firebase.auth().signOut();
  this.user = null;
  StorageAdapter.provider = 'local';
  renderAuth();
},
```

Also add an auth state listener in `init()`:
```javascript
firebase.auth().onAuthStateChanged(user => {
  Auth.user = user;
  if (user) StorageAdapter.provider = 'firestore';
  renderAuth();
  renderThemePicker();
});
```

**5. Implement StorageAdapter Firestore methods**
Find each `// FIRESTORE HOOK:` comment. The line immediately below it is
the localStorage call to replace. Example:

```javascript
// FIRESTORE HOOK: return await db.collection('users').doc(Auth.uid()).get() ...
localStorage.getItem(K_STATE)
// becomes:
const snap = await db.collection('users').doc(Auth.user.uid).get();
return snap.exists ? snap.data().state : null;
```

Full replacements for each method:

**loadState:**
```javascript
const snap = await db.collection('users').doc(Auth.user.uid).get();
return snap.exists ? snap.data().state : null;
```

**saveState:**
```javascript
await db.collection('users').doc(Auth.user.uid).set({ state: s }, { merge: true });
```

**loadRecipes:**
```javascript
const snap = await db.collection('users').doc(Auth.user.uid)
  .collection('recipes').orderBy('savedAt', 'desc').get();
return snap.docs.map(d => d.data());
```

**saveRecipe:**
```javascript
await db.collection('users').doc(Auth.user.uid)
  .collection('recipes').doc(r.id).set(r);
```

**deleteRecipe:**
```javascript
await db.collection('users').doc(Auth.user.uid)
  .collection('recipes').doc(id).delete();
```

**migrateLocalToFirestore:**
```javascript
const localState = JSON.parse(localStorage.getItem('tailmate_state_v1'));
const localRecipes = JSON.parse(localStorage.getItem('tailmate_recipes_v1')) || [];
if (localState) {
  await db.collection('users').doc(uid).set({ state: localState }, { merge: true });
}
for (const r of localRecipes) {
  await db.collection('users').doc(uid).collection('recipes').doc(r.id).set(r);
}
// Optionally clear localStorage after migration
```

**6. Theme preference in Firestore**
The theme save/load also has `FIRESTORE HOOK` comments. Replace:
```javascript
// Save: await db.collection('users').doc(Auth.user.uid).set({ theme: id }, { merge: true });
// Load: const snap = await db.collection('users').doc(Auth.user.uid).get();
//        return snap.data()?.theme || DEFAULT_THEME;
```

**7. Firestore Security Rules**
In the Firebase console, set these rules:
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
This ensures each user can only access their own data.

---

## Theme System

TailMate has 11 color themes selectable via dot swatches in the header.
The active theme is applied by setting CSS custom properties on `:root`.

```javascript
const THEMES = {
  'stormy-morning': { label, swatch, vars: { '--accent', '--amber', ... } },
  // ... 10 more themes
};

function applyTheme(id) { /* sets CSS vars, saves preference */ }
function renderThemePicker() { /* renders swatch dots in header */ }
```

**Default theme:** `stormy-morning`

**Note:** Chili Spice (`chili-spice`) uses approximated hex values.
The exact values are at figma.com/color-palettes/chili-spice/ — update when confirmed.

CSS variables controlled per-theme:
`--bg`, `--panel-alt`, `--border`, `--accent`, `--accent2`, `--amber`, `--text`, `--muted`, `--sh`

Fixed (not theme-controlled):
`--panel` (#fff), `--ok` (green), `--danger` (red), `--warn-bg`, `--warn-bdr`

---

## Application State

```javascript
let state = {
  pets: [
    { id, name, breed, status, age, weight, wunit }
    // status options: see LIFE_STAGE keys
  ],
  batchDays: 7,
  mealsPerDay: 2,
  macros: { p: 50, c: 25, v: 20, f: 5 },   // must sum to 100
  sel: {
    proteins:   { [id]: { pct, prep } },
    carbs:      { [id]: { pct, prep } },
    vegetables: { [id]: { pct, prep } },
    fruits:     { [id]: { pct, prep } },
    extras:     { [id]: true }
  },
  actualBatchWeight: null   // grams, user-provided after cooking
};
```

State is saved on every change via `StorageAdapter.saveState(state)`.

---

## Ingredient Database

`DB` is a constant at the top of the JS section containing five arrays:
`proteins`, `carbs`, `vegetables`, `fruits`, `extras`.

Each macro ingredient has:
```javascript
{
  id,           // unique string e.g. 'p01'
  name,         // display name
  kcalPerG,     // kcal per gram AS SERVED (cooked/prepped)
  r,            // purchaseRatio: purchase_weight / recipe_weight
                //   > 1.0 = shrinks when cooked (buy more than you need)
                //   < 1.0 = expands when cooked (buy less dry than you'll use)
                //   = 1.0 = no change (raw veg, canned goods)
  preps,        // array of prep method strings
  warn,         // optional safety warning string
  note          // optional informational note string
}
```

Each extra has:
```javascript
{ id, name, amt, unit, imp, kcal, note }
// amt: daily amount per dog
// unit: 'g' or 'mL'
// imp: imperial equivalent string e.g. '1 tsp'
// kcal: kcal per dog per day
```

**Do not reorder or renumber ingredient IDs** — saved recipes reference them
by ID. If adding new ingredients, append to the end of each array with the
next sequential ID.

---

## Calorie Calculation

```
RER = 70 × (weightKg ^ 0.75)
MER = RER × lifeStage.factor
```

Life stage factors are in the `LIFE_STAGE` constant. Key values:
- Spayed/Neutered: 1.6
- Intact adult: 1.8
- Late pregnancy: 3.0
- Lactating: 4.8

---

## Key Conventions

- **No external JS libraries** — vanilla JS only unless explicitly approved
- **All storage through StorageAdapter** — never call localStorage directly
- **Weights in grams internally** — convert for display using `fmtWeight(g)`
- **Volumes in mL internally** — convert for display using `fmtVol(mL)`
- **All panels are collapsible** via `togglePanel(hdr)` — Pets and Batch
  Settings open by default, all others closed
- **Ingredient IDs are stable** — never change existing IDs, only append new ones
- **FIRESTORE HOOK comments** mark every place a Firebase call replaces
  a localStorage call — preserve this pattern for any new storage operations

---

## Known Issues / TODO

- [ ] Chili Spice theme: confirm exact hex codes from Figma
- [ ] Firebase Firestore integration (see Adding Firebase section above)
- [ ] URL-based recipe sharing (encode state as compressed URL param)
- [ ] Consider splitting into multiple files if app grows significantly
