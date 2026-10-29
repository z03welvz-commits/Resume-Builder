'use strict';
/* ════════════════════════════════════════════════════════════════
   ATS EXTRAS — extension script
   Loaded AFTER app_1_.js. Everything here is additive: it reads and
   calls the app's existing globals (SAFE_FONTS, state, esc, saveLS,
   renderStep, renderToolbar, showToast, $, etc.) and monkey-patches
   renderPreview() to layer extra behavior on top of it, but it never
   edits app_1_.js itself. Removing this file (and its <script> tag)
   returns the app to exactly its original behavior.

   Adds three things, per the earlier research pass in this
   conversation:
     1. Three more ATS-safe fonts (Cambria, Verdana, Tahoma).
        Garamond is deliberately NOT added — app_1_.js already
        excludes it on purpose (Workday line-width substitution
        issue), and this extension respects that finding rather
        than silently reversing it.
     2. A second, optional layout: "Hybrid — Skills Emphasis",
        which restyles the Skills section into a labeled chip panel
        (still plain single-column text, still ATS-safe) instead of
        changing the app's default Reverse-Chronological layout.
     3. Three sample resumes (original placeholder content, not
        copied from any real person or site) a person can load as a
        starting point, matching the three personas from the
        research: conservative/corporate, tech/skills-forward, and
        career-change/bridging. The sample DATA itself lives in
        sample-resumes.js (loaded before this file) — this file only
        reads it, so updating/replacing samples never touches this
        file.
   ════════════════════════════════════════════════════════════════ */
(function(){

  // ── 1. EXTRA FONTS ──────────────────────────────────────────────
  const EXTRA_FONTS = [
    { id:'cambria', label:'Cambria', family:"'Cambria','Georgia',serif",       pdf:'Roboto', note:'Modern serif, strong ATS parse rate — a fresher alternative to Georgia' },
    { id:'verdana', label:'Verdana', family:"'Verdana','Geneva',sans-serif",   pdf:'Roboto', note:'Built for on-screen readability — runs wide, pairs best with 10–10.5pt body text' },
    { id:'tahoma',  label:'Tahoma',  family:"'Tahoma','Verdana',sans-serif",   pdf:'Roboto', note:'Compact sans, ships on every OS, consistently ATS-safe' },
  ];
  if(typeof SAFE_FONTS !== 'undefined'){
    EXTRA_FONTS.forEach(f => {
      if(!SAFE_FONTS.some(existing => existing.id === f.id)) SAFE_FONTS.push(f);
    });
  }

  // ── 2. HYBRID LAYOUT ────────────────────────────────────────────
  const EXT_LAYOUTS = [
    { id:'standard', label:'Standard — Reverse-Chronological' },
    { id:'hybrid',   label:'Hybrid — Skills Emphasis' },
  ];
  let extLayout = localStorage.getItem('atsExtLayout') || 'standard';

  // Rewrites the already-rendered Skills section (plain "Technical:
  // ..." / "Core Competencies: ..." sentences) into a labeled chip
  // panel, by reading the same state.data.skills the original
  // section was built from — never by scraping rendered text back
  // out, so it can't drift from the real data.
  function extApplyHybridSkills(root){
    if(!root) return;
    const titles = root.querySelectorAll('[data-fit="section-title"]');
    let skillsTitle = null;
    titles.forEach(t => { if(t.textContent.trim() === 'Skills') skillsTitle = t; });
    if(!skillsTitle) return; // no Skills section rendered (nothing filled in yet)

    const toRemove = [];
    let sib = skillsTitle.nextElementSibling;
    while(sib && sib.getAttribute('data-fit') !== 'section-title'){
      toRemove.push(sib);
      sib = sib.nextElementSibling;
    }

    const skills = (typeof state !== 'undefined' && state.data && state.data.skills) || { technical:[], core:[] };
    const chip = (label) => `<span class="ext-skill-chip">${esc(label)}</span>`;
    const row = (label, list) => list.length
      ? `<div class="ext-skills-row"><span class="ext-skills-row-label">${esc(label)}</span><div class="ext-skills-chips">${list.map(chip).join('')}</div></div>`
      : '';

    const panel = document.createElement('div');
    panel.className = 'ext-skills-panel-wrap';
    panel.innerHTML = `
      <div data-fit="section-title" style="font-size:11.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#1c1c1e;border-bottom:1.4px solid #1c1c1e;padding-bottom:3px;margin:16px 0 8px;">Core Skills</div>
      <div class="ext-skills-panel">${row('Technical', skills.technical)}${row('Core', skills.core)}</div>
    `;
    skillsTitle.replaceWith(panel);
    toRemove.forEach(el => el.remove());
  }

  // ── 3. SAMPLE RESUMES ───────────────────────────────────────────
  // Data lives in sample-resumes.js (loaded before this file, see
  // index.html) as the global EXT_SAMPLES. This file only reads it —
  // to update or add a sample, edit sample-resumes.js only.
  if(typeof EXT_SAMPLES === 'undefined'){
    console.error('ats-extras.js: EXT_SAMPLES not found — make sure sample-resumes.js is loaded before this file.');
  }

  // Each sample's DEFAULT look — what the card shows before anyone
  // touches the preview's own font dropdown. Distinct on purpose so
  // the three cards read as genuinely different templates, not the
  // same layout in three colors: a formal serif + standard layout
  // for the conservative/corporate persona, a compact modern sans +
  // the skills-chip Hybrid layout for the skills-forward tech
  // persona (chips suit a long, dense skill list), and a clean
  // universal sans + standard layout for the bridging/career-change
  // persona (safest choice when the resume is doing persuasion work
  // across two different fields). Keyed by sample id, read only —
  // never mutates EXT_SAMPLES itself.
  const EXT_SAMPLE_DEFAULTS = {
    'corporate':     { font: 'georgia',  layout: 'standard' },
    'tech':          { font: 'tahoma',   layout: 'hybrid'   },
    'career-change': { font: 'calibri',  layout: 'standard' },
  };

  window.extLoadSample = function(id){
    const sample = EXT_SAMPLES.find(s => s.id === id);
    const sel = document.getElementById('extSampleSelect');
    if(!sample){ if(sel) sel.value = ''; return; }

    const d = state.data;
    const hasExisting = !!(d.personal.name || d.summary || d.experience.some(e => e.company || e.role));
    if(hasExisting && !confirm(`Load the "${sample.label}" sample? This replaces your current resume content — this can't be undone.`)){
      if(sel) sel.value = '';
      return;
    }

    // Deep clone so repeated loads (or edits afterward) never mutate
    // the shared sample source.
    state.data = JSON.parse(JSON.stringify(sample.data));
    const def = EXT_SAMPLE_DEFAULTS[id];
    if(def){ state.font = def.font; extSetLayout(def.layout); }
    state.currentStep = 0;
    saveLS();
    renderStep();
    renderToolbar();
    showToast(`Loaded sample: ${sample.label}`, 'success');
    if(sel) sel.value = '';
  };

  // ── WIRE IT UP: wrap renderPreview rather than editing it ──────
  const originalRenderPreview = window.renderPreview;
  window.renderPreview = function(){
    originalRenderPreview.apply(this, arguments);
    extRenderControls();
    if(extLayout === 'hybrid'){
      extApplyHybridSkills(document.querySelector('.page-shell-inner'));
    }
  };

  window.extChangeLayout = function(){
    const sel = document.getElementById('extLayoutSelect');
    extSetLayout((sel && sel.value) || 'standard');
  };

  // Single place that actually changes extLayout, so the in-builder
  // <select> (extChangeLayout, above) and the landing-page format
  // cards (extApplyFormatFromLanding, below) can never drift apart.
  function extSetLayout(id){
    extLayout = id === 'hybrid' ? 'hybrid' : 'standard';
    localStorage.setItem('atsExtLayout', extLayout);
    if(typeof renderPreview === 'function') renderPreview(); // re-run through the wrapped function so hybrid re-applies
  }
  // Exposed so other extension scripts (e.g. extensions/ai-import.js,
  // which resets to the Standard layout on import) can change layout
  // through the same single choke point rather than writing
  // localStorage directly and leaving this closure's cached extLayout
  // stale until a reload.
  window.extSetLayout = extSetLayout;

  // Injects the extension's own toolbar row (layout + sample
  // pickers) right after the app's existing .doc-toolbar. Re-run on
  // every renderPreview() call since that call replaces
  // #previewPane's innerHTML wholesale each time.
  function extRenderControls(){
    const toolbar = document.querySelector('#previewPane .doc-toolbar');
    if(!toolbar) return;
    const row = document.createElement('div');
    row.className = 'doc-toolbar-ext';
    row.innerHTML = `
      <span class="doc-toolbar-ext-label">Layout</span>
      <select id="extLayoutSelect" onchange="extChangeLayout()">
        ${EXT_LAYOUTS.map(l => `<option value="${l.id}" ${l.id===extLayout?'selected':''}>${esc(l.label)}</option>`).join('')}
      </select>
      <span class="doc-toolbar-ext-label">Sample</span>
      <select id="extSampleSelect" onchange="extLoadSample(this.value)">
        <option value="">Load a sample…</option>
        ${EXT_SAMPLES.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}
      </select>
    `;
    toolbar.insertAdjacentElement('afterend', row);
  }

  /* ── LANDING PAGE: #formats / #examples sections ──────────────────
     Markup-only in index.html (empty grid divs) — everything inside
     is rendered here. Nothing here applies to the real builder
     directly anymore: every card opens a PREVIEW MODAL first
     (extOpenPreviewModal), which renders through the app's own real
     renderPreview() against a temporarily-swapped `state` — never a
     hand-built lookalike — so the modal can never show something the
     builder wouldn't actually produce. The modal has its own font
     dropdown (scoped to the modal only) and a "Use this template"
     button, which is the ONLY thing that commits font/layout/data to
     the real state and enters the builder. */

  function extRenderFormatsSection(){
    const fontGrid = document.getElementById('extFormatsFontGrid');
    const layoutGrid = document.getElementById('extFormatsLayoutGrid');
    if(!fontGrid || !layoutGrid) return; // section not on this page

    fontGrid.innerHTML = SAFE_FONTS.map(f => `
      <button type="button" class="ext-card ext-card-font" data-font-id="${f.id}" role="listitem" style="font-family:${f.family};">
        <span class="ext-card-name">${esc(f.label)}</span>
        <span class="ext-card-note">${esc(f.note)}</span>
        <span class="ext-card-cta">Preview this font <span aria-hidden="true">→</span></span>
      </button>
    `).join('');

    layoutGrid.innerHTML = EXT_LAYOUTS.map(l => `
      <button type="button" class="ext-card ext-card-layout" data-layout-id="${l.id}" role="listitem">
        <span class="ext-card-name">${esc(l.label)}</span>
        <span class="ext-card-note">${l.id === 'hybrid' ? 'Groups Skills into a labeled chip panel — still plain single-column text underneath.' : 'The default: straight reverse-chronological, one column, nothing to trip a parser.'}</span>
        <span class="ext-card-cta">Preview this layout <span aria-hidden="true">→</span></span>
      </button>
    `).join('');

    fontGrid.querySelectorAll('[data-font-id]').forEach(card => {
      card.addEventListener('click', () => extOpenPreviewModal({ sampleId: EXT_SAMPLES[0]?.id, font: card.dataset.fontId, layout: extLayout }));
    });
    layoutGrid.querySelectorAll('[data-layout-id]').forEach(card => {
      card.addEventListener('click', () => extOpenPreviewModal({ sampleId: EXT_SAMPLES[0]?.id, font: state?.font || 'calibri', layout: card.dataset.layoutId }));
    });
  }

  function extRenderExamplesSection(){
    const grid = document.getElementById('extExamplesGrid');
    if(!grid) return; // section not on this page

    grid.innerHTML = EXT_SAMPLES.map(s => {
      const def = EXT_SAMPLE_DEFAULTS[s.id] || { font: 'calibri', layout: 'standard' };
      const fontMeta = SAFE_FONTS.find(f => f.id === def.font);
      return `
      <button type="button" class="ext-card ext-card-example" data-sample-id="${s.id}" role="listitem">
        <div class="ext-thumb" aria-hidden="true" style="font-family:${fontMeta ? fontMeta.family : 'inherit'};">${extBuildThumb(s.data)}</div>
        <span class="ext-card-name">${esc(s.data.personal.name)}</span>
        <span class="ext-card-role">${esc(s.data.personal.title)}</span>
        <span class="ext-card-note">${esc(s.label)} — ${esc(fontMeta ? fontMeta.label : def.font)}${def.layout === 'hybrid' ? ', Hybrid layout' : ''}</span>
        <span class="ext-card-cta">Preview this template <span aria-hidden="true">→</span></span>
      </button>
    `;
    }).join('');

    grid.querySelectorAll('[data-sample-id]').forEach(card => {
      const id = card.dataset.sampleId;
      const def = EXT_SAMPLE_DEFAULTS[id] || { font: 'calibri', layout: 'standard' };
      card.addEventListener('click', () => extOpenPreviewModal({ sampleId: id, font: def.font, layout: def.layout }));
    });
  }

  // Miniature resume-page preview for an example card. Deliberately
  // NOT a copy of renderPreview()'s markup (that function is scaled
  // for a full A4 page at 10.5pt and isn't meant to be called at
  // thumbnail size) — this reads the exact same sample.data fields
  // but lays them out as a small representative page, so the card
  // shows what the resume actually looks like rather than just
  // naming it. Truncated to the first 2 experience entries so the
  // thumbnail stays a fixed, predictable height across all 3 cards.
  function extBuildThumb(d){
    const contact = (typeof formatContactLine === 'function') ? formatContactLine(d.personal) : [d.personal.email, d.personal.city].filter(Boolean).join(' · ');
    const exp = (d.experience || []).slice(0, 2);
    const skills = [...(d.skills?.technical||[]), ...(d.skills?.core||[])].slice(0, 6);

    const line = (w) => `<div class="ext-thumb-line" style="width:${w}"></div>`;

    let html = `
      <div class="ext-thumb-name">${esc(d.personal.name)}</div>
      <div class="ext-thumb-title">${esc(d.personal.title)}</div>
      <div class="ext-thumb-contact">${esc(contact)}</div>
      <div class="ext-thumb-section">Summary</div>
      ${line('100%')}${line('94%')}${line('60%')}
      <div class="ext-thumb-section">Skills</div>
      <div class="ext-thumb-chips">${skills.map(sk => `<span>${esc(sk)}</span>`).join('')}</div>
      <div class="ext-thumb-section">Experience</div>
    `;
    exp.forEach(e => {
      html += `<div class="ext-thumb-exp-row"><span class="ext-thumb-exp-role">${esc(e.role)}</span><span class="ext-thumb-exp-co">${esc(e.company)}</span></div>${line('88%')}`;
    });
    return html;
  }

  /* ── PREVIEW MODAL ──────────────────────────────────────────────
     One modal serves both Formats cards and Examples cards. It
     always previews a sample's data (defaulting to the first sample
     when opened from a bare font/layout card, since there's nothing
     else to render text from) at a chosen font + layout — all three
     changeable independently via the modal's own controls, none of
     it touching the real `state` until "Use this template" is
     clicked.

     RENDERING STRATEGY: rather than re-implementing renderPreview()'s
     ~90 lines of section-building markup a second time (which could
     silently drift from the real one over time), this temporarily
     points the app's actual `state` at the preview's data/font, calls
     the REAL renderPreview(), captures the resulting page-shell HTML,
     then restores the original `state` and re-renders it back into
     #previewPane. The modal never leaves a trace in the real state
     and never calls saveLS(), so nothing persists until "Use this
     template" is explicitly clicked. */

  let extModalState = null; // { sampleId, font, layout }

  /* ── FOCUS TRAP — same rationale as ai-import.js's own trap: Tab
     shouldn't be able to leave this dialog into the page behind it,
     and Escape should close it. Attached to `document` rather than the
     modal element because extRenderModal() rebuilds the modal's entire
     innerHTML every time the font/layout/sample select changes — a
     listener on the modal node itself would be destroyed by that; this
     one re-queries the current .ext-modal fresh on every keypress. */
  const EXT_FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let _extModalPrevActiveEl = null;
  function extFocusTrapKeydown(e){
    const modal = document.querySelector('.ext-modal');
    if(!modal) return;
    if(e.key === 'Escape'){ e.preventDefault(); extCloseModal(); return; }
    if(e.key !== 'Tab') return;
    const focusables = Array.from(modal.querySelectorAll(EXT_FOCUSABLE_SELECTOR)).filter(el => el.offsetParent !== null);
    if(!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    else if(!modal.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
  }

  function extOpenPreviewModal({ sampleId, font, layout }){
    const sample = EXT_SAMPLES.find(s => s.id === sampleId) || EXT_SAMPLES[0];
    if(!sample) return;
    extModalState = { sampleId: sample.id, font: font || 'calibri', layout: layout || 'standard' };
    extRenderModal();
    document.body.classList.add('ext-modal-open');
    _extModalPrevActiveEl = document.activeElement;
    document.addEventListener('keydown', extFocusTrapKeydown);
    document.getElementById('extModalCloseBtn')?.focus();
  }

  function extCloseModal(){
    document.body.classList.remove('ext-modal-open');
    const host = document.getElementById('extModalHost');
    if(host) host.innerHTML = '';
    extModalState = null;
    document.removeEventListener('keydown', extFocusTrapKeydown);
    if(_extModalPrevActiveEl && typeof _extModalPrevActiveEl.focus === 'function') _extModalPrevActiveEl.focus();
    _extModalPrevActiveEl = null;
  }

  window.extModalChangeFont = function(){
    const sel = document.getElementById('extModalFontSelect');
    if(!extModalState || !sel) return;
    extModalState.font = sel.value;
    extRenderModal();
  };

  window.extModalChangeLayout = function(){
    const sel = document.getElementById('extModalLayoutSelect');
    if(!extModalState || !sel) return;
    extModalState.layout = sel.value;
    extRenderModal();
  };

  window.extModalChangeSample = function(){
    const sel = document.getElementById('extModalSampleSelect');
    if(!extModalState || !sel) return;
    extModalState.sampleId = sel.value;
    extRenderModal();
  };

  // Builds the actual preview markup by borrowing the app's real
  // renderPreview() — see the strategy note above. Returns the
  // .page-shell-inner HTML string (font-family applied) plus the
  // hybrid transform already applied when relevant, so it's pixel-
  // identical to what the builder would show for these exact inputs.
  function extRenderRealPreviewHTML(sample, font, layout){
    if(typeof state === 'undefined' || typeof renderPreview !== 'function') return '';

    const savedData = state.data;
    const savedFont = state.font;
    const savedStep = state.currentStep;
    const savedLayout = extLayout;

    state.data = JSON.parse(JSON.stringify(sample.data));
    state.font = font;
    extLayout = layout; // read directly by the wrapped renderPreview()'s hybrid check below — restored below

    renderPreview(); // real app function (already wrapped by this extension, so hybrid applies automatically when extLayout === 'hybrid')
    const rendered = document.querySelector('#previewPane .page-shell-inner');
    const html = rendered ? rendered.outerHTML : '';

    // Restore real state exactly as it was — this function must never
    // leave a trace, since the modal can be opened while a person's
    // in-progress resume is still loaded in the background builder.
    state.data = savedData;
    state.font = savedFont;
    state.currentStep = savedStep;
    extLayout = savedLayout;
    if(document.getElementById('previewPane')) renderPreview(); // repaint the real preview back to the real state

    return html;
  }

  function extRenderModal(){
    const host = document.getElementById('extModalHost');
    if(!host || !extModalState) return;
    const sample = EXT_SAMPLES.find(s => s.id === extModalState.sampleId) || EXT_SAMPLES[0];
    const previewHTML = extRenderRealPreviewHTML(sample, extModalState.font, extModalState.layout);

    host.innerHTML = `
      <div class="ext-modal-backdrop" id="extModalBackdrop"></div>
      <div class="ext-modal" role="dialog" aria-modal="true" aria-label="Template preview">
        <div class="ext-modal-head">
          <div class="ext-modal-controls">
            <label class="ext-modal-label">Template
              <select id="extModalSampleSelect" onchange="extModalChangeSample()">
                ${EXT_SAMPLES.map(s => `<option value="${s.id}" ${s.id===extModalState.sampleId?'selected':''}>${esc(s.label)}</option>`).join('')}
              </select>
            </label>
            <label class="ext-modal-label">Font
              <select id="extModalFontSelect" onchange="extModalChangeFont()">
                ${SAFE_FONTS.map(f => `<option value="${f.id}" ${f.id===extModalState.font?'selected':''}>${esc(f.label)}</option>`).join('')}
              </select>
            </label>
            <label class="ext-modal-label">Layout
              <select id="extModalLayoutSelect" onchange="extModalChangeLayout()">
                ${EXT_LAYOUTS.map(l => `<option value="${l.id}" ${l.id===extModalState.layout?'selected':''}>${esc(l.label)}</option>`).join('')}
              </select>
            </label>
          </div>
          <button type="button" class="ext-modal-close" id="extModalCloseBtn" aria-label="Close preview">✕</button>
        </div>
        <div class="ext-modal-body">
          <div class="ext-modal-page-shell">${previewHTML}</div>
        </div>
        <div class="ext-modal-foot">
          <span class="ext-modal-foot-note">Nothing is applied until you choose to use this template.</span>
          <button type="button" class="btn btn-primary" id="extModalUseBtn">Use this template <span aria-hidden="true">→</span></button>
        </div>
      </div>
    `;

    document.getElementById('extModalCloseBtn')?.addEventListener('click', extCloseModal);
    document.getElementById('extModalBackdrop')?.addEventListener('click', extCloseModal);
    document.getElementById('extModalUseBtn')?.addEventListener('click', extCommitModalTemplate);
  }

  // The ONLY function that commits a previewed template to the real
  // builder state. Mirrors extLoadSample's data-load + confirm logic
  // (never bypasses the "this replaces your current resume" check)
  // but also carries over the font/layout chosen in the modal, which
  // extLoadSample alone doesn't know about.
  function extCommitModalTemplate(){
    if(!extModalState) return;
    const sample = EXT_SAMPLES.find(s => s.id === extModalState.sampleId);
    if(!sample) return;

    const d = state.data;
    const hasExisting = !!(d.personal.name || d.summary || d.experience.some(e => e.company || e.role));
    if(hasExisting && !confirm(`Use the "${sample.label}" template? This replaces your current resume content — this can't be undone.`)){
      return;
    }

    state.data = JSON.parse(JSON.stringify(sample.data));
    state.font = extModalState.font;
    extSetLayout(extModalState.layout);
    state.currentStep = 0;
    saveLS();

    extCloseModal();
    if(typeof enterBuilder === 'function') enterBuilder();
    if(typeof showToast === 'function') showToast(`Using template: ${sample.label}`, 'success');
  }

  document.addEventListener('DOMContentLoaded', () => {
    extRenderFormatsSection();
    extRenderExamplesSection();
  });

})();
