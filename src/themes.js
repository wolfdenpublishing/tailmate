// ── THEMES ───────────────────────────────────────────────────────────────────
// Each theme maps the 4 Figma palette colors to CSS variable roles.
// swatch: shown in header picker. vars: CSS variables to apply.
import { StorageAdapter } from './storage.js';

export const THEMES = {
  'stormy-morning': {
    label: 'Stormy Morning', swatch: '#384959',
    vars: {'--bg':'#f0f4f8','--panel-alt':'#e2ecf5','--border':'#b8cede',
           '--accent':'#384959','--accent2':'#6A89A7','--amber':'#6A89A7',
           '--text':'#1a2530','--muted':'#556b7d','--sh':'0 2px 10px rgba(20,40,60,.10)'}
  },
  'mossy-hollow': {
    label: 'Mossy Hollow', swatch: '#3D4127',
    vars: {'--bg':'#f5f7ef','--panel-alt':'#e8edd8','--border':'#c5d0a0',
           '--accent':'#3D4127','--accent2':'#636B2F','--amber':'#636B2F',
           '--text':'#252a14','--muted':'#636B2F','--sh':'0 2px 10px rgba(30,40,10,.09)'}
  },
  // NOTE: Chili Spice hex codes approximated from Figma description ("chili red monochromatic").
  // Replace with exact values from figma.com/color-palettes/chili-spice/
  'chili-spice': {
    label: 'Chili Spice', swatch: '#8B1A1A',
    vars: {'--bg':'#fff5f5','--panel-alt':'#ffe8e8','--border':'#f0c0c0',
           '--accent':'#8B1A1A','--accent2':'#A01818','--amber':'#D03030',
           '--text':'#2a0808','--muted':'#804040','--sh':'0 2px 10px rgba(80,10,10,.10)'}
  },
  'ink-wash': {
    label: 'Ink Wash', swatch: '#252525',
    vars: {'--bg':'#f5f5f5','--panel-alt':'#ebebeb','--border':'#d0d0d0',
           '--accent':'#252525','--accent2':'#545454','--amber':'#545454',
           '--text':'#1a1a1a','--muted':'#7D7D7D','--sh':'0 2px 10px rgba(0,0,0,.12)'}
  },
  'golden-taupe': {
    label: 'Golden Taupe', swatch: '#CE8946',
    vars: {'--bg':'#fefef5','--panel-alt':'#faf5e0','--border':'#e8dca0',
           '--accent':'#CE8946','--accent2':'#BDB76B','--amber':'#D4AF37',
           '--text':'#2a2010','--muted':'#8a7840','--sh':'0 2px 10px rgba(60,40,0,.09)'}
  },
  'wisteria-bloom': {
    label: 'Wisteria Bloom', swatch: '#9400D3',
    vars: {'--bg':'#faf5ff','--panel-alt':'#f0e8ff','--border':'#d8c0f0',
           '--accent':'#9400D3','--accent2':'#7B00AA','--amber':'#ED80E9',
           '--text':'#2a0a40','--muted':'#8040a0','--sh':'0 2px 10px rgba(60,0,100,.09)'}
  },
  'spiced-chai': {
    label: 'Spiced Chai', swatch: '#825E34',
    vars: {'--bg':'#fefdf5','--panel-alt':'#fdf0d8','--border':'#e8d0a0',
           '--accent':'#825E34','--accent2':'#8D5A2B','--amber':'#D47E30',
           '--text':'#2a1808','--muted':'#8D5A2B','--sh':'0 2px 10px rgba(60,30,10,.09)'}
  },
  'california-beaches': {
    label: 'California Beaches', swatch: '#7D99AA',
    vars: {'--bg':'#f0faff','--panel-alt':'#daf2ff','--border':'#a0d8f0',
           '--accent':'#7D99AA','--accent2':'#5a7a8a','--amber':'#FFC067',
           '--text':'#1a3040','--muted':'#5a7a8a','--sh':'0 2px 10px rgba(0,50,80,.09)'}
  },
  'sunny-day': {
    label: 'Sunny Day', swatch: '#807040',
    vars: {'--bg':'#fffef0','--panel-alt':'#fff8d0','--border':'#e8d880',
           '--accent':'#807040','--accent2':'#6a5c32','--amber':'#FFBF00',
           '--text':'#2a2010','--muted':'#807040','--sh':'0 2px 10px rgba(50,40,0,.09)'}
  },
  'retro-sunset': {
    label: 'Retro Sunset', swatch: '#B7410E',
    vars: {'--bg':'#fff8f0','--panel-alt':'#ffeedd','--border':'#f0c898',
           '--accent':'#B7410E','--accent2':'#BE5103','--amber':'#FFCE1B',
           '--text':'#2a1008','--muted':'#A06030','--sh':'0 2px 10px rgba(80,20,0,.09)'}
  },
  'alchemical-reaction': {
    label: 'Alchemical Reaction', swatch: '#5B8040',
    vars: {'--bg':'#f8fff0','--panel-alt':'#eeffd8','--border':'#c0e890',
           '--accent':'#5B8040','--accent2':'#4a6832','--amber':'#DE811D',
           '--text':'#1a2a08','--muted':'#5B8040','--sh':'0 2px 10px rgba(20,50,0,.09)'}
  },
};

export const DEFAULT_THEME = 'stormy-morning';

export function applyTheme(id) {
  const theme = THEMES[id];
  if (!theme) return;
  const root = document.documentElement.style;
  Object.entries(theme.vars).forEach(([k,v]) => root.setProperty(k, v));
  // Update trigger swatch color
  const trigger = document.getElementById('themeTrigger');
  if (trigger) trigger.style.background = theme.swatch;
  // Update menu active state
  document.querySelectorAll('.theme-menu-item').forEach(item => {
    item.classList.toggle('active', item.dataset.theme === id);
  });
  // Close dropdown
  const menu = document.getElementById('themeMenu');
  if (menu) menu.classList.remove('open');
  // Always save locally (instant feedback)
  localStorage.setItem('tailmate_theme', id);
  // Additionally save to Firestore when signed in (fire-and-forget)
  if (StorageAdapter.provider === 'firestore') {
    try {
      /* global firebase, db */
      const uid = firebase.auth().currentUser?.uid;
      if (uid) {
        db.collection('users').doc(uid)
          .set({ theme: id }, { merge: true })
          .catch(e => console.warn('[TailMate] Theme save to Firestore failed', e));
      }
    } catch (e) {
      console.warn('[TailMate] Theme save error', e);
    }
  }
}

export function toggleThemeDropdown(e) {
  e.stopPropagation();
  const menu = document.getElementById('themeMenu');
  if (menu) menu.classList.toggle('open');
}

let _clickListenerAdded = false;

export async function renderThemePicker() {
  const picker = document.getElementById('themePicker');
  if (!picker) return;
  picker.className = 'theme-dropdown';
  picker.innerHTML = `<button class="theme-trigger" id="themeTrigger" onclick="toggleThemeDropdown(event)" title="Change theme">🎨</button>
    <div class="theme-menu" id="themeMenu">
      ${Object.entries(THEMES).map(([id, t]) =>
        `<div class="theme-menu-item" data-theme="${id}" onclick="applyTheme('${id}')">
          <span class="tm-swatch" style="background:${t.swatch}"></span>${t.label}
        </div>`
      ).join('')}
    </div>`;
  // Close dropdown when clicking outside
  if (!_clickListenerAdded) {
    document.addEventListener('click', () => {
      const menu = document.getElementById('themeMenu');
      if (menu) menu.classList.remove('open');
    });
    _clickListenerAdded = true;
  }
  // Load saved theme: prefer Firestore when signed in
  let saved = null;
  if (StorageAdapter.provider === 'firestore') {
    try {
      const uid = firebase.auth().currentUser?.uid;
      if (uid) {
        const snap = await db.collection('users').doc(uid).get();
        saved = snap.data()?.theme;
      }
    } catch (e) {
      console.warn('[TailMate] Theme load from Firestore failed', e);
    }
  }
  if (!saved) saved = localStorage.getItem('tailmate_theme') || DEFAULT_THEME;
  applyTheme(saved);
}
