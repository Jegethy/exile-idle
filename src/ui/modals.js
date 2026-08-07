// modals — Modal plumbing, the confirm dialog, save slots and the settings sheet.

import { returnToTitle } from '../splash.js';
import { G, createState, log, on } from '../state.js';
import { escapeHtml, fmtTime, qs, qsa } from '../util.js';
import * as Save from '../save.js';
const { AUTOSAVE_SECONDS } = Save;
import { setStatus } from './shell.js';
import { ui } from './state.js';
import { AUTO_DISMISS_SECONDS } from '../reports.js';


// ===========================================================================
// Modals
// ===========================================================================

export function openModal(id) {
  qs('#modalBackdrop').classList.remove('hidden');
  qsa('.modal').forEach((m) => m.classList.toggle('hidden', m.id !== id));
}

export function closeModals() {
  qs('#modalBackdrop').classList.add('hidden');
  qsa('.modal').forEach((m) => m.classList.add('hidden'));
}

export function wireModals() {
  qsa('.modal-close').forEach((b) => { b.onclick = closeModals; });
  qs('#modalBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') closeModals();
  });
  qs('#btnExport').onclick = () => { qs('#saveText').value = Save.exportSave(); setStatus('Save exported.'); };
  qs('#btnCopy').onclick = async () => {
    const box = qs('#saveText');
    if (!box.value) box.value = Save.exportSave();
    try { await navigator.clipboard.writeText(box.value); setStatus('Copied to clipboard.'); }
    catch { box.select(); setStatus('Press Ctrl+C to copy.'); }
  };
  qs('#btnImport').onclick = () => {
    const text = qs('#saveText').value;
    confirmAction('Import this save?', 'Your current guild will be replaced.', () => {
      try { Save.importSave(text); Save.saveToSlot(G.slot, true); closeModals(); log('Save imported.', 'sys'); }
      catch (e) { setStatus(`Import failed: ${e.message}`); }
    });
  };
  qs('#btnDownload').onclick = () => Save.downloadSave();
  qs('#fileInput').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await Save.uploadSave(file); Save.saveToSlot(G.slot, true); closeModals(); log('Save file loaded.', 'sys'); }
    catch (err) { setStatus(`Could not load file: ${err.message}`); }
    e.target.value = '';
  };

  qs('#btnConfirmNo').onclick = () => { ui.confirmCb = null; closeModals(); };
  qs('#btnConfirmYes').onclick = () => {
    const cb = ui.confirmCb;
    ui.confirmCb = null;
    closeModals();
    if (cb) cb();
  };

  qs('#btnTitle').onclick = () => {
    Save.saveToSlot(G.slot, true);
    closeModals();
    returnToTitle();
  };
}

export function confirmAction(title, text, cb) {
  qs('#confirmTitle').textContent = title;
  qs('#confirmText').textContent = text;
  ui.confirmCb = cb;
  openModal('modalConfirm');
}

export function renderSlots() {
  const host = qs('#slotList');
  if (!host) return;
  host.innerHTML = Save.listSlots().map((s) => {
    if (s.empty) {
      return `<div class="slot-card"><div class="si"><div class="sn">Slot ${s.slot + 1}</div>
        <div class="sd">Empty</div></div>
        <div class="sa"><button class="btn tiny" data-save="${s.slot}">Save Here</button></div></div>`;
    }
    if (s.corrupt) {
      return `<div class="slot-card"><div class="si"><div class="sn">Slot ${s.slot + 1}</div>
        <div class="sd">Corrupt data</div></div>
        <div class="sa"><button class="btn tiny danger" data-del="${s.slot}">Delete</button></div></div>`;
    }
    const when = s.savedAt ? new Date(s.savedAt).toLocaleString() : 'unknown';
    return `<div class="slot-card ${s.slot === G.slot ? 'current' : ''}">
      <div class="si">
        <div class="sn">Slot ${s.slot + 1} — ${escapeHtml(s.name)}</div>
        <div class="sd">Guild ${s.level} · ${s.heroes ?? 0} heroes · Tier ${s.tier} · ${fmtTime(s.playtime)}</div>
        <div class="sd">${when}</div>
      </div>
      <div class="sa">
        <button class="btn tiny" data-load="${s.slot}">Load</button>
        <button class="btn tiny" data-save="${s.slot}">Overwrite</button>
        <button class="btn tiny danger" data-del="${s.slot}">Delete</button>
      </div></div>`;
  }).join('');

  host.onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.save !== undefined) { Save.saveToSlot(Number(btn.dataset.save)); renderSlots(); }
    else if (btn.dataset.load !== undefined) {
      const slot = Number(btn.dataset.load);
      confirmAction('Load this save?', 'Unsaved progress will be lost.', () => {
        if (Save.loadSlot(slot)) { closeModals(); log(`Loaded slot ${slot + 1}.`, 'sys'); }
      });
    } else if (btn.dataset.del !== undefined) {
      const slot = Number(btn.dataset.del);
      confirmAction('Delete this save?', 'This permanently erases that guild.', () => {
        Save.deleteSlot(slot); renderSlots(); openModal('modalSaves');
      });
    }
  };
}

// ===========================================================================
// Settings
// ===========================================================================

function toggleRow(key, label, hint) {
  const on = G.state.settings[key];
  return `<div class="setting-row">
    <div><div class="sl">${label}</div><div class="sh">${hint}</div></div>
    <label class="switch"><input type="checkbox" data-set="${key}" ${on ? 'checked' : ''}><i></i></label>
  </div>`;
}

export function renderSettings() {
  const host = qs('#settingsBody');
  if (!host || !G.state) return;
  const s = G.state;
  host.innerHTML = `
    ${toggleRow('autoSalvageNormal', 'Auto-salvage Normal drops', 'Normal items are broken down for materials on pickup.')}
    ${toggleRow('autoSalvageMagic', 'Auto-salvage Magic drops', 'Magic items are broken down for materials on pickup.')}
    ${toggleRow('autoSalvageRare', 'Auto-salvage Rare drops', 'Rare items are broken down for materials. Uniques are never auto-salvaged.')}
    ${toggleRow('hideCompWarnings', 'Hide party composition warnings',
    'Stops the no-tank and no-healer notices. Party makeup is never enforced.')}
    ${toggleRow('hideReports', 'Hide expedition summaries',
    'Runs finish without the after-action card. Parties on auto-redeploy still pause '
    + `${AUTO_DISMISS_SECONDS} seconds between expeditions, so nothing changes about how fast they go.`)}
    <div class="setting-row">
      <div><div class="sl">Simulation speed</div><div class="sh">Higher is faster but coarser.</div></div>
      <select class="text-input" style="width:auto" id="setSpeed">
        ${[0.5, 1, 2, 3, 5].map((v) => `<option value="${v}" ${s.settings.speed === v ? 'selected' : ''}>${v}×</option>`).join('')}
      </select>
    </div>
    <div class="setting-row">
      <div><div class="sl">Log length</div><div class="sh">Lines kept in memory.</div></div>
      <select class="text-input" style="width:auto" id="setLog">
        ${[100, 200, 500, 1000].map((v) => `<option value="${v}" ${s.settings.logLimit === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
    </div>
    <div class="section-head"><span>Saving</span></div>
    <div class="setting-row">
      <div><div class="sl">This guild is saved automatically</div>
        <div class="sh">Every ${AUTOSAVE_SECONDS} seconds, when the tab loses focus, and when you close it.
          Saving by hand is almost never necessary — the button is here for the moment before you
          try something you might regret.</div></div>
      <button class="btn" id="btnSaveNow">Save Now</button>
    </div>
    <div class="setting-row">
      <div><div class="sl">Guild slots</div>
        <div class="sh">Three slots, plus export and import. Switch guilds, back one up, or start
          another without losing this one.</div></div>
      <button class="btn" id="btnOpenSaves">Manage Saves</button>
    </div>
    <div class="section-head"><span>Danger Zone</span></div>
    <div class="row"><button class="btn danger" id="btnWipe">Delete This Guild</button></div>`;

  qs('#btnSaveNow').onclick = () => {
    Save.saveToSlot(G.slot);
    setStatus('Saved.');
  };
  qs('#btnOpenSaves').onclick = () => { renderSlots(); openModal('modalSaves'); };

  host.onchange = (e) => {
    const t = e.target;
    if (t.dataset.set) s.settings[t.dataset.set] = t.checked;
    else if (t.id === 'setSpeed') s.settings.speed = Number(t.value);
    else if (t.id === 'setLog') s.settings.logLimit = Number(t.value);
  };
  qs('#btnWipe').onclick = () => confirmAction(
    'Delete this guild?',
    `Slot ${G.slot + 1} will be erased permanently and you will be returned to the title screen. `
    + 'Export a copy first if you might want it back.',
    () => {
      Save.deleteSlot(G.slot);
      G.state = createState();
      G.paused = true;
      closeModals();
      returnToTitle();
    },
  );
}
