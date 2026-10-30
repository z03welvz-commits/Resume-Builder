'use strict';
/* ════════════════════════════════════════════════════════════════
   PRINT TEMPLATES — extension script
   Loaded AFTER ats-extras.js. Additive, like the other extensions:
   it wraps renderPreview() / getFont() / getFormatChecks() rather than
   editing app_1_.js, and removing this file (and its <script>/<link>
   tags in index.html) returns the app to its previous behavior.

   What it adds
     • Four modern templates meant for PAPER (physical applications):
       Sidebar, Executive, Banner, Timeline. They use colour, columns
       and a wider choice of typefaces, so they are deliberately NOT
       ATS-optimised. "Classic" (the app's original layout) stays the
       default and is the one to use for online applications.
     • A six-colour accent picker for the print templates.
     • Eight extra "print fonts" (loaded from Google Fonts only once a
       print template is first used), shown beside the ATS-safe fonts.

   Same data, same rules
     Templates read state.data through the app's own helpers (esc,
     hasContent, formatDateRange, getContactParts, …), keep the
     data-fit="body|section-title|item-gap" markers so the existing
     one-page auto-fit and page-break rules keep working, and force
     print-color-adjust so backgrounds print without the browser's
     "Background graphics" box being ticked.

   Honesty
     The ATS checks are wrapped so a two-column layout or a decorative
     font is reported as such, instead of the original hard-coded
     "Single-column layout ✓".
   ════════════════════════════════════════════════════════════════ */
(function(){

  if(typeof state === 'undefined' || typeof renderPreview !== 'function' || typeof esc !== 'function'){
    console.error('print-templates.js: app_1_.js globals not found — load this file after app_1_.js and ats-extras.js.');
    return;
  }

  /* ── persistence (per browser, same approach as ats-extras' layout) ── */
  const LS_TEMPLATE = 'printTemplate';
  const LS_ACCENT = 'printAccent';
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }

  /* ── print fonts ── */
  const PRINT_FONTS = [
    { id:'inter',        label:'Inter',            family:"'Inter','Segoe UI','Helvetica Neue',Arial,sans-serif",   gf:'Inter:wght@400;500;600;700' },
    { id:'poppins',      label:'Poppins',          family:"'Poppins','Segoe UI','Helvetica Neue',Arial,sans-serif", gf:'Poppins:wght@400;500;600;700' },
    { id:'montserrat',   label:'Montserrat',       family:"'Montserrat','Segoe UI','Helvetica Neue',Arial,sans-serif", gf:'Montserrat:wght@400;500;600;700' },
    { id:'lato',         label:'Lato',             family:"'Lato','Segoe UI','Helvetica Neue',Arial,sans-serif",    gf:'Lato:wght@400;700' },
    { id:'sourcesans',   label:'Source Sans 3',    family:"'Source Sans 3','Segoe UI','Helvetica Neue',Arial,sans-serif", gf:'Source+Sans+3:wght@400;600;700' },
    { id:'lora',         label:'Lora',             family:"'Lora','Georgia','Times New Roman',serif",               gf:'Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500' },
    { id:'merriweather', label:'Merriweather',     family:"'Merriweather','Georgia','Times New Roman',serif",       gf:'Merriweather:ital,wght@0,400;0,700;1,400' },
    { id:'playfair',     label:'Playfair Display', family:"'Playfair Display','Georgia','Times New Roman',serif",   gf:'Playfair+Display:wght@500;600;700' },
  ];
  const PLAYFAIR_STACK = "'Playfair Display','Georgia','Times New Roman',serif";
  function isPrintFont(id){ return PRINT_FONTS.some(f => f.id === id); }

  // Web fonts are only requested the first time a print template is shown,
  // so the Classic/ATS path never makes the extra request.
  let fontsRequested = false;
  function ensureFonts(){
    if(fontsRequested) return;
    fontsRequested = true;
    try{
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?' + PRINT_FONTS.map(f => 'family=' + f.gf).join('&') + '&display=swap';
      document.head.appendChild(link);
    }catch(e){ /* offline / blocked: fallback stacks above still look fine */ }
  }

  /* ── accent colours (all dark enough for white text, ≥ 5:1) ── */
  const ACCENTS = [
    { id:'navy',     label:'Navy',     hex:'#1f3a5f' },
    { id:'teal',     label:'Teal',     hex:'#0f766e' },
    { id:'forest',   label:'Forest',   hex:'#2f6b3f' },
    { id:'burgundy', label:'Burgundy', hex:'#8a1c3a' },
    { id:'indigo',   label:'Indigo',   hex:'#3730a3' },
    { id:'charcoal', label:'Charcoal', hex:'#27272a' },
  ];
  let accentId = (() => { const s = lsGet(LS_ACCENT); return ACCENTS.some(a => a.id === s) ? s : 'navy'; })();
  function currentAccent(){ return ACCENTS.find(a => a.id === accentId) || ACCENTS[0]; }

  /* ── small SVG thumbnails for the picker ── */
  const INK = '#c3c9d3', ACC = '#1f3a5f';
  const thumb = (inner) => `<svg viewBox="0 0 36 48" width="36" height="48" aria-hidden="true" focusable="false"><rect x="0.5" y="0.5" width="35" height="47" rx="2" fill="#fff" stroke="#d5d9e0"/>${inner}</svg>`;
  const line = (x, y, w, c, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h || 1.6}" rx=".8" fill="${c || INK}"/>`;
  const THUMBS = {
    classic:   thumb(line(11,6,14,'#6b7280',2.4) + line(8,11,20) + line(5,17,26,'#6b7280') + line(5,21,26) + line(5,24,22) + line(5,30,26,'#6b7280') + line(5,34,26) + line(5,37,20)),
    sidebar:   thumb(`<rect x="3" y="3" width="11" height="42" rx="1.5" fill="${ACC}"/>` + line(17,6,14,'#6b7280',2.4) + line(17,11,10,ACC) + line(17,18,16) + line(17,21,14) + line(17,27,16) + line(17,30,15) + line(17,36,16)),
    executive: thumb(line(10,7,16,'#6b7280',2.4) + line(14,12,8,INK) + `<rect x="15" y="16" width="6" height="1.2" fill="${ACC}"/>` + line(5,21,26,ACC,.8) + line(5,25,26) + line(5,28,22) + line(5,34,26,ACC,.8) + line(5,38,26) + line(5,41,18)),
    banner:    thumb(`<rect x="3" y="3" width="30" height="13" rx="2" fill="${ACC}"/><rect x="6" y="6" width="14" height="2.4" rx="1" fill="#fff"/><rect x="6" y="10.5" width="9" height="1.4" rx=".7" fill="#dbe3ee"/>` + `<rect x="5" y="21" width="1.6" height="4" fill="${ACC}"/>` + line(9,22,12,ACC) + line(5,29,26) + line(5,32,22) + `<rect x="5" y="37" width="1.6" height="4" fill="${ACC}"/>` + line(9,38,12,ACC)),
    timeline:  thumb(line(5,6,16,'#6b7280',2.4) + line(5,11,10,ACC) + `<rect x="13" y="19" width="1" height="22" fill="${INK}"/><circle cx="13.5" cy="21" r="1.6" fill="${ACC}"/><circle cx="13.5" cy="32" r="1.6" fill="${ACC}"/>` + line(4,20,7,ACC) + line(17,20,15) + line(17,23,12) + line(4,31,7,ACC) + line(17,31,15) + line(17,34,11)),
  };

  const TEMPLATES = [
    { id:'classic',   label:'Classic',   sub:'ATS-friendly',   print:false, multiCol:false },
    { id:'sidebar',   label:'Sidebar',   sub:'Two-column',     print:true,  multiCol:true,  defaultFont:'inter',      build:buildSidebar },
    { id:'executive', label:'Executive', sub:'Elegant serif',  print:true,  multiCol:false, defaultFont:'lora',       build:buildExecutive },
    { id:'banner',    label:'Banner',    sub:'Bold header',    print:true,  multiCol:false, defaultFont:'poppins',    build:buildBanner },
    { id:'timeline',  label:'Timeline',  sub:'Milestones', print:true, multiCol:true, defaultFont:'sourcesans', build:buildTimeline },
  ];
  let templateId = (() => { const s = lsGet(LS_TEMPLATE); return TEMPLATES.some(t => t.id === s) ? s : 'classic'; })();
  function currentTemplate(){ return TEMPLATES.find(t => t.id === templateId) || TEMPLATES[0]; }

  /* ── shared content helpers ── */
  const CONTACT_LABEL = { email:'Email', phone:'Phone', city:'Location', linkedin:'LinkedIn', portfolio:'Portfolio' };

  function collect(){
    const d = state.data;
    return {
      name:    (d.personal.name || '').trim() || 'Your Name',
      title:   (d.personal.title || '').trim(),
      contacts: getContactParts(d.personal),
      summary: (d.summary || '').trim(),
      tech: d.skills.technical || [],
      core: d.skills.core || [],
      exp:  hasContent(d.experience, ['company','role']),
      proj: hasContent(d.projects, ['name']),
      edu:  hasContent(d.education, ['school','degree']),
      cert: hasContent(d.certifications, ['name']),
    };
  }

  function contactVal(kind, v){
    const value = v.trim();
    const href = contactLinkHref(kind, value);
    return href ? `<a href="${esc(href)}">${esc(value)}</a>` : esc(value);
  }

  // Lines that start with a bullet marker become list items; anything
  // else stays a plain paragraph — so un-bulleted text is not turned
  // into a one-item list.
  const BULLET_RE = /^(?:[•▪‣◦]\s*|[-*]\s+)/;
  function bullets(desc){
    const lines = (desc || '').split('\n').map(l => l.trim()).filter(Boolean);
    let html = '', open = false;
    lines.forEach(l => {
      if(BULLET_RE.test(l)){
        if(!open){ html += '<ul class="pt-bullets" data-fit="body">'; open = true; }
        html += `<li>${esc(l.replace(BULLET_RE, ''))}</li>`;
      }else{
        if(open){ html += '</ul>'; open = false; }
        html += `<p class="pt-para" data-fit="body">${esc(l)}</p>`;
      }
    });
    return open ? html + '</ul>' : html;
  }

  const join = (arr, sep) => arr.filter(Boolean).join(sep);

  // One entry in the stacked styles (Executive / Banner / Sidebar's main column).
  function entry(o){
    return `<div class="pt-item${o.compact ? ' pt-item-compact' : ''}" data-fit="item-gap">
      <div class="pt-item-head">
        <span class="pt-item-lead">${esc(o.lead)}</span>
        ${o.meta ? `<span class="pt-item-meta">${esc(o.meta)}</span>` : ''}
      </div>
      ${o.sub ? `<div class="pt-item-sub">${esc(o.sub)}</div>` : ''}
      ${o.tech ? `<div class="pt-item-tech">${esc(o.tech)}</div>` : ''}
      ${o.note ? `<div class="pt-item-note">${esc(o.note)}</div>` : ''}
      ${o.desc ? bullets(o.desc) : ''}
    </div>`;
  }

  const expEntry  = e => entry({ lead: e.role || e.company, sub: join([e.role ? e.company : '', e.location], ' · '), meta: formatDateRange(e.start, e.end, e.current), desc: e.description });
  const projEntry = p => entry({ lead: p.name, sub: p.role, tech: p.tech, desc: p.description });
  const eduEntry  = e => entry({ lead: join([e.degree, e.field ? 'in ' + e.field : ''], ' ') || e.school, sub: join([e.degree ? e.school : '', e.location], ' · '), meta: formatDateRange(e.start, e.end, false), note: e.honors });
  const certEntry = c => entry({ lead: c.name, sub: c.issuer, meta: formatDate(c.date), compact: true });

  const section = (cls, title, body) => `<section class="pt-sec"><div class="${cls}" data-fit="section-title"><span>${esc(title)}</span></div>${body}</section>`;

  /* ════════════ TEMPLATE: EXECUTIVE ════════════ */
  function buildExecutive(c){
    const sec = (t, b) => section('pt-sec-title', t, b);
    const skillRow = (label, list) => list.length
      ? `<div class="pt-skill-row" data-fit="body"><span class="pt-skill-label">${label}</span>${list.map(esc).join('<span class="pt-dot">·</span>')}</div>` : '';
    let h = `<header class="pt-head">
      <div class="pt-name">${esc(c.name)}</div>
      ${c.title ? `<div class="pt-jobtitle">${esc(c.title)}</div>` : ''}
      <div class="pt-rule"></div>
      ${c.contacts.length ? `<div class="pt-contact">${c.contacts.map(([k, v]) => `<span>${contactVal(k, v)}</span>`).join('<span class="pt-dot">•</span>')}</div>` : ''}
    </header>`;
    if(c.summary) h += sec('Profile', `<p class="pt-para pt-summary" data-fit="body">${esc(c.summary)}</p>`);
    if(c.exp.length) h += sec('Experience', c.exp.map(expEntry).join(''));
    if(c.proj.length) h += sec('Projects', c.proj.map(projEntry).join(''));
    if(c.edu.length) h += sec('Education', c.edu.map(eduEntry).join(''));
    if(c.tech.length || c.core.length) h += sec('Skills', skillRow('Technical', c.tech) + skillRow('Core', c.core));
    if(c.cert.length) h += sec('Certifications', c.cert.map(certEntry).join(''));
    return h;
  }

  /* ════════════ TEMPLATE: BANNER ════════════ */
  function buildBanner(c){
    const sec = (t, b) => section('pt-sec-title', t, b);
    const chips = (label, list) => list.length
      ? `<div class="pt-chip-row"><span class="pt-skill-label">${label}</span><div class="pt-chips">${list.map(s => `<span class="pt-chip">${esc(s)}</span>`).join('')}</div></div>` : '';
    let h = `<header class="pt-head">
      <div class="pt-name">${esc(c.name)}</div>
      ${c.title ? `<div class="pt-jobtitle">${esc(c.title)}</div>` : ''}
      ${c.contacts.length ? `<div class="pt-contact">${c.contacts.map(([k, v]) => `<span>${contactVal(k, v)}</span>`).join('')}</div>` : ''}
    </header>`;
    if(c.summary) h += sec('Profile', `<p class="pt-para pt-summary" data-fit="body">${esc(c.summary)}</p>`);
    if(c.tech.length || c.core.length) h += sec('Skills', chips('Technical', c.tech) + chips('Core', c.core));
    if(c.exp.length) h += sec('Experience', c.exp.map(expEntry).join(''));
    if(c.proj.length) h += sec('Projects', c.proj.map(projEntry).join(''));
    if(c.edu.length) h += sec('Education', c.edu.map(eduEntry).join(''));
    if(c.cert.length) h += sec('Certifications', c.cert.map(certEntry).join(''));
    return h;
  }

  /* ════════════ TEMPLATE: SIDEBAR ════════════ */
  function buildSidebar(c){
    const side = (t, b) => `<div class="pt-side-sec"><div class="pt-side-title" data-fit="section-title"><span>${esc(t)}</span></div>${b}</div>`;
    const sec = (t, b) => section('pt-sec-title', t, b);
    const list = (items) => `<ul class="pt-side-list" data-fit="body">${items.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`;

    let aside = '';
    if(c.contacts.length){
      aside += side('Contact', c.contacts.map(([k, v]) =>
        `<div class="pt-side-contact" data-fit="body"><span class="pt-side-label">${CONTACT_LABEL[k] || ''}</span>${contactVal(k, v)}</div>`).join(''));
    }
    if(c.tech.length) aside += side('Technical Skills', list(c.tech));
    if(c.core.length) aside += side('Core Skills', list(c.core));
    if(c.edu.length){
      aside += side('Education', c.edu.map(e => `<div class="pt-side-edu" data-fit="item-gap">
        <div class="pt-side-edu-deg">${esc(join([e.degree, e.field ? 'in ' + e.field : ''], ' ') || e.school)}</div>
        ${e.degree && e.school ? `<div class="pt-side-edu-line">${esc(e.school)}</div>` : ''}
        ${e.location ? `<div class="pt-side-edu-line">${esc(e.location)}</div>` : ''}
        ${formatDateRange(e.start, e.end, false) ? `<div class="pt-side-edu-line">${esc(formatDateRange(e.start, e.end, false))}</div>` : ''}
        ${e.honors ? `<div class="pt-side-edu-line pt-italic">${esc(e.honors)}</div>` : ''}
      </div>`).join(''));
    }
    if(c.cert.length){
      aside += side('Certifications', c.cert.map(x => `<div class="pt-side-edu" data-fit="item-gap">
        <div class="pt-side-edu-deg">${esc(x.name)}</div>
        ${x.issuer ? `<div class="pt-side-edu-line">${esc(x.issuer)}</div>` : ''}
        ${x.date ? `<div class="pt-side-edu-line">${esc(formatDate(x.date))}</div>` : ''}
      </div>`).join(''));
    }

    let main = `<header class="pt-head">
      <div class="pt-name">${esc(c.name)}</div>
      ${c.title ? `<div class="pt-jobtitle">${esc(c.title)}</div>` : ''}
    </header>`;
    if(c.summary) main += sec('Profile', `<p class="pt-para pt-summary" data-fit="body">${esc(c.summary)}</p>`);
    if(c.exp.length) main += sec('Experience', c.exp.map(expEntry).join(''));
    if(c.proj.length) main += sec('Projects', c.proj.map(projEntry).join(''));

    return `<aside class="pt-side">${aside}</aside><div class="pt-main">${main}</div>`;
  }

  /* ════════════ TEMPLATE: TIMELINE ════════════ */
  function buildTimeline(c){
    const sec = (t, b) => section('pt-sec-title', t, `<div class="pt-tl">${b}</div>`);
    const row = (left, bodyHtml, noDot) => `<div class="pt-tl-item${noDot ? ' pt-tl-nodot' : ''}" data-fit="item-gap">
      <div class="pt-tl-when">${esc(left)}</div><div class="pt-tl-body">${bodyHtml}</div></div>`;
    const body = (lead, sub, extra) => `<div class="pt-item-lead">${esc(lead)}</div>${sub ? `<div class="pt-item-sub">${esc(sub)}</div>` : ''}${extra || ''}`;

    let h = `<header class="pt-head">
      <div class="pt-name">${esc(c.name)}</div>
      ${c.title ? `<div class="pt-jobtitle">${esc(c.title)}</div>` : ''}
      ${c.contacts.length ? `<div class="pt-contact">${c.contacts.map(([k, v]) => `<span>${contactVal(k, v)}</span>`).join('<span class="pt-dot">·</span>')}</div>` : ''}
    </header>`;
    if(c.summary) h += section('pt-sec-title', 'Profile', `<p class="pt-para pt-summary" data-fit="body">${esc(c.summary)}</p>`);
    if(c.exp.length) h += sec('Experience', c.exp.map(e =>
      row(formatDateRange(e.start, e.end, e.current), body(e.role || e.company, join([e.role ? e.company : '', e.location], ' · '), bullets(e.description)))).join(''));
    if(c.proj.length) h += sec('Projects', c.proj.map(p =>
      row(p.role || '', body(p.name, '', (p.tech ? `<div class="pt-item-tech">${esc(p.tech)}</div>` : '') + bullets(p.description)), !p.role)).join(''));
    if(c.edu.length) h += sec('Education', c.edu.map(e =>
      row(formatDateRange(e.start, e.end, false), body(join([e.degree, e.field ? 'in ' + e.field : ''], ' ') || e.school, join([e.degree ? e.school : '', e.location], ' · '), e.honors ? `<div class="pt-item-note">${esc(e.honors)}</div>` : ''))).join(''));
    if(c.tech.length || c.core.length){
      const rows = [];
      if(c.tech.length) rows.push(row('Technical', `<div class="pt-skill-line" data-fit="body">${c.tech.map(esc).join('<span class="pt-dot">·</span>')}</div>`, true));
      if(c.core.length) rows.push(row('Core', `<div class="pt-skill-line" data-fit="body">${c.core.map(esc).join('<span class="pt-dot">·</span>')}</div>`, true));
      h += sec('Skills', rows.join(''));
    }
    if(c.cert.length) h += sec('Certifications', c.cert.map(x => row(formatDate(x.date), body(x.name, x.issuer, ''), !x.date)).join(''));
    return h;
  }

  /* ════════════ WIRING ════════════ */
  const origGetFont = window.getFont;
  window.getFont = function(){
    if(currentTemplate().print){
      const pf = PRINT_FONTS.find(f => f.id === state.font);
      if(pf) return pf;
    }
    return origGetFont.apply(this, arguments);
  };

  const origChecks = window.getFormatChecks;
  window.getFormatChecks = function(){
    const checks = origChecks.apply(this, arguments);
    const tpl = currentTemplate();
    if(!tpl.print) return checks;
    const font = window.getFont();
    const out = checks.map(ch => {
      if(ch.label === 'Single-column layout' && tpl.multiCol){
        return { ok:false, label:`Two-column layout (${tpl.label}) — many ATS parsers read columns out of order` };
      }
      if(/^Font:/.test(ch.label) && isPrintFont(font.id)){
        return { ok:false, label:`Font: ${font.label} — print font, not on the ATS-safe list` };
      }
      return ch;
    });
    out.unshift({ ok:false, label:`${tpl.label} is a print template — made for physical applications, not ATS parsing. Use Classic for online applications.` });
    return out;
  };

  const origRenderPreview = window.renderPreview;
  window.renderPreview = function(){
    origRenderPreview.apply(this, arguments);
    try{ decoratePreview(); }
    catch(e){ console.error('print-templates.js:', e); } // never break the Classic preview
  };

  function decoratePreview(){
    const pane = document.getElementById('previewPane');
    if(!pane) return;
    const inner = pane.querySelector('.page-shell-inner');
    const shell = pane.querySelector('.page-shell');
    if(!inner || !shell) return;
    const tpl = currentTemplate();

    if(tpl.print){
      ensureFonts();
      inner.innerHTML = `<div class="pt-root pt-${tpl.id}" style="--pt-accent:${currentAccent().hex};--pt-head-font:${tpl.id === 'executive' ? PLAYFAIR_STACK : 'inherit'};">${tpl.build(collect())}</div>`;

      // Font dropdown: ATS-safe fonts plus the print fonts.
      const sel = pane.querySelector('#fontSelect');
      if(sel){
        const opt = f => `<option value="${f.id}" ${f.id === state.font ? 'selected' : ''}>${esc(f.label)}</option>`;
        sel.innerHTML = `<optgroup label="ATS-safe fonts">${SAFE_FONTS.map(opt).join('')}</optgroup><optgroup label="Print fonts">${PRINT_FONTS.map(opt).join('')}</optgroup>`;
      }
      // The Hybrid/Standard layout switch only applies to Classic.
      const layoutSel = pane.querySelector('#extLayoutSelect');
      if(layoutSel){ layoutSel.disabled = true; layoutSel.title = 'Layout options apply to the Classic template only'; }
    }

    const row = document.createElement('div');
    row.className = 'pt-controls';
    row.innerHTML = controlsHTML(tpl);
    shell.insertAdjacentElement('beforebegin', row);
  }

  function controlsHTML(tpl){
    const cards = TEMPLATES.map(t => `<button type="button" class="pt-card" data-pt-template="${t.id}" aria-pressed="${t.id === tpl.id}" title="${esc(t.label)} — ${esc(t.sub)}">
        ${THUMBS[t.id]}<span class="pt-card-label">${esc(t.label)}</span><span class="pt-card-sub">${esc(t.sub)}</span></button>`).join('');
    let h = `<div class="pt-row"><span class="pt-label">Template</span><div class="pt-cards">${cards}</div></div>`;
    if(tpl.print){
      h += `<div class="pt-row"><span class="pt-label">Accent</span><div class="pt-swatches">${ACCENTS.map(a =>
        `<button type="button" class="pt-swatch" data-pt-accent="${a.id}" aria-pressed="${a.id === accentId}" aria-label="${a.label}" title="${a.label}" style="--sw:${a.hex}"></button>`).join('')}</div>
        <span class="pt-note">Made for printing — not ATS-optimised. Use Classic for online applications.</span></div>`;
    }
    return h;
  }

  window.ptSetTemplate = function(id){
    const tpl = TEMPLATES.find(t => t.id === id) || TEMPLATES[0];
    templateId = tpl.id;
    lsSet(LS_TEMPLATE, tpl.id);
    if(!tpl.print){
      if(isPrintFont(state.font)) state.font = 'calibri'; // Classic only offers the ATS-safe fonts
    }else if(tpl.defaultFont){
      state.font = tpl.defaultFont; // each template starts with its recommended pairing
    }
    if(typeof saveLS === 'function') saveLS();
    renderPreview();
    if(typeof renderAtsPanel === 'function') renderAtsPanel();
  };

  window.ptSetAccent = function(id){
    if(!ACCENTS.some(a => a.id === id)) return;
    accentId = id;
    lsSet(LS_ACCENT, id);
    renderPreview();
  };

  // #previewPane's contents are replaced on every render, so listen once on
  // the (persistent) pane element and delegate.
  const paneEl = document.getElementById('previewPane');
  if(paneEl){
    paneEl.addEventListener('click', (ev) => {
      const t = ev.target.closest && ev.target.closest('[data-pt-template]');
      if(t){ window.ptSetTemplate(t.getAttribute('data-pt-template')); return; }
      const a = ev.target.closest && ev.target.closest('[data-pt-accent]');
      if(a) window.ptSetAccent(a.getAttribute('data-pt-accent'));
    });
  }

  // A print font saved earlier must not leak into Classic (e.g. after the
  // template preference was cleared). Then repaint once so a saved print
  // template shows on first load — app_1_.js's own init ran before this file.
  if(!currentTemplate().print && isPrintFont(state.font)) state.font = 'calibri';
  if(paneEl) renderPreview();
  if(typeof renderAtsPanel === 'function') renderAtsPanel();

})();
