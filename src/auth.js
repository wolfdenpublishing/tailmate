// ── AUTH MODULE ───────────────────────────────────────────────
import { StorageAdapter } from './storage.js';
import { state, replaceState, setPetIdCounter, $ } from './state.js';
import { renderThemePicker } from './themes.js';

// Forward-declared reference to applyStateToUI (set by app.js to avoid circular import)
let _applyStateToUI = null;
export function setApplyStateToUI(fn) { _applyStateToUI = fn; }

export const Auth = {
  user: null,
  isLoggedIn() { return !!this.user; },

  async signIn() {
    try {
      /* global firebase */
      const provider = new firebase.auth.GoogleAuthProvider();
      const result = await firebase.auth().signInWithPopup(provider);
      this.user = result.user;
      StorageAdapter.provider = 'firestore';

      // Sync recipes (merge local + remote using last-write-wins)
      await StorageAdapter.syncRecipes(this.user.uid);

      // Reload state from Firestore and refresh UI
      renderAuth();
      const saved = await StorageAdapter.loadState();
      if (saved) {
        const merged = { ...state, ...saved };
        merged.sel = merged.sel || {};
        ['proteins','carbs','vegetables','fruits','extras'].forEach(k => {
          if (!merged.sel[k]) merged.sel[k] = {};
        });
        replaceState(merged);
        setPetIdCounter(
          (merged.pets || []).reduce((m, p) => Math.max(m, p.id || 0), 0) + 1
        );
      }
      if (_applyStateToUI) _applyStateToUI();
      await renderThemePicker();
    } catch (e) {
      console.error('[TailMate] Sign-in failed', e);
      if (e.code !== 'auth/popup-closed-by-user') {
        alert('Sign-in failed. Please try again.');
      }
    }
  },

  async signOut() {
    try {
      await firebase.auth().signOut();
    } catch (e) {
      console.warn('[TailMate] Sign-out error', e);
    }
    this.user = null;
    StorageAdapter.provider = 'local';
    renderAuth();
  }
};

export async function handleAuth() {
  Auth.isLoggedIn() ? await Auth.signOut() : await Auth.signIn();
}

export function renderAuth() {
  const btn = $('authBtn');
  const badge = $('storageBadge');
  if (!btn) return;
  if (Auth.isLoggedIn()) {
    btn.innerHTML = `<img src="${Auth.user.photoURL}" alt="" class="auth-avatar"><span class="auth-name">${Auth.user.displayName}</span><button class="btn-auth" onclick="handleAuth()">Sign out</button>`;
    badge.textContent = '\u2601\uFE0F Synced';
    badge.style.background = '#e6f4ea'; badge.style.color = '#1e7e34'; badge.style.borderColor = '#a8d5b0';
  } else {
    btn.innerHTML = `<button class="btn-auth" onclick="handleAuth()"><svg width="15" height="15" viewBox="0 0 48 48"><path fill="#fff" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/></svg>Sign in with Google</button>`;
    badge.textContent = '\uD83D\uDCBE Local'; badge.style.background = '#e8f0fe'; badge.style.color = '#1a56db'; badge.style.borderColor = '#c0d4fc';
  }
}
