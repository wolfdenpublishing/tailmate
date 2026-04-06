// ── UI: RENDERING + EVENT HANDLERS ──────────────────────────
import { DB, LIFE_STAGE } from './db.js';
import { state, replaceState, nextPetId, setPetIdCounter, $, esc, calcMER, toKg, fmtWeight, fmtVol, fmtAmt, saveState } from './state.js';
import { StorageAdapter } from './storage.js';

// Module-scoped storage for last calculation results
let _lastResults = null;

// ── MODAL DIALOG ─────────────────────────────────────────────
function showModal({title, message, confirm = false, confirmText = 'OK', cancelText = 'Cancel'}) {
  return new Promise(resolve => {
    let overlay = $('modalOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modalOverlay';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="modal-dialog">
      ${title ? `<div class="modal-title">${esc(title)}</div>` : ''}
      <div class="modal-message">${message}</div>
      <div class="modal-actions">
        ${confirm ? `<button class="btn btn-secondary" id="modalCancel">${esc(cancelText)}</button>` : ''}
        <button class="btn btn-primary" id="modalConfirm">${esc(confirmText)}</button>
      </div>
    </div>`;
    overlay.classList.add('open');
    const keyHandler = (e) => {
      if (e.key === 'Escape') done(!confirm);
      if (e.key === 'Enter') done(true);
    };
    const done = (result) => {
      overlay.classList.remove('open');
      document.removeEventListener('keydown', keyHandler);
      resolve(result);
    };
    $('modalConfirm').onclick = () => done(true);
    if (confirm) $('modalCancel').onclick = () => done(false);
    overlay.onclick = (e) => { if (e.target === overlay) done(!confirm); };
    document.addEventListener('keydown', keyHandler);
    $('modalConfirm').focus();
  });
}

// ── PACKAGE SIZE ADJUSTMENT MODAL ────────────────────────────
export function adjustPackageSize(cat, ingId, ingName, currentPurchaseG) {
  if (!_lastResults) return;
  const d = _lastResults;
  const CATS = ['proteins','fats','carbs','vegetables','fruits'];
  const MACRO_KEYS = ['p','fa','c','v','f'];
  const ci = CATS.indexOf(cat);
  if (ci < 0) return;
  const macroPct = (state.macros[MACRO_KEYS[ci]] || 0) / 100;
  const ing = DB[cat].find(x => x.id === ingId);
  if (!ing) return;
  const currentPct = state.sel[cat][ingId]?.pct || 0;
  const otherIngs = Object.entries(state.sel[cat]).filter(([id]) => id !== ingId);
  const sumOtherPcts = otherIngs.reduce((s, [, v]) => s + (v.pct || 0), 0);

  // Create overlay
  let overlay = $('adjustOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'adjustOverlay';
    overlay.className = 'adjust-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="adjust-dialog">
    <h3>Adjust ${esc(ingName)}</h3>
    <div class="adjust-current">Currently: ${fmtWeight(currentPurchaseG)}</div>
    <div class="adjust-input-row">
      <label>Target purchase amount:</label>
      <input type="number" id="adjustTarget" min="0" step="1" placeholder="${Math.round(currentPurchaseG)}">
      <span>grams</span>
    </div>
    <div class="adjust-oz-hint" id="adjustOzHint"></div>
    <div class="adjust-preview" id="adjustPreview"></div>
    <div class="adjust-actions">
      <button class="btn btn-secondary" id="adjustCancel">Cancel</button>
      <button class="btn btn-primary" id="adjustApply" disabled>Apply &amp; Recalculate</button>
    </div>
  </div>`;
  overlay.classList.add('open');

  const input = $('adjustTarget');
  const preview = $('adjustPreview');
  const ozHint = $('adjustOzHint');
  const applyBtn = $('adjustApply');

  const updatePreview = () => {
    const targetG = +input.value;
    if (!targetG || targetG <= 0) {
      preview.innerHTML = '';
      ozHint.textContent = '';
      applyBtn.disabled = true;
      return;
    }
    ozHint.textContent = `= ${(targetG / 28.3495).toFixed(1)} oz`;
    // Calculate new percentage
    const newPct = (targetG / (d.estimatedBatchWeight * macroPct * ing.r)) * 100;
    if (newPct > 100) {
      preview.innerHTML = `<span class="adjust-err">Target exceeds total category weight (max ${fmtWeight(d.estimatedBatchWeight * macroPct * ing.r * 1)})</span>`;
      applyBtn.disabled = true;
      return;
    }
    if (newPct < 1) {
      preview.innerHTML = `<span class="adjust-err">Target too small (would be ${newPct.toFixed(1)}%)</span>`;
      applyBtn.disabled = true;
      return;
    }
    const remaining = 100 - newPct;
    let lines = `<strong>${esc(ingName)}</strong>: ${currentPct}% → <strong>${Math.round(newPct)}%</strong>`;
    if (otherIngs.length > 0 && sumOtherPcts > 0) {
      otherIngs.forEach(([otherId, otherSel]) => {
        const otherIng = DB[cat].find(x => x.id === otherId);
        if (!otherIng) return;
        const otherNewPct = (otherSel.pct || 0) * (remaining / sumOtherPcts);
        lines += `<br>${esc(otherIng.name)}: ${otherSel.pct}% → <strong>${Math.round(otherNewPct)}%</strong>`;
      });
    } else if (otherIngs.length === 0) {
      // Only ingredient in category
    } else {
      preview.innerHTML = `<span class="adjust-err">Cannot redistribute — other ingredients are at 0%</span>`;
      applyBtn.disabled = true;
      return;
    }
    preview.innerHTML = lines;
    applyBtn.disabled = false;
  };

  input.oninput = updatePreview;

  const close = () => { overlay.classList.remove('open'); document.removeEventListener('keydown', keyHandler); };
  const keyHandler = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && !applyBtn.disabled) doApply();
  };
  document.addEventListener('keydown', keyHandler);
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  $('adjustCancel').onclick = close;

  const doApply = () => {
    const targetG = +input.value;
    if (!targetG || targetG <= 0) return;
    const newPct = (targetG / (d.estimatedBatchWeight * macroPct * ing.r)) * 100;
    if (newPct > 100 || newPct < 1) return;
    const remaining = 100 - newPct;
    // Update the target ingredient
    state.sel[cat][ingId].pct = Math.round(newPct);
    // Redistribute other ingredients proportionally
    if (otherIngs.length > 0 && sumOtherPcts > 0) {
      otherIngs.forEach(([otherId, otherSel]) => {
        state.sel[cat][otherId].pct = Math.round(otherSel.pct * (remaining / sumOtherPcts));
      });
    }
    saveState();
    renderIngredients(cat);
    close();
    calculate();
  };
  applyBtn.onclick = doApply;
  input.focus();
}

// ── PETS ──────────────────────────────────────────────────────
export function addPet() {
  state.pets.push({id: nextPetId(), name:'', breed:'', status:'Spayed Female', age:'', weight:'', wunit:'lb', balanceitG:''});
  saveState(); renderPets();
}

export function removePet(id) {
  state.pets = state.pets.filter(p => p.id !== id);
  saveState(); renderPets();
}

export function updatePet(id, field, val) {
  const p = state.pets.find(x => x.id === id);
  if (!p) return;
  p[field] = val;
  saveState();
  const badge = $(`kcal-${id}`);
  if (badge && (field === 'weight' || field === 'wunit' || field === 'status')) {
    const kg = toKg(p.weight, p.wunit);
    if (kg > 0) badge.innerHTML = `<span>${calcMER(kg, p.status).toLocaleString()}</span> kcal/day`;
    else badge.innerHTML = 'Enter weight for kcal';
  }
}

export function renderPets() {
  const grid = $('petsGrid');
  if (state.pets.length === 0) {
    grid.innerHTML = '<div class="empty-state">No pets added yet. Click "+ Add Pet" to begin.</div>';
    return;
  }
  const statusOpts = Object.keys(LIFE_STAGE).map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
  grid.innerHTML = state.pets.map((p, idx) => {
    const kg = toKg(p.weight, p.wunit);
    const kcalText = kg > 0 ? `<span>${calcMER(kg,p.status).toLocaleString()}</span> kcal/day` : 'Enter weight for kcal';
    return `<div class="pet-card">
      <div class="pet-card-hdr">
        <span>Pet ${idx + 1}</span>
        <button class="btn btn-danger" onclick="removePet(${p.id})">✕ Remove</button>
      </div>
      <div class="field"><label>Name</label><input type="text" value="${esc(p.name)}" placeholder="e.g. Evie" oninput="updatePet(${p.id},'name',this.value)"></div>
      <div class="field"><label>Breed</label><input type="text" value="${esc(p.breed)}" placeholder="e.g. Shih Tzu / Poodle mix" oninput="updatePet(${p.id},'breed',this.value)"></div>
      <div class="field"><label>Status / Life Stage</label>
        <select onchange="updatePet(${p.id},'status',this.value)">${statusOpts.replace(`value="${esc(p.status)}"`,`value="${esc(p.status)}" selected`)}</select>
      </div>
      <div class="field-row">
        <div class="field"><label>Age</label><input type="text" value="${esc(p.age)}" placeholder="e.g. 3 years" oninput="updatePet(${p.id},'age',this.value)"></div>
        <div class="field"><label>Weight</label>
          <div style="display:flex;gap:5px">
            <input type="number" value="${esc(p.weight)}" placeholder="0" step="0.1" min="0" oninput="updatePet(${p.id},'weight',this.value)" style="flex:1;min-width:0">
            <select style="width:58px" onchange="updatePet(${p.id},'wunit',this.value)">
              <option value="lb"${p.wunit==='lb'?' selected':''}>lb</option>
              <option value="kg"${p.wunit==='kg'?' selected':''}>kg</option>
            </select>
          </div>
        </div>
      </div>
      <div class="field"><label>BalanceIT (g/day)</label>
        <input type="number" value="${esc(p.balanceitG || '')}" placeholder="e.g. 5.3" step="0.01" min="0" oninput="updatePet(${p.id},'balanceitG',this.value)" style="width:120px">
        <div style="font-size:.72rem;color:var(--muted);margin-top:2px">~5 g/day typical. Get exact amount from balanceit.com</div>
      </div>
      <div class="kcal-badge" id="kcal-${p.id}">${kcalText}</div>
      ${LIFE_STAGE[p.status]?.note ? `<div class="ing-warn" style="margin-top:6px">⚠ ${esc(LIFE_STAGE[p.status].note)}</div>` : ''}
    </div>`;
  }).join('');
  // Update header summary
  const petsHdr = $('pets-summary-hdr');
  if (petsHdr) {
    if (state.pets.length === 0) {
      petsHdr.className = 'cat-total empty'; petsHdr.textContent = '';
    } else {
      const names = state.pets.map(p => p.name || 'Unnamed').join(', ');
      petsHdr.className = 'cat-total ok'; petsHdr.textContent = names;
    }
  }
}

// ── BATCH SETTINGS ─────────────────────────────────────────────
export function updateBatch() {
  state.batchDays = +$('batchDays').value || 7;
  state.mealsPerDay = +$('mealsPerDay').value || 2;
  saveState();
}

export function updateMacro() {
  state.macros.p  = +$('mp').value || 0;
  state.macros.fa = +$('mfa').value || 0;
  state.macros.c  = +$('mc').value || 0;
  state.macros.v  = +$('mv').value || 0;
  state.macros.f  = +$('mf').value || 0;
  const total = state.macros.p + state.macros.fa + state.macros.c + state.macros.v + state.macros.f;
  const el = $('macroTotal');
  if (total === 100) { el.className='macro-total ok'; el.textContent=`Total: 100% ✓`; }
  else { el.className='macro-total warn'; el.textContent=`Total: ${total}% ⚠ Must equal 100%`; }
  saveState();
}

// ── INGREDIENT RENDERING ───────────────────────────────────────
const CAT_MAP = {
  proteins:'protList', fats:'fatList', carbs:'carbList', vegetables:'vegList', fruits:'fruitList'
};
const CAT_TOTAL_MAP = {
  proteins:'protTotal', fats:'fatTotal', carbs:'carbTotal', vegetables:'vegTotal', fruits:'fruitTotal'
};
const CAT_HDR_MAP = {
  proteins:'prot-total-hdr', fats:'fat-total-hdr', carbs:'carb-total-hdr', vegetables:'veg-total-hdr', fruits:'fruit-total-hdr'
};

export function renderIngredients(cat) {
  const items = [...DB[cat]].sort((a, b) => a.name.localeCompare(b.name));
  const sel = state.sel[cat];
  const listEl = $(CAT_MAP[cat]);
  listEl.innerHTML = items.map(ing => {
    const isSelected = !!sel[ing.id];
    const s = sel[ing.id] || {};
    const prepOpts = ing.preps.map(p => `<option${p===s.prep?' selected':''}>${esc(p)}</option>`).join('');
    return `<div class="ing-row${isSelected?' selected':''}" onclick="toggleIng(event,'${cat}','${ing.id}')">
      <input type="checkbox" ${isSelected?'checked':''} onclick="toggleIng(event,'${cat}','${ing.id}')">
      <div class="ing-main">
        <div class="ing-name">${esc(ing.name)}${ing.note?` <span style="font-size:.74rem;color:var(--muted)">(${esc(ing.note)})</span>`:''}</div>
        ${ing.warn ? `<div class="ing-warn">⚠ ${esc(ing.warn)}</div>` : ''}
        ${isSelected ? `<div class="ing-controls" onclick="event.stopPropagation()">
          <div style="display:flex;align-items:center;gap:4px">
            <input type="number" class="pct-wrap" value="${s.pct||0}" min="0" max="100" style="width:70px;text-align:right" oninput="updateIngPct('${cat}','${ing.id}',this.value)">
            <span style="font-size:.82rem;color:var(--muted)">%</span>
          </div>
          <select style="min-width:130px;font-size:.82rem" onchange="updateIngPrep('${cat}','${ing.id}',this.value)">${prepOpts}</select>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');
  updateCatTotal(cat);
}

function updateCatTotal(cat) {
  const sel = state.sel[cat];
  const total = Object.values(sel).reduce((s,v) => s + (+v.pct||0), 0);
  const count = Object.keys(sel).length;
  const el = $(CAT_TOTAL_MAP[cat]);
  const hdrEl = $(CAT_HDR_MAP[cat]);
  if (count === 0) {
    el.className='cat-total empty'; el.textContent='No ingredients selected';
    hdrEl.className='cat-total empty'; hdrEl.textContent='';
  } else if (total === 100) {
    el.className='cat-total ok'; el.textContent=`✓ Total: 100% (${count} ingredient${count>1?'s':''})`;
    hdrEl.className='cat-total ok'; hdrEl.textContent=`${count} selected ✓`;
  } else {
    el.className='cat-total warn'; el.textContent=`⚠ Total: ${total}% (needs to be 100%)`;
    hdrEl.className='cat-total warn'; hdrEl.textContent=`⚠ ${total}%`;
  }
}

export function toggleIng(e, cat, id) {
  e.stopPropagation();
  const sel = state.sel[cat];
  if (sel[id]) {
    delete sel[id];
  } else {
    const ing = DB[cat].find(x => x.id === id);
    sel[id] = {pct:0, prep: ing.preps[0]};
  }
  // Auto-equalize percentages
  const keys = Object.keys(sel);
  if (keys.length > 0) {
    const each = Math.floor(100 / keys.length);
    keys.forEach((k,i) => sel[k].pct = i === keys.length-1 ? 100 - each*(keys.length-1) : each);
  }
  saveState();
  renderIngredients(cat);
}

export function updateIngPct(cat, id, val) {
  if (state.sel[cat][id]) { state.sel[cat][id].pct = +val || 0; saveState(); updateCatTotal(cat); }
}

export function updateIngPrep(cat, id, val) {
  if (state.sel[cat][id]) { state.sel[cat][id].prep = val; saveState(); }
}

// ── EXTRAS ────────────────────────────────────────────────────
export function renderExtras() {
  const el = $('extrasList');
  el.innerHTML = [...DB.extras].sort((a, b) => a.name.localeCompare(b.name)).map(ex => {
    const sel = !!state.sel.extras[ex.id];
    return `<div class="extra-card${sel?' selected':''}" onclick="toggleExtra('${ex.id}')">
      <input type="checkbox" ${sel?'checked':''} onclick="toggleExtra('${ex.id}');event.stopPropagation()">
      <div class="extra-info">
        <div class="extra-name">${esc(ex.name)}</div>
        <div class="extra-dose">${fmtAmt(ex.amt, ex.unit)} per dog per day (${esc(ex.imp)})</div>
        ${ex.note ? `<div class="extra-note">⚠ ${esc(ex.note)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  updateExtrasTotal();
}

function updateExtrasTotal() {
  const hdrEl = $('extras-total-hdr');
  if (!hdrEl) return;
  const count = Object.keys(state.sel.extras).length;
  if (count === 0) {
    hdrEl.className = 'cat-total empty'; hdrEl.textContent = '';
  } else {
    hdrEl.className = 'cat-total ok'; hdrEl.textContent = `${count} selected`;
  }
}

export function toggleExtra(id) {
  if (state.sel.extras[id]) delete state.sel.extras[id];
  else state.sel.extras[id] = true;
  saveState(); renderExtras();
}

// ── CALCULATE ─────────────────────────────────────────────────
export async function calculate() {
  // Validate pets
  const validPets = state.pets.filter(p => p.weight && +p.weight > 0);
  if (validPets.length === 0) { await showModal({title:'Missing Pets', message:'Please add at least one pet with a weight to calculate.'}); return; }

  // Check for any selected ingredients
  const hasAnyIng = ['proteins','fats','carbs','vegetables','fruits'].some(c => Object.keys(state.sel[c]).length > 0);
  if (!hasAnyIng) { await showModal({title:'No Ingredients', message:'Please select at least one ingredient to calculate.'}); return; }

  // Pet kcal
  const petData = validPets.map(p => {
    const kg = toKg(p.weight, p.wunit);
    const kcal = calcMER(kg, p.status);
    return {...p, kg, kcal};
  });
  const totalDailyKcal = petData.reduce((s,p) => s+p.kcal, 0);
  const totalBatchKcal = totalDailyKcal * state.batchDays;

  // Recipe kcal density (weighted average across all selected ingredients)
  let recipeKcalPerG = 0;
  const CATS = ['proteins','fats','carbs','vegetables','fruits'];
  const MACRO_KEYS = ['p','fa','c','v','f'];
  CATS.forEach((cat, ci) => {
    const macroPct = (state.macros[MACRO_KEYS[ci]] || 0) / 100;
    Object.entries(state.sel[cat]).forEach(([id, s]) => {
      const ing = DB[cat].find(x => x.id === id);
      if (!ing) return;
      recipeKcalPerG += macroPct * (s.pct/100) * ing.kcalPerG;
    });
  });

  if (recipeKcalPerG <= 0) { await showModal({title:'Cannot Calculate', message:'Unable to calculate — no valid ingredients selected with macro percentages.'}); return; }

  const dailyRecipeWeight = totalDailyKcal / recipeKcalPerG;
  const estimatedBatchWeight = dailyRecipeWeight * state.batchDays;
  const actualBatchWeight = state.actualBatchWeight || estimatedBatchWeight;
  const actualDailyWeight = actualBatchWeight / state.batchDays;

  // Per ingredient: recipe weight and purchase weight
  const ingResults = [];
  CATS.forEach((cat, ci) => {
    const macroPct = (state.macros[MACRO_KEYS[ci]] || 0) / 100;
    const catLabel = ['Protein','Fat','Carbohydrate','Vegetable','Fruit'][ci];
    Object.entries(state.sel[cat]).forEach(([id, s]) => {
      const ing = DB[cat].find(x => x.id === id);
      if (!ing) return;
      const recipeG = estimatedBatchWeight * macroPct * (s.pct/100);
      ingResults.push({id, cat, catLabel, name:ing.name, prep:s.prep, recipeG, purchaseG: recipeG * ing.r, purchaseRatio: ing.r});
    });
  });

  // Extras batch totals
  const extrasResults = Object.keys(state.sel.extras).map(id => {
    const ex = DB.extras.find(x => x.id === id);
    if (!ex) return null;
    const total = ex.amt * validPets.length * state.batchDays;
    return {...ex, totalAmt: total};
  }).filter(Boolean);

  // Per pet per meal
  const perPet = petData.map(p => {
    const petDailyG = (p.kcal / totalDailyKcal) * actualDailyWeight;
    const petMealG = petDailyG / state.mealsPerDay;
    return {...p, petDailyG, petMealG};
  });

  renderResults({petData, totalDailyKcal, totalBatchKcal, estimatedBatchWeight, actualBatchWeight, ingResults, extrasResults, perPet});

  // Pre-fill recipe name if empty
  const nameInput = $('recipeNameInput');
  if (nameInput && !nameInput.value.trim()) {
    const ingNames = [];
    ['proteins','fats','carbs','vegetables','fruits'].forEach(cat => {
      Object.keys(state.sel[cat]).forEach(id => {
        const ing = DB[cat].find(x => x.id === id);
        if (ing) ingNames.push(ing.name.replace(/\s*\(.*?\)/g, '').trim());
      });
    });
    if (ingNames.length > 0) nameInput.value = ingNames.join(', ');
  }
}

function renderResults(d) {
  const panel = $('resultsPanel');
  panel.classList.remove('result-hidden');
  panel.scrollIntoView({behavior:'smooth', block:'start'});

  const body = $('resultsBody');

  // Summary cards
  let html = `<div class="summary-grid">
    ${d.petData.map(p=>`<div class="sum-card"><div class="sum-val">${p.kcal.toLocaleString()}</div><div class="sum-lbl">${esc(p.name||'Pet')} kcal/day</div></div>`).join('')}
    <div class="sum-card"><div class="sum-val">${Math.round(d.totalDailyKcal).toLocaleString()}</div><div class="sum-lbl">Total kcal/day</div></div>
    <div class="sum-card"><div class="sum-val">${Math.round(d.totalBatchKcal).toLocaleString()}</div><div class="sum-lbl">Total batch kcal (${state.batchDays} days)</div></div>
    <div class="sum-card"><div class="sum-val">${(d.estimatedBatchWeight/1000).toFixed(2)}</div><div class="sum-lbl">Est. batch weight (kg)</div><div class="sum-sub">${(d.estimatedBatchWeight/453.592).toFixed(2)} lb</div></div>
  </div>`;

  // Batch weight override
  html += `<div class="batch-override">
    <div>
      <label>Actual Prepped Batch Weight</label>
      <div class="hint">Weigh your finished batch in the kitchen and enter the actual weight here. Per-meal portions below will update automatically.</div>
    </div>
    <div>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="number" id="actualWeightInput" value="${state.actualBatchWeight ? Math.round(state.actualBatchWeight) : ''}" placeholder="${Math.round(d.estimatedBatchWeight)}" min="0" step="1" style="width:140px" oninput="updateActualWeight(this.value)">
        <span style="font-size:.85rem;color:var(--muted)">grams</span>
      </div>
      <div style="font-size:.75rem;color:var(--muted);margin-top:3px">${state.actualBatchWeight ? `(${(state.actualBatchWeight/453.592).toFixed(2)} lb)` : 'Leave blank to use estimated weight'}</div>
    </div>
  </div>`;

  // Batch prep table
  html += `<div class="result-section">
    <h3>🥘 Batch Prep Weights (Into the Pot)</h3>
    <table class="data-table">
      <thead><tr><th>Ingredient</th><th>Category</th><th>Prep Method</th><th>Recipe Weight</th></tr></thead>
      <tbody>
        ${d.ingResults.map(r=>`<tr>
          <td>${esc(r.name)}</td>
          <td class="muted">${esc(r.catLabel)}</td>
          <td class="muted">${esc(r.prep)}</td>
          <td class="num">${fmtWeight(r.recipeG)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;

  // Per pet per meal
  html += `<div class="result-section">
    <h3>🐾 Per Pet Per Meal</h3>
    <p class="section-hint" style="margin-bottom:10px">Based on ${state.actualBatchWeight ? 'your actual batch weight' : 'estimated batch weight'}. Update the actual weight above after prepping.</p>
    <table class="data-table">
      <thead><tr><th>Pet</th><th>kcal/day</th><th>Daily Amount</th><th>Per Meal (÷${state.mealsPerDay})</th></tr></thead>
      <tbody>
        ${d.perPet.map(p=>`<tr>
          <td><strong>${esc(p.name||'Pet')}</strong><br><span class="muted">${esc(p.status)}</span></td>
          <td class="num">${p.kcal.toLocaleString()}</td>
          <td class="num">${fmtWeight(p.petDailyG)}</td>
          <td class="num">${fmtWeight(p.petMealG)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;

  // Extras per meal
  if (d.extrasResults.length) {
    const numPets = d.petData.length;
    html += `<div class="result-section">
      <h3>✨ Extras Per Pet Per Meal</h3>
      <table class="data-table">
        <thead><tr><th>Extra</th><th>Per Dog Per Meal</th><th>Notes</th></tr></thead>
        <tbody>
          ${d.extrasResults.map(ex=>`<tr>
            <td>${esc(ex.name)}</td>
            <td class="num">${fmtAmt(ex.amt / state.mealsPerDay, ex.unit)}</td>
            <td class="muted">${esc(ex.note||'')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // BalanceIT supplement section
  const allPetsHaveSupp = d.petData.length > 0 && d.petData.every(p => p.balanceitG && +p.balanceitG > 0);
  const totalSuppDaily = d.petData.reduce((s, p) => s + (+p.balanceitG || 0), 0);
  const totalSuppBatch = totalSuppDaily * state.batchDays;
  const suppClass = allPetsHaveSupp ? 'balanceit confirmed' : 'balanceit';

  html += `<div class="${suppClass}">
    <h4>💊 BalanceIT Supplement</h4>`;
  if (allPetsHaveSupp) {
    html += `<table class="supp-table">
      <tbody>
        ${d.petData.map(p => `<tr>
          <td class="supp-label">${esc(p.name || 'Pet')}</td>
          <td>${(+p.balanceitG).toFixed(2)} g/day</td>
          <td>${(+p.balanceitG * state.batchDays).toFixed(2)} g for ${state.batchDays} day(s)</td>
        </tr>`).join('')}
        <tr><td class="supp-total" colspan="2">Total batch supplement</td><td class="supp-total">${fmtWeight(totalSuppBatch)}</td></tr>
      </tbody>
    </table>
    <p style="margin-top:8px">Batch kcal: <span class="kcal-highlight">${Math.round(d.totalBatchKcal).toLocaleString()} kcal</span> · <a href="https://www.balanceit.com" target="_blank">balanceit.com</a></p>`;
  } else {
    html += `<p>This recipe requires a nutritional supplement to be complete. Visit <a href="https://www.balanceit.com" target="_blank">balanceit.com</a> → <em>Recipe Builder</em> to calculate the exact amount based on your ingredients.<br><br>
    Your batch kcal total: <span class="kcal-highlight">${Math.round(d.totalBatchKcal).toLocaleString()} kcal</span> — have this ready when using their calculator.<br><br>
    <strong>Set per-pet supplement amounts in the pet cards above</strong> to see batch totals here.</p>`;
  }
  html += `</div>`;

  body.innerHTML = html;

  // Shopping list (separate panel)
  const shoppingPanel = $('shoppingPanel');
  const shoppingBody = $('shoppingBody');
  if (shoppingPanel && shoppingBody) {
    shoppingPanel.classList.remove('result-hidden');
    const catOrder = ['Protein','Fat','Carbohydrate','Vegetable','Fruit'];
    const grouped = {};
    d.ingResults.forEach(r => {
      if (!grouped[r.catLabel]) grouped[r.catLabel] = [];
      grouped[r.catLabel].push(r);
    });
    shoppingBody.innerHTML = `${catOrder.filter(c=>grouped[c]).map(c=>`
      <div class="shop-cat">
        <div class="shop-cat-title">${c}s</div>
        ${grouped[c].map(r=>`<div class="shop-item">
          <input type="checkbox">
          <div style="flex:1">
            <div class="shop-item-name">${esc(r.name)}</div>
            <div class="shop-item-prep">${esc(r.prep)}</div>
          </div>
          <div>
            <div class="shop-item-qty shop-qty-link" onclick="event.stopPropagation();adjustPackageSize('${r.cat}','${r.id}','${esc(r.name).replace(/'/g,"\\'")}',${r.purchaseG})">${fmtWeight(r.purchaseG)}</div>
            <div style="font-size:.72rem;color:var(--muted);text-align:right">${r.purchaseRatio < 1 ? 'dry / uncooked' : r.purchaseRatio > 1.05 ? 'raw purchase qty' : 'as used'}</div>
          </div>
        </div>`).join('')}
      </div>`).join('')}
    ${d.extrasResults.length ? `<div class="shop-cat">
      <div class="shop-cat-title">Extras &amp; Enticers</div>
      ${d.extrasResults.map(ex=>`<div class="shop-item">
        <input type="checkbox">
        <div class="shop-item-name" style="flex:1">${esc(ex.name)}</div>
        <div class="shop-item-qty">${fmtAmt(ex.totalAmt, ex.unit)}</div>
      </div>`).join('')}
    </div>` : ''}
    ${allPetsHaveSupp ? `<div class="shop-cat">
      <div class="shop-cat-title">Supplement</div>
      <div class="shop-item">
        <input type="checkbox">
        <div class="shop-item-name" style="flex:1">BalanceIT</div>
        <div class="shop-item-qty">${fmtWeight(totalSuppBatch)}</div>
      </div>
    </div>` : ''}`;
  }

  // Store for re-render
  _lastResults = d;
}

export function updateActualWeight(val) {
  state.actualBatchWeight = val ? +val : null;
  saveState();
  if (_lastResults) {
    const d = _lastResults;
    const actualBatchWeight = state.actualBatchWeight || d.estimatedBatchWeight;
    const actualDailyWeight = actualBatchWeight / state.batchDays;
    d.perPet = d.petData.map(p => {
      const petDailyG = (p.kcal / d.totalDailyKcal) * actualDailyWeight;
      return {...p, petDailyG, petMealG: petDailyG / state.mealsPerDay};
    });
    renderResults({...d, actualBatchWeight});
  }
}

// ── SHOPPING LIST COPY ─────────────────────────────────────────
export function copyShoppingList() {
  if (!_lastResults) return;
  const d = _lastResults;
  const lines = ['TAILMATE — SHOPPING LIST', `Generated: ${new Date().toLocaleDateString()}`, `Batch: ${state.batchDays} days for ${d.petData.length} dog(s)`, ''];
  const catOrder = ['Protein','Fat','Carbohydrate','Vegetable','Fruit'];
  const grouped = {};
  d.ingResults.forEach(r => { if (!grouped[r.catLabel]) grouped[r.catLabel]=[]; grouped[r.catLabel].push(r); });
  catOrder.filter(c=>grouped[c]).forEach(c => {
    lines.push(`── ${c.toUpperCase()}S ──`);
    grouped[c].forEach(r => { lines.push(`☐ ${r.name} [${r.prep}]`); lines.push(`  ${fmtWeight(r.purchaseG)}`); });
    lines.push('');
  });
  if (d.extrasResults.length) {
    lines.push('── EXTRAS & ENTICERS ──');
    d.extrasResults.forEach(ex => { lines.push(`☐ ${ex.name}`); lines.push(`  ${fmtAmt(ex.totalAmt, ex.unit)}`); });
    lines.push('');
  }
  lines.push('── SUPPLEMENT ──');
  const totalSuppCopy = d.petData.reduce((s, p) => s + (+p.balanceitG || 0), 0) * state.batchDays;
  if (totalSuppCopy > 0) {
    lines.push(`☐ BalanceIT — ${fmtWeight(totalSuppCopy)}`);
    d.petData.forEach(p => {
      if (+p.balanceitG > 0) lines.push(`  ${p.name || 'Pet'}: ${(+p.balanceitG).toFixed(2)} g/day`);
    });
  } else {
    lines.push(`☐ BalanceIT (calculate at balanceit.com)`);
  }
  lines.push(`  Total batch kcal: ${Math.round(d.totalBatchKcal).toLocaleString()}`);
  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    const btn = document.querySelector('[onclick="copyShoppingList()"]');
    if (btn) { btn.textContent = '✓ Copied!'; setTimeout(()=>btn.textContent='📋 Copy', 2000); }
  });
}

// ── RECIPES ───────────────────────────────────────────────────
export async function saveRecipe() {
  const nameInput = $('recipeNameInput');
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); await showModal({message:'Please enter a recipe name.'}); return; }
  if (!_lastResults) { await showModal({message:'Calculate a batch first before saving.'}); return; }
  const now = new Date().toISOString();
  const recipe = {
    id: crypto.randomUUID(),
    name,
    savedAt: now,
    updatedAt: now,
    state: JSON.parse(JSON.stringify(state)),
    summary: {
      pets: state.pets.length,
      batchDays: state.batchDays,
      totalBatchKcal: Math.round(_lastResults.totalBatchKcal)
    }
  };
  await StorageAdapter.saveRecipe(recipe);
  nameInput.value = '';
  await loadRecipesList();
}

export async function loadRecipe(id) {
  const recipes = await StorageAdapter.loadRecipes();
  const r = recipes.find(x => x.id === id);
  if (!r) return;
  if (!await showModal({title:'Load Recipe', message:`Load recipe "${esc(r.name)}"? This will replace your current settings.`, confirm:true, confirmText:'Load'})) return;
  replaceState(r.state);
  setPetIdCounter(state.pets.reduce((max,p) => Math.max(max, p.id||0), 0) + 1);
  applyStateToUI();
  window.scrollTo({top:0, behavior:'smooth'});
}

export async function deleteRecipe(id) {
  const recipes = await StorageAdapter.loadRecipes();
  const r = recipes.find(x => x.id === id);
  if (!r) return;
  if (!await showModal({title:'Delete Recipe', message:`Delete recipe "${esc(r.name)}"?`, confirm:true, confirmText:'Delete', cancelText:'Keep'})) return;
  await StorageAdapter.deleteRecipe(id);
  await loadRecipesList();
}

export async function loadRecipesList() {
  const recipes = await StorageAdapter.loadRecipes();
  const el = $('recipesList');
  if (recipes.length === 0) { el.innerHTML = '<div class="empty-state">No saved recipes yet. Calculate a batch, then save it here.</div>'; return; }
  el.innerHTML = `<div class="recipes-list">${recipes.slice().reverse().map(r => `
    <div class="recipe-item">
      <div class="recipe-item-info">
        <div class="recipe-item-name">${esc(r.name)}</div>
        <div class="recipe-item-meta">${r.summary.pets} dog(s) · ${r.summary.batchDays} days · ${r.summary.totalBatchKcal?.toLocaleString()} kcal · Saved ${new Date(r.savedAt).toLocaleDateString()}</div>
      </div>
      <div class="recipe-item-actions">
        <button class="btn btn-secondary btn-sm" onclick="loadRecipe('${r.id}')">Load</button>
        <button class="btn btn-danger" onclick="deleteRecipe('${r.id}')">✕</button>
      </div>
    </div>`).join('')}</div>`;
}

// ── RESET ────────────────────────────────────────────────────
export function resetIngredients() {
  state.sel = { proteins: {}, fats: {}, carbs: {}, vegetables: {}, fruits: {}, extras: {} };
  saveState();
  ['proteins','fats','carbs','vegetables','fruits'].forEach(renderIngredients);
  renderExtras();
}

export function resetBatchSettings() {
  state.batchDays = 7;
  state.mealsPerDay = 2;
  state.macros = {p:45, fa:15, c:20, v:15, f:5};
  $('batchDays').value = 7;
  $('mealsPerDay').value = 2;
  $('mp').value = 45;
  $('mfa').value = 15;
  $('mc').value = 20;
  $('mv').value = 15;
  $('mf').value = 5;
  updateMacro();
}

// ── STATE → UI ─────────────────────────────────────────────────
export function applyStateToUI() {
  $('batchDays').value = state.batchDays;
  $('mealsPerDay').value = state.mealsPerDay;
  $('mp').value = state.macros.p;
  $('mfa').value = state.macros.fa || 0;
  $('mc').value = state.macros.c;
  $('mv').value = state.macros.v;
  $('mf').value = state.macros.f;
  updateMacro();
  renderPets();
  // Default pets panel: closed if pets exist, open if empty
  const petsHdr = $('petsBody')?.previousElementSibling;
  if (petsHdr) {
    if (state.pets.length > 0) {
      petsHdr.classList.remove('open');
      $('petsBody').classList.add('hidden');
    } else {
      petsHdr.classList.add('open');
      $('petsBody').classList.remove('hidden');
    }
  }
  ['proteins','fats','carbs','vegetables','fruits'].forEach(renderIngredients);
  renderExtras();
  loadRecipesList();
}
