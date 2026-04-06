// ── STORAGE ADAPTER ──────────────────────────────────────────
// All storage I/O goes through this module.
// Dual-write: when provider === 'firestore', writes go to BOTH
// localStorage (sync, instant) AND Firestore (async, background).
// Reads prefer Firestore, fall back to localStorage.

const K_STATE   = 'tailmate_state_v1';
const K_RECIPES = 'tailmate_recipes_v1';

function userDoc() {
  /* global firebase, db */
  // Auth.user is accessed indirectly — the caller sets provider='firestore'
  // only when Auth.user is non-null, so firebase.auth().currentUser is valid.
  const uid = firebase.auth().currentUser?.uid;
  if (!uid) return null;
  return db.collection('users').doc(uid);
}

export const StorageAdapter = {
  provider: 'local', // 'local' | 'firestore'

  async loadState() {
    if (this.provider === 'firestore') {
      try {
        const doc = userDoc();
        if (doc) {
          const snap = await doc.get();
          if (snap.exists && snap.data().state) return snap.data().state;
        }
      } catch (e) {
        console.warn('[TailMate] Firestore loadState failed, falling back to local', e);
      }
    }
    try { return JSON.parse(localStorage.getItem(K_STATE)); } catch { return null; }
  },

  async saveState(s) {
    // Always write to localStorage (synchronous, instant)
    try { localStorage.setItem(K_STATE, JSON.stringify(s)); } catch {}
    // Additionally write to Firestore when signed in
    if (this.provider === 'firestore') {
      try {
        const doc = userDoc();
        if (doc) await doc.set({ state: s }, { merge: true });
      } catch (e) {
        console.warn('[TailMate] Firestore saveState failed', e);
      }
    }
  },

  async loadRecipes() {
    if (this.provider === 'firestore') {
      try {
        const doc = userDoc();
        if (doc) {
          const snap = await doc.collection('recipes').orderBy('savedAt', 'desc').get();
          return snap.docs.map(d => d.data());
        }
      } catch (e) {
        console.warn('[TailMate] Firestore loadRecipes failed, falling back to local', e);
      }
    }
    try { return JSON.parse(localStorage.getItem(K_RECIPES)) || []; } catch { return []; }
  },

  async saveRecipe(r) {
    // Dual-write: always update localStorage
    let all;
    try { all = JSON.parse(localStorage.getItem(K_RECIPES)) || []; } catch { all = []; }
    const i = all.findIndex(x => x.id === r.id);
    if (i >= 0) all[i] = r; else all.push(r);
    try { localStorage.setItem(K_RECIPES, JSON.stringify(all)); } catch {}
    // Additionally write to Firestore when signed in
    if (this.provider === 'firestore') {
      try {
        const doc = userDoc();
        if (doc) await doc.collection('recipes').doc(r.id).set(r);
      } catch (e) {
        console.warn('[TailMate] Firestore saveRecipe failed', e);
      }
    }
  },

  async deleteRecipe(id) {
    // Dual-write: always update localStorage
    let all;
    try { all = JSON.parse(localStorage.getItem(K_RECIPES)) || []; } catch { all = []; }
    all = all.filter(r => r.id !== id);
    try { localStorage.setItem(K_RECIPES, JSON.stringify(all)); } catch {}
    // Additionally delete from Firestore when signed in
    if (this.provider === 'firestore') {
      try {
        const doc = userDoc();
        if (doc) await doc.collection('recipes').doc(id).delete();
      } catch (e) {
        console.warn('[TailMate] Firestore deleteRecipe failed', e);
      }
    }
  },

  async syncRecipes(uid) {
    // Merge local and remote recipes using last-write-wins by id + updatedAt
    try {
      let localRecipes;
      try { localRecipes = JSON.parse(localStorage.getItem(K_RECIPES)) || []; } catch { localRecipes = []; }

      const doc = db.collection('users').doc(uid);
      const remoteSnap = await doc.collection('recipes').get();
      const remoteRecipes = remoteSnap.docs.map(d => d.data());

      // Build maps by id
      const localMap = new Map(localRecipes.map(r => [r.id, r]));
      const remoteMap = new Map(remoteRecipes.map(r => [r.id, r]));

      // Collect all unique IDs
      const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
      const merged = [];

      for (const id of allIds) {
        const local = localMap.get(id);
        const remote = remoteMap.get(id);

        if (local && !remote) {
          // Only local — upload to Firestore
          merged.push(local);
          await doc.collection('recipes').doc(id).set(local);
        } else if (remote && !local) {
          // Only remote — download to localStorage
          merged.push(remote);
        } else if (local && remote) {
          // Both exist — last-write-wins
          const localTime = local.updatedAt || local.savedAt || '';
          const remoteTime = remote.updatedAt || remote.savedAt || '';
          if (localTime >= remoteTime) {
            merged.push(local);
            await doc.collection('recipes').doc(id).set(local);
          } else {
            merged.push(remote);
          }
        }
      }

      // Write merged set to localStorage
      try { localStorage.setItem(K_RECIPES, JSON.stringify(merged)); } catch {}

      console.info('[TailMate] Recipe sync complete:', merged.length, 'recipes');
    } catch (e) {
      console.error('[TailMate] Recipe sync failed', e);
    }
  },
};
