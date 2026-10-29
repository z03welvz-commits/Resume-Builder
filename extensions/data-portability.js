'use strict';
/* ════════════════════════════════════════════════════════════════
   DATA PORTABILITY — extension script
   Loaded AFTER app_1_.js and ai-import.js. Adds two things: "Export
   JSON" (downloads the current resume as a .json file) and "Import
   JSON" (loads a previously-exported file back in). Everything the
   app knows about a resume lives in one browser's localStorage today
   (see saveLS()/loadLS() in app_1_.js) — there is no way to back it
   up, move it to another device/browser, or keep more than one
   tailored version around. This closes that gap without touching
   app_1_.js: it reads the same state/saveLS/newExperience()-etc.
   globals every other extension in this app already reads.

   FILE FORMAT: a small envelope around the exact same { font, data }
   shape saveLS() already persists —
     { app:'ResumeBuilder', version:1, exportedAt:<ISO>, font, data }
   — so a re-import never has to guess the shape; it's the same shape
   this app already trusts from localStorage every page load.
   ════════════════════════════════════════════════════════════════ */
(function(){

  function sanitizeFilenamePart(s){
    return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function downloadJSON(filename, obj){
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.dpExportJSON = function(){
    if(typeof state === 'undefined') return;
    const namePart = sanitizeFilenamePart(state.data.personal.name) || 'resume';
    const envelope = {
      app: 'ResumeBuilder',
      version: 1,
      exportedAt: new Date().toISOString(),
      font: state.font,
      data: state.data,
    };
    downloadJSON(`${namePart}-resume.json`, envelope);
    if(typeof showToast === 'function') showToast('Resume exported as JSON.', 'success');
  };

  // Fills in the app's own new*() factory defaults for any missing/
  // malformed field, the same defensive-merge spirit loadLS() already
  // uses for localStorage and normalizeParsedResume() uses for a pasted
  // AI resume — so a file from an older export, or one someone hand-
  // edited and broke slightly, still loads instead of crashing the app.
  function normalizeImportedData(raw){
    raw = raw || {};
    const p = raw.personal || {};
    const personal = {
      name: String(p.name || ''), title: String(p.title || ''), email: String(p.email || ''),
      phone: String(p.phone || ''), city: String(p.city || ''), linkedin: String(p.linkedin || ''),
      portfolio: String(p.portfolio || ''),
    };
    const skillsRaw = raw.skills || {};
    const skills = {
      technical: Array.isArray(skillsRaw.technical) ? skillsRaw.technical.map(String) : [],
      core: Array.isArray(skillsRaw.core) ? skillsRaw.core.map(String) : [],
    };
    const fillList = (list, factory) => (Array.isArray(list) && list.length ? list : [null]).map(item => ({ ...factory(), ...(item || {}) }));
    return {
      personal, summary: String(raw.summary || ''), skills,
      experience: fillList(raw.experience, newExperience),
      projects: fillList(raw.projects, newProject),
      education: fillList(raw.education, newEducation),
      certifications: fillList(raw.certifications, newCertification),
      jd: typeof raw.jd === 'string' ? raw.jd : '',
    };
  }

  function commitImportedFile(parsed){
    if(!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object'){
      showToast("That file doesn't look like a resume export from this app.", 'error');
      return;
    }
    const d = state.data;
    const hasExisting = !!(d.personal.name || d.summary || d.experience.some(e => e.company || e.role));
    if(hasExisting && !confirm('Import this file? This replaces your current resume content — this can\'t be undone.')){
      return;
    }

    state.data = normalizeImportedData(parsed.data);
    if(parsed.font && typeof SAFE_FONTS !== 'undefined' && SAFE_FONTS.some(f => f.id === parsed.font)){
      state.font = parsed.font;
    }
    state.currentStep = 0;
    saveLS();

    if(typeof enterBuilder === 'function') enterBuilder();
    if(typeof renderStep === 'function') renderStep();
    if(typeof renderToolbar === 'function') renderToolbar();
    showToast('Resume imported from file.', 'success');
  }

  window.dpOpenImportPicker = function(){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.remove();
      if(!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try{
          commitImportedFile(JSON.parse(reader.result));
        }catch(e){
          showToast("Could not read that file — is it a resume JSON export from this app?", 'error');
        }
      };
      reader.onerror = () => showToast('Could not read that file.', 'error');
      reader.readAsText(file);
    });
    document.body.appendChild(input);
    input.click();
  };

  /* ── WIRE UP ENTRY POINTS ─────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('heroImportFileBtn')?.addEventListener('click', dpOpenImportPicker);
  });

  // Same technique ai-import.js already uses for its own toolbar
  // button: renderToolbar() rebuilds toolbarRight's innerHTML wholesale
  // on every step change, so the buttons are injected after each
  // rebuild rather than editing app_1_.js. Wraps whatever renderToolbar
  // currently is (already wrapped once by ai-import.js, if that script
  // loaded first per index.html's <script> order) — chaining through
  // _origRenderToolbar preserves every earlier wrapper's own injections.
  const _origRenderToolbar = window.renderToolbar;
  if(typeof _origRenderToolbar === 'function'){
    window.renderToolbar = function(){
      _origRenderToolbar.apply(this, arguments);
      const right = document.getElementById('toolbarRight');
      if(!right) return;
      if(!document.getElementById('dpExportBtn')){
        const btn = document.createElement('button');
        btn.className = 'btn btn-ghost';
        btn.id = 'dpExportBtn';
        btn.textContent = '↓ Export JSON';
        btn.title = 'Download this resume as a JSON file — for backup, or to move it to another browser/device';
        btn.addEventListener('click', dpExportJSON);
        right.insertBefore(btn, right.firstChild);
      }
      if(!document.getElementById('dpImportBtn')){
        const btn = document.createElement('button');
        btn.className = 'btn btn-ghost';
        btn.id = 'dpImportBtn';
        btn.textContent = '↑ Import JSON';
        btn.title = 'Load a previously-exported resume JSON file';
        btn.addEventListener('click', dpOpenImportPicker);
        right.insertBefore(btn, right.firstChild);
      }
    };
  }

})();
