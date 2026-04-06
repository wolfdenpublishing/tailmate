// ── RECIPE SHARING: URL-BASED ENCODE/DECODE ─────────────────
import { DB } from './db.js';
import { state, $, esc, saveState } from './state.js';
import { StorageAdapter } from './storage.js';
import { showModal } from './ui.js';

// Circular dependency resolver (same pattern as auth.js)
let _applyStateToUI = null;
export function setShareApplyStateToUI(fn) { _applyStateToUI = fn; }

// ── BASE64URL HELPERS ───────────────────────────────────────
function toBase64Url(uint8) {
  let bin = '';
  for (const b of uint8) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ── COMPRESS / DECOMPRESS ───────────────────────────────────
async function encodeRecipe(data) {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    return toBase64Url(compressed);
  }
  return toBase64Url(bytes);
}

async function decodeRecipe(encoded) {
  const bytes = fromBase64Url(encoded);
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const out = new Uint8Array(await new Response(ds.readable).arrayBuffer());
      return JSON.parse(new TextDecoder().decode(out));
    } catch (_) { /* fallback to plain */ }
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

// ── VALIDATION ──────────────────────────────────────────────
const CATS = ['proteins','fats','carbs','vegetables','fruits'];
const CAT_LABELS = {proteins:'Proteins',fats:'Fats & Oils',carbs:'Carbohydrates',vegetables:'Vegetables',fruits:'Fruits',extras:'Extras'};

function validateSharedRecipe(data) {
  const warnings = [];
  if (!data || typeof data !== 'object') return {valid:false, error:'Invalid recipe data.'};
  if (typeof data.batchDays !== 'number' || data.batchDays < 1 || data.batchDays > 30) return {valid:false, error:'Invalid batch days.'};
  if (![1,2,3].includes(data.mealsPerDay)) return {valid:false, error:'Invalid meals per day.'};
  const m = data.macros;
  if (!m || typeof m.p !== 'number' || typeof m.fa !== 'number' || typeof m.c !== 'number' || typeof m.v !== 'number' || typeof m.f !== 'number') {
    return {valid:false, error:'Invalid macro percentages.'};
  }
  const sum = m.p + m.fa + m.c + m.v + m.f;
  if (Math.abs(sum - 100) > 0.5) warnings.push(`Macro percentages sum to ${sum}% (expected 100%).`);
  if (!data.sel || typeof data.sel !== 'object') return {valid:false, error:'No ingredient selections found.'};

  // Filter unknown ingredient IDs
  const cleaned = JSON.parse(JSON.stringify(data.sel));
  for (const cat of CATS) {
    if (!cleaned[cat]) { cleaned[cat] = {}; continue; }
    for (const id of Object.keys(cleaned[cat])) {
      if (!DB[cat].find(x => x.id === id)) {
        warnings.push(`Unknown ${CAT_LABELS[cat]} ingredient (${id}) — skipped.`);
        delete cleaned[cat][id];
      }
    }
  }
  if (!cleaned.extras) cleaned.extras = {};
  for (const id of Object.keys(cleaned.extras)) {
    if (!DB.extras.find(x => x.id === id)) {
      warnings.push(`Unknown extra (${id}) — skipped.`);
      delete cleaned.extras[id];
    }
  }
  data.sel = cleaned;
  return {valid:true, data, warnings};
}

// ── EXTRACT SHAREABLE DATA ──────────────────────────────────
function extractShareableData(s) {
  return {
    v: 1,
    batchDays: s.batchDays,
    mealsPerDay: s.mealsPerDay,
    macros: {...s.macros},
    sel: JSON.parse(JSON.stringify(s.sel))
  };
}

function hasIngredients(sel) {
  for (const cat of CATS) {
    if (sel[cat] && Object.keys(sel[cat]).length > 0) return true;
  }
  if (sel.extras && Object.keys(sel.extras).length > 0) return true;
  return false;
}

// ── IMPORT PREVIEW MODAL ────────────────────────────────────
function showImportPreview(recipe, warnings) {
  return new Promise(resolve => {
    const m = recipe.macros;
    let html = '';

    // Settings
    html += `<div class="import-section"><div class="import-cat">Batch Settings</div>`;
    html += `<div class="import-item">${recipe.batchDays} day batch &middot; ${recipe.mealsPerDay} meal${recipe.mealsPerDay > 1 ? 's' : ''}/day</div>`;
    html += `<div class="import-item">Protein ${m.p}% &middot; Fat ${m.fa}% &middot; Carb ${m.c}% &middot; Veg ${m.v}% &middot; Fruit ${m.f}%</div>`;
    html += `</div>`;

    // Ingredients by category
    for (const cat of CATS) {
      const items = Object.entries(recipe.sel[cat] || {});
      if (!items.length) continue;
      html += `<div class="import-section"><div class="import-cat">${esc(CAT_LABELS[cat])}</div>`;
      for (const [id, s] of items) {
        const ing = DB[cat].find(x => x.id === id);
        if (!ing) continue;
        html += `<div class="import-item"><span class="import-pct">${s.pct}%</span> ${esc(ing.name)} <span style="color:var(--muted)">(${esc(s.prep)})</span></div>`;
      }
      html += `</div>`;
    }

    // Extras
    const extraIds = Object.keys(recipe.sel.extras || {});
    if (extraIds.length) {
      html += `<div class="import-section"><div class="import-cat">Extras</div>`;
      for (const id of extraIds) {
        const ex = DB.extras.find(x => x.id === id);
        if (ex) html += `<div class="import-item">${esc(ex.name)}</div>`;
      }
      html += `</div>`;
    }

    // Warnings
    if (warnings.length) {
      html += `<div class="import-warn">${warnings.map(w => esc(w)).join('<br>')}</div>`;
    }

    // Disclaimer
    html += `<div style="font-size:.78rem;color:var(--muted);margin-top:10px">This will replace your current ingredient selections and batch settings. Your pet profiles will not be changed.</div>`;

    // Build overlay (reuse adjust-overlay pattern)
    let overlay = $('importOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'importOverlay';
      overlay.className = 'adjust-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="adjust-dialog import-dialog">
      <h3>Import Shared Recipe</h3>
      ${html}
      <div class="adjust-actions" style="margin-top:16px">
        <button class="btn btn-secondary" id="importCancel">Cancel</button>
        <button class="btn btn-primary" id="importConfirm">Import</button>
      </div>
    </div>`;
    overlay.classList.add('open');

    const done = (result) => {
      overlay.classList.remove('open');
      document.removeEventListener('keydown', keyHandler);
      resolve(result);
    };
    const keyHandler = (e) => {
      if (e.key === 'Escape') done(false);
      if (e.key === 'Enter') done(true);
    };
    $('importConfirm').onclick = () => done(true);
    $('importCancel').onclick = () => done(false);
    overlay.onclick = (e) => { if (e.target === overlay) done(false); };
    document.addEventListener('keydown', keyHandler);
    $('importConfirm').focus();
  });
}

// ── SHARE (EXPORT) ──────────────────────────────────────────
async function doShare(stateObj) {
  const data = extractShareableData(stateObj);
  if (!hasIngredients(data.sel)) {
    await showModal({title:'Nothing to Share', message:'No ingredients are selected. Configure a recipe first.'});
    return;
  }
  const encoded = await encodeRecipe(data);
  const url = `${window.location.origin}${window.location.pathname}?r=${encoded}`;
  if (url.length > 2000) {
    await showModal({title:'Long URL', message:`This share link is ${url.length.toLocaleString()} characters. It may not work in all browsers or messaging apps. The link has still been copied to your clipboard.`});
  }
  try {
    await navigator.clipboard.writeText(url);
    await showModal({message:'Recipe link copied to clipboard!'});
  } catch (_) {
    await showModal({title:'Share Link', message:`Copy this link:<br><textarea readonly style="width:100%;height:60px;margin-top:8px;font-size:.8rem">${esc(url)}</textarea>`});
  }
}

export async function shareRecipe() {
  await doShare(state);
}

export async function shareRecipeById(id) {
  const recipes = await StorageAdapter.loadRecipes();
  const r = recipes.find(x => x.id === id);
  if (!r) return;
  await doShare(r.state);
}

// ── CHECK URL FOR SHARED RECIPE (called from init) ──────────
export async function checkSharedRecipeURL() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('r');
  if (!encoded) return;

  let recipe;
  try {
    recipe = await decodeRecipe(encoded);
  } catch (_) {
    await showModal({title:'Invalid Link', message:'This recipe link could not be decoded. It may be corrupted or from an incompatible version.'});
    history.replaceState(null, '', window.location.pathname);
    return;
  }

  const result = validateSharedRecipe(recipe);
  if (!result.valid) {
    await showModal({title:'Invalid Recipe', message: esc(result.error)});
    history.replaceState(null, '', window.location.pathname);
    return;
  }

  const accepted = await showImportPreview(result.data, result.warnings);
  history.replaceState(null, '', window.location.pathname);
  if (!accepted) return;

  // Apply shared recipe to state (keep pets, replace recipe data)
  state.batchDays = result.data.batchDays;
  state.mealsPerDay = result.data.mealsPerDay;
  state.macros = {...result.data.macros};
  state.sel = JSON.parse(JSON.stringify(result.data.sel));
  state.actualBatchWeight = null;
  saveState();
  if (_applyStateToUI) _applyStateToUI();
  window.scrollTo({top:0, behavior:'smooth'});
}
