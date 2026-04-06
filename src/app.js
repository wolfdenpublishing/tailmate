// ═══════════════════════════════════════════════════════════════
//  TAILMATE — Homemade Dog Food Calculator
//  Storage: localStorage (v1) + Firestore dual-write (v2)
//  Auth:    Google/Firebase Authentication (v2)
//  Modules: ES native modules (no bundler)
// ═══════════════════════════════════════════════════════════════

import { state, replaceState, setPetIdCounter, togglePanel } from './state.js';
import { StorageAdapter } from './storage.js';
import { Auth, handleAuth, renderAuth, setApplyStateToUI } from './auth.js';
import { applyTheme, toggleThemeDropdown, renderThemePicker } from './themes.js';
import {
  addPet, removePet, updatePet,
  updateBatch, updateMacro,
  renderIngredients, toggleIng, updateIngPct, updateIngPrep,
  renderExtras, toggleExtra,
  calculate, updateActualWeight,
  copyShoppingList,
  saveRecipe, loadRecipe, deleteRecipe, loadRecipesList,
  resetIngredients, resetBatchSettings,
  applyStateToUI,
} from './ui.js';

// Wire up the circular dependency: auth.js needs applyStateToUI from ui.js
setApplyStateToUI(applyStateToUI);

// ── REGISTER GLOBALS (for onclick handlers in HTML templates) ──
window.togglePanel     = togglePanel;
window.addPet          = addPet;
window.removePet       = removePet;
window.updatePet       = updatePet;
window.updateBatch     = updateBatch;
window.updateMacro     = updateMacro;
window.toggleIng       = toggleIng;
window.updateIngPct    = updateIngPct;
window.updateIngPrep   = updateIngPrep;
window.toggleExtra     = toggleExtra;
window.calculate       = calculate;
window.updateActualWeight = updateActualWeight;
window.copyShoppingList   = copyShoppingList;
window.saveRecipe      = saveRecipe;
window.loadRecipe      = loadRecipe;
window.deleteRecipe    = deleteRecipe;
window.handleAuth      = handleAuth;
window.applyTheme      = applyTheme;
window.toggleThemeDropdown = toggleThemeDropdown;
window.resetIngredients   = resetIngredients;
window.resetBatchSettings = resetBatchSettings;

// ── AUTH STATE LISTENER ──────────────────────────────────────
/* global firebase */
firebase.auth().onAuthStateChanged(async (user) => {
  Auth.user = user;
  StorageAdapter.provider = user ? 'firestore' : 'local';
  renderAuth();
  if (user) {
    // Reload state from Firestore (handles page refresh / persisted session)
    const saved = await StorageAdapter.loadState();
    if (saved) {
      const merged = { ...state, ...saved };
      merged.sel = merged.sel || {};
      ['proteins','fats','carbs','vegetables','fruits','extras'].forEach(k => {
        if (!merged.sel[k]) merged.sel[k] = {};
      });
      replaceState(merged);
      setPetIdCounter(
        (merged.pets || []).reduce((m, p) => Math.max(m, p.id || 0), 0) + 1
      );
    }
    applyStateToUI();
  }
  await renderThemePicker();
});

// ── INIT ──────────────────────────────────────────────────────
(async function init() {
  const saved = await StorageAdapter.loadState();
  if (saved) {
    try {
      const merged = { ...state, ...saved };
      merged.sel = merged.sel || {};
      ['proteins','fats','carbs','vegetables','fruits','extras'].forEach(k => {
        if (!merged.sel[k]) merged.sel[k] = {};
      });
      replaceState(merged);
      setPetIdCounter(
        (merged.pets || []).reduce((m, p) => Math.max(m, p.id || 0), 0) + 1
      );
    } catch(e) { console.warn('State load error', e); }
  } else {
    // No saved state — leave defaults
  }
  await renderThemePicker();
  applyStateToUI();
  renderAuth();
})();
