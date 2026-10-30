'use strict';
/* ════════════════════════════════════════════════════════════════
   AI IMPORT — extension script
   Loaded AFTER app_1_.js and ats-extras.js. Adds one thing: a "Paste
   AI Resume" field. A person pastes the raw text of an AI-generated
   (or any plain-text) resume, this parses it into the app's own
   `state.data` shape, and the REST OF THE APP renders it exactly the
   way it renders anything else — same fonts, same layout, same ATS
   rules. Nothing about the source formatting survives the import;
   only the content does. That's the "our preferred template" part —
   there is no separate template for imported content, it's the same
   one every resume in this app goes through.

   Like ats-extras.js, this is purely additive: it reads the app's
   existing globals (state, esc, saveLS, renderStep, renderToolbar,
   showToast, enterBuilder, goStep, callAIJson, BULLET, new*() factories)
   and never edits app_1_.js itself. Removing this file (and its
   <script>/<link> tags, and the two buttons it wires) returns the app
   to exactly its prior behavior.

   PARSING STRATEGY — two tiers, same shape:
     1. AI tier (parseResumeWithAI): reuses the app's existing Groq
        seam (callAIJson, already defined in app_1_.js) to ask the
        model to extract the pasted text into the exact JSON shape
        state.data uses. This is the primary path — AI-generated
        resumes show up in wildly inconsistent formatting (markdown,
        inconsistent bullets, run-together contact lines), which a
        real model handles far better than fixed regexes.
     2. Local tier (parseResumeLocally): a heuristic, regex/section-
        header based fallback used only if the AI call fails (no API
        key configured, offline, rate limited) — so the field still
        does *something* useful with no network. Same output shape as
        the AI tier, normalized through the same function.
   Both tiers are deliberately conservative: neither ever invents a
   fact that isn't in the pasted text (mirrors the same rule already
   used by rewriteBulletSection's prompt in app_1_.js).
   ════════════════════════════════════════════════════════════════ */
(function(){

  const MAX_PASTE_CHARS = 24000; // guards prompt size / accidental giant pastes

  /* ── AI TIER ──────────────────────────────────────────────────── */

  function buildImportPrompt(text){
    return `You are extracting structured resume data from raw pasted text (often produced by an AI resume generator, so formatting may be inconsistent — markdown asterisks, run-together contact lines, inconsistent bullets, wrapped lines, etc).

Extract ONLY information that is actually present in the text below. Never invent a company, title, date, metric, or skill that isn't there — if a field is unknown, use an empty string. Do not editorialize or rewrite the wording; extract it as-is (light whitespace/bullet cleanup is fine).

Respond ONLY with JSON in this exact shape:
{
  "personal": {"name":"","title":"","email":"","phone":"","city":"","linkedin":"","portfolio":""},
  "summary": "",
  "skills": {"technical": [], "core": []},
  "experience": [{"company":"","role":"","location":"","start":"","end":"","current":false,"bullets":[]}],
  "projects": [{"name":"","role":"","tech":"","link":"","bullets":[]}],
  "education": [{"school":"","degree":"","field":"","location":"","start":"","end":"","honors":""}],
  "certifications": [{"name":"","issuer":"","date":"","id":""}]
}

Rules:
- "start"/"end" dates: format as "YYYY-MM" whenever a month is determinable, or "YYYY" alone if only a year is known, or "" if unknown. Never write a month name.
- "current": true only if the entry's end date reads as "Present"/"Current"/ongoing.
- "personal.title" is a job-title headline (e.g. "Senior Backend Engineer"), never a location. "personal.city" is the person's city/region, read separately even if it sits on the same contact line as the email/phone.
- "skills.technical" = tools/software/languages/hard skills. "skills.core" = soft skills/competencies (e.g. Leadership, Communication, Time Management). Split any skills list found in the text between the two using that rule, even if the source lists them together under one heading.
- "bullets": an array of strings, one per achievement/responsibility, with any leading bullet symbol (•, -, *, ▪, numbering) stripped. If the source text wraps one bullet across two physical lines (no bullet symbol restarting), merge them back into a single string — do not create a separate bullet for a wrapped continuation line.
- "summary": the professional summary/objective paragraph as plain prose, no bullets.
- Include every experience/project/education/certification entry found, in the order they appear. Omit the arrays' example objects above — they're just shape templates.
- No preamble, no markdown fences, no commentary — JSON only.

PASTED RESUME TEXT:
"""${text.slice(0, MAX_PASTE_CHARS)}"""`;
  }

  async function parseResumeWithAI(text){
    const parsed = await callAIJson([{ role:'user', content: buildImportPrompt(text) }], { maxTokens: 3200 });
    return normalizeParsedResume(parsed);
  }

  /* ── NORMALIZE — shared by both tiers ────────────────────────────
     Merges parsed data over the app's own new*() factories so every
     field the rest of the app expects always exists, coerces types,
     trims strings, converts bullets[] -> the "• line\n• line" string
     shape the app's textareas/description fields use everywhere else
     (same BULLET constant startSectionRewrite's accept path uses),
     and drops entries that came back completely empty. */
  function s(v){ return (v == null) ? '' : String(v).trim(); }
  function arr(v){ return Array.isArray(v) ? v : []; }

  function bulletsToDescription(bullets){
    return arr(bullets).map(b => s(b)).filter(Boolean).map(b => BULLET + b.replace(/^[•\-*]\s*/, '')).join('\n');
  }

  // Shared tail end for both tiers: fills in a blank entry for any
  // section that ended up empty (so the form always has something to
  // render, matching init()'s own defensive fill in app_1_.js) and
  // drops entries with no real content.
  function finalizeParsed({ personal, summary, skills, experience, projects, education, certifications }){
    experience = experience.filter(e => e.company || e.role || e.description);
    projects = projects.filter(p => p.name || p.description);
    education = education.filter(e => e.school || e.degree);
    certifications = certifications.filter(c => c.name);
    return {
      personal, summary, skills,
      experience: experience.length ? experience : [newExperience()],
      projects: projects.length ? projects : [newProject()],
      education: education.length ? education : [newEducation()],
      certifications: certifications.length ? certifications : [newCertification()],
      jd: '',
    };
  }

  // AI tier: raw.experience/projects carry .bullets[] (per the prompt
  // schema) — this builds .description from them.
  function normalizeParsedResume(raw){
    raw = raw || {};
    const p = raw.personal || {};
    const personal = {
      name: s(p.name), title: s(p.title), email: s(p.email), phone: s(p.phone),
      city: s(p.city), linkedin: s(p.linkedin), portfolio: s(p.portfolio),
    };

    const skillsRaw = raw.skills || {};
    const skills = {
      technical: arr(skillsRaw.technical).map(s).filter(Boolean),
      core: arr(skillsRaw.core).map(s).filter(Boolean),
    };

    const experience = arr(raw.experience).map(e => ({
      ...newExperience(),
      company: s(e.company), role: s(e.role), location: s(e.location),
      start: s(e.start), end: s(e.end), current: !!e.current,
      description: bulletsToDescription(e.bullets),
    })).filter(e => e.company || e.role || e.description);

    const projects = arr(raw.projects).map(pr => ({
      ...newProject(),
      name: s(pr.name), role: s(pr.role), tech: s(pr.tech), link: s(pr.link),
      description: bulletsToDescription(pr.bullets),
    })).filter(pr => pr.name || pr.description);

    const education = arr(raw.education).map(ed => ({
      ...newEducation(),
      school: s(ed.school), degree: s(ed.degree), field: s(ed.field),
      location: s(ed.location), start: s(ed.start), end: s(ed.end), honors: s(ed.honors),
    })).filter(ed => ed.school || ed.degree);

    const certifications = arr(raw.certifications).map(c => ({
      ...newCertification(),
      name: s(c.name), issuer: s(c.issuer), date: s(c.date), id: s(c.id),
    })).filter(c => c.name);

    return finalizeParsed({ personal, summary: s(raw.summary), skills, experience, projects, education, certifications });
  }

  function parsedIsUsable(d){
    return !!(d.personal.name || d.summary || d.skills.technical.length || d.skills.core.length
      || d.experience.some(e => e.company || e.role || e.description)
      || d.education.some(ed => ed.school || ed.degree));
  }

  /* ── LOCAL FALLBACK TIER — used only when the AI call fails ────
     Section-header based split. Deliberately modest: good enough to
     get name/contact/summary/skills and a rough experience/education
     split without a network call, not a full resume parser. */
  const SECTION_HEADERS = {
    summary: /^(professional |career |personal )?(summary|objective|profile)( summary)?$|^about( me)?$/i,
    skills: /^(technical |key )?skills$|^(technical )?proficienc(y|ies)$|^areas of expertise$|^tools( (&|and) technologies)?$|^technologies$|^skills.*(&|and).*competencies$/i,
    skillsCore: /^core competenc(y|ies)$|^soft skills$|^interpersonal skills$/i,
    experience: /^(work |professional |relevant |selected )?experience$|^employment( history)?$|^(work |career )history$|^professional background$/i,
    projects: /^(personal |key |selected |notable )?projects?$/i,
    education: /^education$|^academic (background|qualifications|history)$/i,
    certifications: /^certifications?( (&|and) licenses)?$|^licenses?$|^credentials$|^training( (&|and) certifications)?$/i,
  };
  const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
  const PHONE_RE = /(\+?\(?\d[\d\s().-]{7,}\d)/;
  const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/\S+/i;
  const URL_RE = /(?:https?:\/\/)?(?:www\.)?[\w-]+\.(?:com|io|dev|me|net|org|co)\/?\S*/ig;
  // "City, ST" / "City, State" pulled from the contact block, before any
  // section header — a simple heuristic (no gazetteer), so it only fires
  // on the common short "Capitalized Word(s), XX" pattern.
  const CITY_STATE_RE = /\b[A-Z][a-zA-Z.]+(?:[\s-][A-Z][a-zA-Z.]+)*,\s?[A-Z]{2}\b/;
  const SEPARATOR_LINE_RE = /^[-=_~*]{3,}$/;

  // Bullet glyphs beyond the original •/-/* (AI generators commonly use
  // these too), plus "1." / "1)" numbered lists.
  const BULLET_CHARS_RE = /^[•\-*▪‣●○►➤✓✔◦]\s*/;
  const NUMBERED_BULLET_RE = /^\d+[.)]\s+/;
  function isBulletLine(l){ return BULLET_CHARS_RE.test(l) || NUMBERED_BULLET_RE.test(l); }
  function stripBulletPrefix(l){ return l.replace(BULLET_CHARS_RE, '').replace(NUMBERED_BULLET_RE, '').trim(); }

  function detectSection(line){
    const clean = line.replace(/[*_#:]+/g, '').trim();
    if(!clean || clean.length > 40) return null;
    for(const [key, re] of Object.entries(SECTION_HEADERS)){
      if(re.test(clean)) return key;
    }
    return null;
  }

  function splitBullets(lines){
    return lines.map(l => stripBulletPrefix(l).replace(/[*_]+/g,'').trim()).filter(Boolean);
  }

  // Common soft-skill/competency phrases — lets the local tier split a
  // single unlabeled "Skills:" list into technical vs. core the same way
  // the AI tier's prompt is instructed to, instead of dumping everything
  // into "technical". Deliberately a substring match on a curated list
  // (mirrors the TYPO_MAP pattern in app_1_.js) rather than a full
  // classifier — conservative by design, so it only reclassifies phrases
  // that are unambiguously soft skills.
  const CORE_SKILL_HINTS = [
    'leadership','communication','teamwork','team work','collaboration','problem solving','problem-solving',
    'time management','adaptability','critical thinking','conflict resolution','emotional intelligence',
    'decision making','decision-making','organizational','multitasking','multi-tasking','attention to detail',
    'customer service','presentation','negotiation','mentoring','mentorship','coaching',
    'stakeholder management','public speaking','creativity','work ethic','interpersonal','active listening',
    'cross-functional','cross functional','relationship building','strategic thinking','analytical thinking',
    'flexibility','empathy','accountability','self-motivated','self motivation','initiative',
  ];
  function classifySkillToken(token){
    const low = token.toLowerCase();
    return CORE_SKILL_HINTS.some(hint => low.includes(hint)) ? 'core' : 'technical';
  }

  // Finds "Month YYYY" / "MM/YYYY" / "YYYY" tokens and normalizes to the
  // app's own "YYYY-MM" (or bare "YYYY") date input shape.
  const MONTH_LOOKUP = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',sept:'09',oct:'10',nov:'11',dec:'12' };
  const DATE_TOKEN_RE = /([A-Za-z]{3,9}\.?\s+\d{4}|\d{1,2}\/\d{4}|\b(?:19|20)\d{2}\b)/g;
  function parseMonthYear(str){
    let m = str.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/);
    if(m){
      const key = MONTH_LOOKUP[m[1].slice(0,4).toLowerCase()] ? m[1].slice(0,4).toLowerCase() : m[1].slice(0,3).toLowerCase();
      if(MONTH_LOOKUP[key]) return `${m[2]}-${MONTH_LOOKUP[key]}`;
      return m[2]; // unrecognized month word — fall back to just the year
    }
    m = str.match(/^(\d{1,2})\/(\d{4})$/);
    if(m) return `${m[2]}-${m[1].padStart(2,'0')}`;
    m = str.match(/^(19|20)\d{2}$/);
    if(m) return str;
    return '';
  }

  function parseResumeLocally(text){
    const rawLines = text.replace(/\r/g, '').split('\n').map(l => l.trim());
    const lines = rawLines.filter((l,i) => l || (rawLines[i-1] && rawLines[i+1])); // collapse runs of blank lines but keep single separators

    const fullText = text;
    const emailMatch = fullText.match(EMAIL_RE);
    const phoneMatch = fullText.match(PHONE_RE);
    const linkedinMatch = fullText.match(LINKEDIN_RE);
    const allUrls = fullText.match(URL_RE) || [];
    const portfolioUrl = allUrls.find(u => !/linkedin\.com/i.test(u) && !(emailMatch && u.includes(emailMatch[0].split('@')[1])));

    // Name: first non-empty line that isn't a section header, a markdown
    // separator ("---"), a "Resume"/"CV" title line, doesn't contain @ or
    // a long digit run, and is short (a name, not a sentence).
    let name = '', title = '';
    for(let i = 0; i < Math.min(lines.length, 6); i++){
      const l = lines[i];
      const clean = l.replace(/[*_#]+/g,'').trim();
      if(!l || detectSection(l) || SEPARATOR_LINE_RE.test(l) || EMAIL_RE.test(l) || /\d{3,}/.test(l)) continue;
      if(/^(resume|curriculum vitae|cv)$/i.test(clean)) continue;
      if(l.length <= 60){
        if(!name){ name = clean; continue; }
        if(!title){ title = clean; break; }
      }
    }

    // City/region: scanned separately from the same top contact block —
    // stops at the first real section header since a city mention deep in
    // a bullet (e.g. "relocated the Austin office") isn't the person's own city.
    let city = '';
    for(let i = 0; i < Math.min(lines.length, 8); i++){
      const l = lines[i];
      if(!l) continue;
      if(detectSection(l)) break;
      // Deliberately NOT skipping lines that also contain an email/phone/
      // LinkedIn URL — contact info is very often crammed onto one line
      // ("Austin, TX | you@email.com | ..."), and the "City, ST" pattern
      // is specific enough not to false-match inside a URL or email.
      const m = l.match(CITY_STATE_RE);
      if(m){ city = m[0]; break; }
    }

    // Walk the text once, bucketing lines under whichever section
    // header was most recently seen. Lines before the first header
    // (name/title/contact block) are skipped for bucketing purposes.
    const buckets = { summary:[], skills:[], skillsCore:[], experience:[], projects:[], education:[], certifications:[] };
    let current = null;
    lines.forEach(l => {
      const sec = detectSection(l);
      if(sec){ current = sec; return; }
      // Blank lines carry no information for the block-splitter below
      // (which already detects a new entry via "non-bullet line after
      // bullets") — keeping them would make a blank line look like a
      // block's header line and swallow the next entry's company/role.
      if(current && l) buckets[current].push(l);
    });

    const summary = buckets.summary.join(' ').replace(/[*_#]+/g,'').trim();

    // Skills: tokens from an explicit "Core Competencies"/"Soft Skills"
    // section always count as core; a generic "Skills" list gets split
    // technical-vs-core via the curated hint list (see classifySkillToken)
    // so a plain unlabeled list doesn't dump everything into "technical".
    const rawTokens = buckets.skills.join(', ').split(/[,•|]/).map(t => t.replace(/^[\s*_-]+|[\s*_-]+$/g,'').trim()).filter(Boolean).slice(0, 60);
    const explicitCore = buckets.skillsCore.join(', ').split(/[,•|]/).map(t => t.replace(/^[\s*_-]+|[\s*_-]+$/g,'').trim()).filter(Boolean);
    const technicalTokens = [], coreTokens = [...explicitCore];
    rawTokens.forEach(t => (classifySkillToken(t) === 'core' ? coreTokens : technicalTokens).push(t));
    const seenSkill = new Set();
    const skills = {
      technical: technicalTokens.slice(0, 40),
      core: coreTokens.filter(t => { const k = t.toLowerCase(); if(seenSkill.has(k)) return false; seenSkill.add(k); return true; }).slice(0, 40),
    };

    // Experience/education/projects: split each bucket into blocks
    // wherever a non-bullet "title-like" line appears after at least one
    // bullet has been collected for the current block.
    function splitIntoBlocks(sectionLines){
      const blocks = [];
      let cur = [];
      sectionLines.forEach(l => {
        if(!isBulletLine(l) && cur.length && cur.some(isBulletLine)){
          blocks.push(cur);
          cur = [l];
        } else {
          cur.push(l);
        }
      });
      if(cur.length) blocks.push(cur);
      return blocks;
    }

    // Strips the date portion (and anything after it) from a header line
    // so it's safe to split what's left on "|"/","/"-" for role/company —
    // without this, a trailing month name left behind by a plain \d{4}
    // strip (e.g. "... | March" once "2020" is cut) would land in the
    // wrong field.
    function stripDatesFromHeader(l){
      const m = l.match(/([A-Za-z]{3,9}\.?\s+\d{4}|\d{1,2}\/\d{4}|\b(?:19|20)\d{2}\b)/);
      return m ? l.slice(0, m.index).trim() : l;
    }

    function dateRangeFromLine(l, { singleAsEnd = false } = {}){
      const hasCurrent = /present|current/i.test(l);
      const tokens = l.match(DATE_TOKEN_RE) || [];
      if(!tokens.length) return { start:'', end:'', current:false };
      if(tokens.length >= 2) return { start: parseMonthYear(tokens[0]), end: hasCurrent ? '' : parseMonthYear(tokens[1]), current: hasCurrent };
      const only = parseMonthYear(tokens[0]);
      if(hasCurrent) return { start: only, end:'', current:true };
      return singleAsEnd ? { start:'', end: only, current:false } : { start: only, end:'', current:false };
    }

    // "Senior Engineer at Acme Corp" (a common LinkedIn-export phrasing)
    // is tried first; otherwise falls back to splitting on |/,/- the way
    // most other header layouts ("Senior Engineer | Acme Corp") use.
    function splitRoleCompany(headerLine){
      const cleaned = stripDatesFromHeader(headerLine).replace(/[*_]+/g,'').trim();
      const atMatch = cleaned.match(/^(.+?)\s+at\s+(.+)$/i);
      if(atMatch) return { role: atMatch[1].trim(), company: atMatch[2].trim() };
      const parts = cleaned.split(/[|@,•·-]/).map(x => x.trim()).filter(Boolean);
      return { role: parts[0] || '', company: parts[1] || '' };
    }

    const experience = splitIntoBlocks(buckets.experience).map(block => {
      // Dates are searched across every non-bullet line in the block, not
      // just the first — many resumes (and most LinkedIn exports) put the
      // "Mar 2021 - Present" range on its own line under the role/company.
      const nonBulletLines = block.filter(l => !isBulletLine(l));
      const headerLine = nonBulletLines[0] || '';
      const { start, end, current } = dateRangeFromLine(nonBulletLines.join(' '));
      const { role, company } = splitRoleCompany(headerLine);
      return {
        ...newExperience(),
        role, company, start, end, current,
        description: bulletsToDescription(splitBullets(block.filter(isBulletLine))),
      };
    }).filter(e => e.role || e.company || e.description);

    const education = splitIntoBlocks(buckets.education).map(block => {
      const headerLine = block[0] || '';
      const { start, end } = dateRangeFromLine(block.join(' '), { singleAsEnd: true });
      const parts = stripDatesFromHeader(headerLine).replace(/[*_]+/g,'').split(/[|,-]/).map(x => x.trim()).filter(Boolean);
      return { ...newEducation(), school: parts[0] || '', degree: parts[1] || '', start, end };
    }).filter(e => e.school);

    const projects = splitIntoBlocks(buckets.projects).map(block => {
      const headerLine = block.find(l => !isBulletLine(l)) || '';
      return {
        ...newProject(),
        name: stripDatesFromHeader(headerLine).replace(/[*_]+/g,'').split(/[|,-]/)[0]?.trim() || '',
        description: bulletsToDescription(splitBullets(block.filter(isBulletLine))),
      };
    }).filter(p => p.name || p.description);

    const certifications = buckets.certifications.filter(Boolean).map(l => {
      const clean = stripBulletPrefix(l).replace(/[*_]+/g,'').trim();
      const parts = clean.split(/\s[-–—]\s/).map(x => x.trim()).filter(Boolean);
      // The date, if present, is pulled from whichever part is a real date
      // token (usually last) rather than assumed to be exactly parts[2] —
      // a "Name - Level - Issuer - Date" line has one more segment than
      // "Name - Issuer - Date" and would otherwise lose the date entirely.
      let date = '';
      if(parts.length > 1){
        const parsed = parseMonthYear(parts[parts.length - 1]);
        if(parsed){ date = parsed; parts.pop(); }
      }
      return { ...newCertification(), name: parts[0] || clean, issuer: parts.slice(1).join(' — '), date };
    }).filter(c => c.name);

    const personal = {
      name, title,
      email: emailMatch ? emailMatch[0] : '',
      phone: phoneMatch ? phoneMatch[0].trim() : '',
      linkedin: linkedinMatch ? linkedinMatch[0] : '',
      portfolio: portfolioUrl || '',
      city,
    };

    return finalizeParsed({ personal, summary, skills, experience, projects, education, certifications });
  }

  /* ── MODAL UI ─────────────────────────────────────────────────── */
  let _importState = 'input'; // 'input' | 'loading' | 'preview' | 'error'
  let _importParsed = null;
  let _importRawText = ''; // preserved across states so "Edit paste" restores what was typed

  function ensureHost(){
    let host = document.getElementById('aiImportModalHost');
    if(!host){
      host = document.createElement('div');
      host.id = 'aiImportModalHost';
      document.body.appendChild(host);
    }
    return host;
  }

  /* ── FOCUS TRAP — keyboard users (and screen readers) shouldn't be
     able to Tab out into the page behind the modal, and Escape should
     close it like any other dialog. Attached to `document`, not the
     modal element itself, because renderImportModal() rebuilds the
     modal's entire innerHTML on every state change ('input' ->
     'loading' -> 'preview'/'error') — a listener on the modal node
     would be destroyed by that; this one just re-queries the current
     modal fresh on every keypress, so it survives every re-render. */
  const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let _importPrevActiveEl = null;
  function aiImportFocusTrapKeydown(e){
    const modal = document.querySelector('.ai-import-modal');
    if(!modal) return;
    if(e.key === 'Escape'){ e.preventDefault(); aiImportClose(); return; }
    if(e.key !== 'Tab') return;
    const focusables = Array.from(modal.querySelectorAll(FOCUSABLE_SELECTOR)).filter(el => el.offsetParent !== null);
    if(!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    else if(!modal.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
  }

  window.aiImportOpen = function(){
    // Captured BEFORE renderImportModal() runs — that call ends by
    // focusing the modal's own textarea, so capturing after it would
    // record the modal itself as the thing to restore focus to on close.
    _importPrevActiveEl = document.activeElement;
    _importState = 'input';
    _importParsed = null;
    _importRawText = '';
    renderImportModal();
    document.body.classList.add('ai-import-open');
    document.addEventListener('keydown', aiImportFocusTrapKeydown);
  };

  window.aiImportClose = function(){
    document.body.classList.remove('ai-import-open');
    const host = document.getElementById('aiImportModalHost');
    if(host) host.innerHTML = '';
    _importState = 'input';
    _importParsed = null;
    _importRawText = '';
    document.removeEventListener('keydown', aiImportFocusTrapKeydown);
    if(_importPrevActiveEl && typeof _importPrevActiveEl.focus === 'function') _importPrevActiveEl.focus();
    _importPrevActiveEl = null;
  };

  window.aiImportRun = async function(){
    const ta = document.getElementById('aiImportTextarea');
    const text = (ta && ta.value || '').trim();
    if(!text){ showToast('Paste your resume text first', 'error'); return; }
    if(text.length < 40){ showToast("That doesn't look like a full resume yet", 'error'); return; }

    _importRawText = text;
    _importState = 'loading';
    renderImportModal();

    let parsed = null;
    let usedFallback = false;
    // AI paused → parse on this device only; no request is made.
    const aiOn = (typeof aiEnabled === 'function') ? aiEnabled() : true;
    if(!aiOn){
      try{ parsed = parseResumeLocally(text); }catch(e2){ parsed = null; }
    }else{
      try{
        parsed = await parseResumeWithAI(text);
        if(!parsedIsUsable(parsed)) throw new Error('empty AI parse');
      }catch(e){
        usedFallback = true;
        try{
          parsed = parseResumeLocally(text);
        }catch(e2){
          parsed = null;
        }
      }
    }

    if(!parsed || !parsedIsUsable(parsed)){
      _importState = 'error';
      renderImportModal();
      return;
    }

    _importParsed = parsed;
    _importParsed._usedFallback = usedFallback;
    _importParsed._localOnly = !aiOn;
    _importState = 'preview';
    renderImportModal();
  };

  window.aiImportBackToInput = function(){
    _importState = 'input';
    renderImportModal();
  };

  // The only function that commits imported data to the real builder
  // state — mirrors extLoadSample's confirm-before-overwrite guard.
  // Applies the app's own default/preferred template (Calibri font,
  // Standard layout) rather than carrying over anything about how the
  // pasted text looked, since the whole point is "our template, your content".
  window.aiImportCommit = function(){
    if(!_importParsed) return;
    const d = state.data;
    const hasExisting = !!(d.personal.name || d.summary || d.experience.some(e => e.company || e.role));
    if(hasExisting && !confirm('Import this resume? This replaces your current resume content — this can\'t be undone.')){
      return;
    }

    const { _usedFallback, _localOnly, ...clean } = _importParsed;
    state.data = JSON.parse(JSON.stringify(clean));
    state.font = 'calibri'; // the app's preferred/safest default template
    if(typeof window.extSetLayout === 'function') window.extSetLayout('standard'); // reset the Layout extension too, if loaded
    state.currentStep = 0;
    saveLS();

    aiImportClose();
    if(typeof enterBuilder === 'function') enterBuilder();
    if(typeof renderStep === 'function') renderStep();
    if(typeof renderToolbar === 'function') renderToolbar();
    showToast('Resume imported — review each section for accuracy before exporting.', 'success');
  };

  function importSummaryStats(d){
    const expCount = d.experience.filter(e => e.company || e.role).length;
    const eduCount = d.education.filter(e => e.school).length;
    const skillCount = d.skills.technical.length + d.skills.core.length;
    const projCount = d.projects.filter(p => p.name).length;
    return { expCount, eduCount, skillCount, projCount };
  }

  function renderImportModal(){
    const host = ensureHost();

    if(_importState === 'input'){
      host.innerHTML = `
        <div class="ext-modal-backdrop" id="aiImportBackdrop"></div>
        <div class="ai-import-modal" role="dialog" aria-modal="true" aria-label="Paste an AI-generated resume">
          <div class="ext-modal-head">
            <div>
              <div class="ai-import-head-title">Paste an AI-generated resume</div>
              <div class="ai-import-head-sub">Drop in the raw text from ChatGPT, Claude, or any resume generator — we'll pull the content into this app's own ATS-safe template.</div>
            </div>
            <button type="button" class="ext-modal-close" id="aiImportCloseBtn1" aria-label="Close">✕</button>
          </div>
          <div class="ext-modal-body ai-import-body">
            <textarea id="aiImportTextarea" class="ai-import-textarea" rows="16" placeholder="Paste the full resume text here — name, contact info, summary, experience, education, skills...">${esc(_importRawText)}</textarea>
            <div class="ai-import-hint">${(typeof aiEnabled === 'function' && !aiEnabled())
              ? 'Nothing here is saved until you review the parsed result and choose to import it. Parsing happens on this device — nothing leaves your browser.'
              : 'Nothing here is saved until you review the parsed result and choose to import it. Your data stays in this browser except for the one parsing call.'}</div>
          </div>
          <div class="ext-modal-foot">
            <span class="ext-modal-foot-note">Works best with a full resume, not just a snippet.</span>
            <button type="button" class="btn btn-primary" id="aiImportRunBtn">Parse Resume →</button>
          </div>
        </div>
      `;
      document.getElementById('aiImportCloseBtn1')?.addEventListener('click', aiImportClose);
      document.getElementById('aiImportBackdrop')?.addEventListener('click', aiImportClose);
      document.getElementById('aiImportRunBtn')?.addEventListener('click', aiImportRun);
      document.getElementById('aiImportTextarea')?.focus();
      return;
    }

    if(_importState === 'loading'){
      host.innerHTML = `
        <div class="ext-modal-backdrop"></div>
        <div class="ai-import-modal" role="dialog" aria-modal="true" aria-label="Paste an AI-generated resume">
          <div class="ext-modal-head">
            <div class="ai-import-head-title">Paste an AI-generated resume</div>
          </div>
          <div class="ext-modal-body ai-import-body">
            <div class="rewrite-preview rewrite-loading" aria-live="polite">Reading your resume and mapping it into the builder's fields…</div>
          </div>
        </div>
      `;
      return;
    }

    if(_importState === 'error'){
      host.innerHTML = `
        <div class="ext-modal-backdrop" id="aiImportBackdrop2"></div>
        <div class="ai-import-modal" role="dialog" aria-modal="true" aria-label="Couldn't parse that">
          <div class="ext-modal-head">
            <div class="ai-import-head-title">Couldn't parse that</div>
            <button type="button" class="ext-modal-close" id="aiImportCloseBtn2" aria-label="Close">✕</button>
          </div>
          <div class="ext-modal-body ai-import-body">
            <div class="ai-import-error" aria-live="polite">We couldn't pull any usable resume content out of that text. Double-check it's the full resume (not just a job title or one section) and try again.</div>
          </div>
          <div class="ext-modal-foot">
            <span></span>
            <button type="button" class="btn btn-secondary" id="aiImportBackBtn">← Back to paste</button>
          </div>
        </div>
      `;
      document.getElementById('aiImportCloseBtn2')?.addEventListener('click', aiImportClose);
      document.getElementById('aiImportBackdrop2')?.addEventListener('click', aiImportClose);
      document.getElementById('aiImportBackBtn')?.addEventListener('click', aiImportBackToInput);
      document.getElementById('aiImportCloseBtn2')?.focus();
      return;
    }

    // 'preview'
    const d = _importParsed;
    const { expCount, eduCount, skillCount, projCount } = importSummaryStats(d);
    host.innerHTML = `
      <div class="ext-modal-backdrop" id="aiImportBackdrop3"></div>
      <div class="ai-import-modal" role="dialog" aria-modal="true" aria-label="Here's what we found">
        <div class="ext-modal-head">
          <div>
            <div class="ai-import-head-title">Here's what we found</div>
            <div class="ai-import-head-sub">${d._localOnly ? 'Parsed on this device — double-check dates and section splits.' : (d._usedFallback ? 'Parsed locally (AI parsing was unavailable) — double-check dates and section splits.' : 'Parsed with AI — review before importing, especially dates.')}</div>
          </div>
          <button type="button" class="ext-modal-close" id="aiImportCloseBtn3" aria-label="Close">✕</button>
        </div>
        <div class="ext-modal-body ai-import-body">
          <div class="ai-import-preview-card">
            <div class="ai-import-preview-name">${esc(d.personal.name) || '<em>No name detected</em>'}</div>
            <div class="ai-import-preview-title">${esc(d.personal.title)}</div>
            <div class="ai-import-preview-contact">${esc([d.personal.email, d.personal.phone, d.personal.city].filter(Boolean).join('  ·  ')) || '<em>No contact info detected</em>'}</div>
            <div class="ai-import-preview-stats">
              <span>${expCount} experience ${expCount===1?'entry':'entries'}</span>
              <span>${eduCount} education ${eduCount===1?'entry':'entries'}</span>
              <span>${projCount} project${projCount===1?'':'s'}</span>
              <span>${skillCount} skill${skillCount===1?'':'s'}</span>
              <span>${d.summary ? 'summary found' : 'no summary found'}</span>
            </div>
          </div>
        </div>
        <div class="ext-modal-foot">
          <span class="ext-modal-foot-note">Applies this app's Calibri / Standard template — you can change either afterward.</span>
          <div style="display:flex;gap:10px;">
            <button type="button" class="btn btn-secondary" id="aiImportBackBtn2">← Edit paste</button>
            <button type="button" class="btn btn-primary" id="aiImportCommitBtn">Use This — Import →</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('aiImportCloseBtn3')?.addEventListener('click', aiImportClose);
    document.getElementById('aiImportBackdrop3')?.addEventListener('click', aiImportClose);
    document.getElementById('aiImportBackBtn2')?.addEventListener('click', aiImportBackToInput);
    document.getElementById('aiImportCommitBtn')?.addEventListener('click', aiImportCommit);
    document.getElementById('aiImportCommitBtn')?.focus();
  }

  /* ── WIRE UP ENTRY POINTS ─────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('navImportBtn')?.addEventListener('click', aiImportOpen);
    document.getElementById('heroImportBtn')?.addEventListener('click', aiImportOpen);
  });

  // Builder toolbar doesn't have a stable insertion point in the DOM
  // (renderToolbar() rebuilds toolbarRight's innerHTML wholesale on
  // every step change), so — same technique ats-extras.js uses for
  // renderPreview() — wrap renderToolbar() to inject the button after
  // each rebuild rather than editing app_1_.js.
  const _origRenderToolbar = window.renderToolbar;
  if(typeof _origRenderToolbar === 'function'){
    window.renderToolbar = function(){
      _origRenderToolbar.apply(this, arguments);
      const right = document.getElementById('toolbarRight');
      if(right && !document.getElementById('toolbarImportBtn')){
        const btn = document.createElement('button');
        btn.className = 'btn btn-ghost';
        btn.id = 'toolbarImportBtn';
        btn.textContent = 'Paste AI Resume';
        btn.addEventListener('click', aiImportOpen);
        right.insertBefore(btn, right.firstChild);
      }
    };
  }

})();
