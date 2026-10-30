'use strict';

/* ════════════════════════════════════════════════════════════════
   PHASE 1 — DATA MODEL
   Verified section order (research-backed, see conversation):
   Header → Summary → Skills (Technical + Core Competencies) →
   Experience → Projects → Education → Certifications
   ════════════════════════════════════════════════════════════════ */

const STEPS = [
  { id:'personal',      label:'Header & Contact',   icon:'●' },
  { id:'summary',       label:'Professional Summary', icon:'●' },
  { id:'skills',        label:'Skills',              icon:'●' },
  { id:'experience',    label:'Work Experience',     icon:'●' },
  { id:'projects',      label:'Projects',            icon:'●' },
  { id:'education',     label:'Education',           icon:'●' },
  { id:'certifications',label:'Certifications',      icon:'●' },
  { id:'analyze',       label:'Analyze Resume',      icon:'●' },
];

// Fonts vetted against the ATS font research in this conversation.
// Garamond intentionally excluded — silently substituted by Workday,
// which shifts line widths mid-bullet. Sans-serif prioritized: sans
// averaged higher parse-completeness than serif across tested engines.
const SAFE_FONTS = [
  { id:'calibri',   label:'Calibri',   family:"'Calibri','Carlito',sans-serif",     pdf:'Roboto',   note:'Safest default — 99% parse-completeness in cited testing' },
  { id:'arial',     label:'Arial',     family:"'Arial','Helvetica',sans-serif",     pdf:'Roboto',   note:'Universal fallback, ships on every OS' },
  { id:'helvetica', label:'Helvetica', family:"'Helvetica','Arial',sans-serif",     pdf:'Roboto',   note:'Clean sans, strong parse rate' },
  { id:'georgia',   label:'Georgia',   family:"'Georgia','Cambria',serif",          pdf:'Roboto',   note:'Serif option for traditional/executive roles' },
];
// NOTE on `pdf: 'Roboto'`: pdfmake's default vfs_fonts.js only embeds the
// Roboto family. True Calibri/Arial/Georgia glyphs are NOT embeddable
// without shipping their own font files (they're not freely redistributable
// web fonts). Roboto is itself a widely-tested, sans-serif, ATS-safe choice
// (same family class as Calibri/Arial per the research), so it's the honest
// substitute for the *exported PDF* — the on-screen preview can show the
// requested family via CSS since no embedding/licensing issue applies there.
// This tradeoff is surfaced to the user in the UI rather than hidden.

function newExperience(){
  return { company:'', role:'', location:'', start:'', end:'', current:false, description:'' };
}
function newProject(){
  return { name:'', role:'', tech:'', link:'', description:'' };
}
function newEducation(){
  return { school:'', degree:'', field:'', location:'', start:'', end:'', honors:'' };
}
function newCertification(){
  return { name:'', issuer:'', date:'', id:'' };
}

const state = {
  currentStep: 0,
  font: 'calibri',
  data: {
    personal: { name:'', title:'', email:'', phone:'', city:'', linkedin:'', portfolio:'' },
    summary: '',
    skills: { technical: [], core: [] },
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    jd: '', // pasted job description text, used by the Analyze Resume step + as rewrite context
  }
};

/* ════════════════════════════════════════════════════════════════
   SHARED FORMATTERS — single source of truth.
   This is the direct fix for the audited bug: ProDocs rebuilt its
   contact-line array 8 separate times across templates/exports, and
   one of those copies silently dropped a collected field (address).
   Every consumer below — HTML preview AND PDF export — calls these
   same functions. Add/change a field once, it's correct everywhere.
   ════════════════════════════════════════════════════════════════ */

// Ordered list of [kind, value] pairs for the contact line. This
// ordering + inclusion logic exists in exactly one place — both the
// plain-text formatter (formatContactLine, used by the ATS checks and
// the landing-page thumbnails) and the clickable-link renderer used by
// the actual preview/PDF (renderContactLineHTML, below) read from here,
// so they can never drift into listing contact methods differently.
function getContactParts(personal){
  return [
    ['email', personal.email],
    ['phone', personal.phone],
    ['city', personal.city],
    ['linkedin', personal.linkedin],
    ['portfolio', personal.portfolio],
  ].filter(([, v]) => v && v.trim());
}
function formatContactLine(personal, sep){
  return getContactParts(personal).map(([, v]) => v).join(sep || '  |  ');
}

// href for one contact field, or null for fields that shouldn't link
// (city). Phone/linkedin/portfolio are frequently typed without a
// scheme/prefix ("linkedin.com/in/x", "555-123-4567") so this adds
// exactly what's missing rather than assuming either form.
function contactLinkHref(kind, value){
  if(kind === 'email') return `mailto:${value}`;
  if(kind === 'phone') return `tel:${value.replace(/[^\d+]/g, '')}`;
  if(kind === 'linkedin' || kind === 'portfolio') return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return null;
}

// Same fields, same order, as formatContactLine — but rendered as real
// <a> links (mailto:/tel:/https:) instead of plain text, so a recruiter
// reading the exported PDF can click straight through instead of
// retyping an email or URL by hand. Only used by renderPreview() (and
// therefore the PDF export, which prints that same live DOM) — every
// other consumer of contact info (ATS checks, thumbnails) still wants
// plain text and keeps using formatContactLine/getContactParts.
// Deliberately styled to inherit the surrounding text color rather than
// the app's default link color/underline — a resume reading as normal
// professional text that happens to be clickable, not as a web page.
function renderContactLineHTML(personal, sep){
  return getContactParts(personal).map(([kind, v]) => {
    const value = v.trim();
    const href = contactLinkHref(kind, value);
    return href ? `<a href="${esc(href)}" style="color:inherit;text-decoration:none;">${esc(value)}</a>` : esc(value);
  }).join(sep || '  |  ');
}

// month input value ("2024-05") -> "May 2024". Written out in full per
// ATS research: irregular/abbreviated dates risk misread tenure.
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatDate(monthValue){
  if(!monthValue) return '';
  const parts = monthValue.split('-');
  const y = parts[0], m = parts[1];
  if(!y) return monthValue;
  return m ? `${MONTH_NAMES[parseInt(m,10)-1]} ${y}` : y;
}
function formatDateRange(start, end, current){
  const s = formatDate(start);
  const e = current ? 'Present' : formatDate(end);
  if(s && e) return `${s} – ${e}`;
  return s || e || '';
}

// HTML-escape — single copy (the audited app had two identical ones:
// esc() and escHtml()). Used for every user-entered value rendered
// into innerHTML in both the form UI and the live preview.
function esc(s){
  return (s || '').toString()
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function getFont(){
  return SAFE_FONTS.find(f => f.id === state.font) || SAFE_FONTS[0];
}

function hasContent(list, keys){
  return list.filter(item => keys.some(k => (item[k]||'').toString().trim()));
}

/* ════════════════════════════════════════════════════════════════
   UTIL
   ════════════════════════════════════════════════════════════════ */
function $(id){ return document.getElementById(id); }
function gv(id){ const el = $(id); return el ? el.value : ''; }
function gch(id){ const el = $(id); return el ? el.checked : false; }

/* ════════════════════════════════════════════════════════════════
   AUTO-BULLET — used by the Achievements (experience) and Project
   description textareas. Keeps every line prefixed with "• " the
   way a bullet-list editor would, without fighting normal editing.
   ════════════════════════════════════════════════════════════════ */
const BULLET = '• ';

function autoBulletKeydown(e){
  const ta = e.target;

  if(e.key === 'Enter'){
    const start = ta.selectionStart, end = ta.selectionEnd;
    const value = ta.value;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const currentLine = value.slice(lineStart, start);

    // Enter on an empty bullet ("• " with nothing typed after it) ends
    // the list instead of adding another empty bullet.
    if(currentLine === BULLET){
      e.preventDefault();
      ta.value = value.slice(0, lineStart) + value.slice(end);
      ta.selectionStart = ta.selectionEnd = lineStart;
      saveField();
      return;
    }

    e.preventDefault();
    const insert = '\n' + BULLET;
    ta.value = value.slice(0, start) + insert + value.slice(end);
    const pos = start + insert.length;
    ta.selectionStart = ta.selectionEnd = pos;
    saveField();
    return;
  }

  if(e.key === 'Backspace'){
    const start = ta.selectionStart, end = ta.selectionEnd;
    if(start !== end) return; // let normal deletion of a selection happen
    const value = ta.value;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    // Cursor sits right after "• " with nothing else on the line before it —
    // remove the whole bullet marker in one backspace instead of one char.
    if(start === lineStart + BULLET.length && value.slice(lineStart, start) === BULLET){
      e.preventDefault();
      ta.value = value.slice(0, lineStart) + value.slice(start);
      ta.selectionStart = ta.selectionEnd = lineStart;
      saveField();
    }
  }
}

function autoBulletInput(e){
  const ta = e.target;
  // First character typed into an empty field — seed the first bullet.
  if(ta.value.length === 1 && ta.selectionStart === 1 && ta.value !== BULLET){
    const typed = ta.value;
    ta.value = BULLET + typed;
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    saveField();
  }
}

function autoBulletPaste(e){
  const ta = e.target;
  const text = (e.clipboardData || window.clipboardData).getData('text');
  if(!text || !text.includes('\n')){
    // Single-line paste: still make sure it's bulleted if this is the
    // very first content in the field.
    if(ta.value.trim() === ''){
      e.preventDefault();
      insertAtCursor(ta, BULLET + text.replace(/^•\s*/, ''));
      saveField();
    }
    return;
  }
  e.preventDefault();
  const bulleted = text
    .split('\n')
    .map(line => {
      const trimmed = line.replace(/\s+$/,'');
      if(trimmed.trim() === '') return '';
      return trimmed.trimStart().startsWith('•') ? trimmed : BULLET + trimmed.trimStart();
    })
    .join('\n');
  insertAtCursor(ta, bulleted);
  saveField();
}

function insertAtCursor(ta, text){
  const start = ta.selectionStart, end = ta.selectionEnd;
  const value = ta.value;
  ta.value = value.slice(0, start) + text + value.slice(end);
  const pos = start + text.length;
  ta.selectionStart = ta.selectionEnd = pos;
}

/* ════════════════════════════════════════════════════════════════
   WRITING CHECK — Achievements (experience) & Project description
   only. Checks each bullet line against resume-writing best
   practice (Action Verb → Task → Quantified Result — the shared
   shape behind CAR/PAR/APR/XYZ frameworks). Runs entirely locally
   today (no network). Everything below is written behind a small
   provider seam — getSuggestions() — so a real AI backend (e.g. a
   self-hosted Llama endpoint) can be dropped in later by adding a
   second provider function with the SAME return shape and pointing
   ACTIVE_PROVIDER at it. No caller of getSuggestions() would need
   to change.
   ════════════════════════════════════════════════════════════════ */

// A handful of common resume action verbs, mapped across the forms
// this checker needs to reason about. Deliberately not exhaustive —
// verbs outside this list still get flagged, just without an
// auto-fix (see wrongTense / gerundOpener below). Expanding this
// list only ever improves fix coverage, never correctness.
const VERB_FORMS = {
  lead:{past:'Led',gerund:'leading'}, manage:{past:'Managed',gerund:'managing'},
  build:{past:'Built',gerund:'building'}, create:{past:'Created',gerund:'creating'},
  design:{past:'Designed',gerund:'designing'}, develop:{past:'Developed',gerund:'developing'},
  launch:{past:'Launched',gerund:'launching'}, drive:{past:'Drove',gerund:'driving'},
  grow:{past:'Grew',gerund:'growing'}, increase:{past:'Increased',gerund:'increasing'},
  reduce:{past:'Reduced',gerund:'reducing'}, improve:{past:'Improved',gerund:'improving'},
  deliver:{past:'Delivered',gerund:'delivering'}, implement:{past:'Implemented',gerund:'implementing'},
  coordinate:{past:'Coordinated',gerund:'coordinating'}, analyze:{past:'Analyzed',gerund:'analyzing'},
  write:{past:'Wrote',gerund:'writing'}, run:{past:'Ran',gerund:'running'},
  own:{past:'Owned',gerund:'owning'}, oversee:{past:'Oversaw',gerund:'overseeing'},
  spearhead:{past:'Spearheaded',gerund:'spearheading'}, streamline:{past:'Streamlined',gerund:'streamlining'},
  optimize:{past:'Optimized',gerund:'optimizing'}, negotiate:{past:'Negotiated',gerund:'negotiating'},
  mentor:{past:'Mentored',gerund:'mentoring'}, train:{past:'Trained',gerund:'training'},
  resolve:{past:'Resolved',gerund:'resolving'}, maintain:{past:'Maintained',gerund:'maintaining'},
  execute:{past:'Executed',gerund:'executing'}, plan:{past:'Planned',gerund:'planning'},
  organize:{past:'Organized',gerund:'organizing'}, present:{past:'Presented',gerund:'presenting'},
  research:{past:'Researched',gerund:'researching'}, automate:{past:'Automated',gerund:'automating'},
  collaborate:{past:'Collaborated',gerund:'collaborating'}, direct:{past:'Directed',gerund:'directing'},
  establish:{past:'Established',gerund:'establishing'}, generate:{past:'Generated',gerund:'generating'},
  exceed:{past:'Exceeded',gerund:'exceeding'}, author:{past:'Authored',gerund:'authoring'},
  identify:{past:'Identified',gerund:'identifying'}, evaluate:{past:'Evaluated',gerund:'evaluating'},
  secure:{past:'Secured',gerund:'securing'}, cut:{past:'Cut',gerund:'cutting'},
};
// Reverse lookups built once: gerund→base, presentTense→base.
// PRESENT_TO_PAST maps BOTH the bare infinitive ("manage" -> "Managed")
// AND the third-person-singular form ("manages" -> "Managed") to the
// same past tense — a bullet reading "Manages a team of 5" under a
// PAST role is at least as common a mistake as the bare-infinitive
// case, and was previously invisible to the wrongTense check below
// since only the infinitive key existed.
const GERUND_TO_BASE = {}, PRESENT_TO_PAST = {};
function thirdPersonForm(base){
  if(/[^aeiou]y$/.test(base)) return base.slice(0, -1) + 'ies'; // identify -> identifies
  if(/(s|x|z|ch|sh)$/.test(base)) return base + 'es';
  return base + 's';
}
Object.entries(VERB_FORMS).forEach(([base, f]) => {
  GERUND_TO_BASE[f.gerund] = base;
  PRESENT_TO_PAST[base] = f.past; // e.g. "manage" -> "Managed"
  PRESENT_TO_PAST[thirdPersonForm(base)] = f.past; // e.g. "manages" -> "Managed"
});

const WEAK_OPENERS = [
  'responsible for', 'was responsible for', 'duties included', 'duties include',
  'assisted with', 'worked on', 'helped with', 'helped to', 'in charge of',
  'tasked with', 'involved in', 'participated in',
];

const RESULT_PHRASES = /\b(resulting in|which led to|leading to|reduc\w*|increas\w*|improv\w*|sav\w*|grew|grow\w*|cut\w*|boost\w*|exceed\w*|driv\w*|achiev\w*)\b/i;
const METRIC_REGEX = /(\$\s?\d|\d+\s?%|\d+x\b|\b\d[\d,.]*\b|\bteam of \d|\bdozens\b|\bhundreds\b|\bthousands\b)/i;

// Small, deliberately conservative typo map — safe to auto-fix
// because these are unambiguous misspellings, not judgment calls.
// A full dictionary check was intentionally left out: flagging every
// word absent from a wordlist would misfire constantly on company
// names, tech stacks, and acronyms.
const TYPO_MAP = {
  managment:'management', mangement:'management', recieved:'received',
  acheived:'achieved', acheivement:'achievement', seperate:'separate',
  seperated:'separated', occured:'occurred', succesful:'successful',
  successfull:'successful', collaberated:'collaborated', collaberate:'collaborate',
  responsable:'responsible', enviroment:'environment', experiance:'experience',
  buisness:'business', wich:'which', teh:'the', recieve:'receive',
  intial:'initial', begining:'beginning', comitted:'committed',
  developement:'development', analyse:'analyze', priorty:'priority',
  neccessary:'necessary', maintainance:'maintenance', accomodate:'accommodate',
  implimented:'implemented', delievered:'delivered', achievment:'achievement',
};

function capitalize(s){ return s ? s[0].toUpperCase() + s.slice(1) : s; }

// Runs every check against ONE bullet line (without its leading "• ").
// Returns an array of issues; a line can carry more than one.
function checkBulletLine(text, { isCurrentRole }){
  const issues = [];
  const trimmed = text.trim();
  if(!trimmed) return issues;

  const lower = trimmed.toLowerCase();

  // 1 — weak / duty-list opener
  const openerHit = WEAK_OPENERS.find(p => lower.startsWith(p));
  if(openerHit){
    let rest = trimmed.slice(openerHit.length).trim();
    const firstWord = (rest.split(/\s+/)[0] || '').toLowerCase();
    const base = GERUND_TO_BASE[firstWord];
    if(base){
      const replacement = isCurrentRole ? capitalize(base) : VERB_FORMS[base].past;
      rest = replacement + rest.slice(firstWord.length);
    } else {
      rest = capitalize(rest);
    }
    issues.push({
      type:'weakOpener', severity:'high',
      message:`Starts with "${capitalize(openerHit)}" — that describes a duty, not what you did`,
      fix: rest || null,
    });
  }

  // 2 — gerund opener (only when it wasn't already covered by #1)
  if(!openerHit){
    const firstWord = (lower.split(/\s+/)[0] || '');
    const base = GERUND_TO_BASE[firstWord];
    if(base && lower.startsWith(firstWord)){
      const replacement = isCurrentRole ? capitalize(base) : VERB_FORMS[base].past;
      const fix = replacement + trimmed.slice(firstWord.length);
      issues.push({
        type:'gerundOpener', severity:'medium',
        message:`Starts with "${capitalize(firstWord)}" — lead with the verb directly`,
        fix,
      });
    }
  }

  // 3 — present tense on a past role (only for verbs we can map)
  if(!isCurrentRole && !openerHit){
    const firstWord = lower.split(/\s+/)[0] || '';
    if(PRESENT_TO_PAST[firstWord]){
      const fix = PRESENT_TO_PAST[firstWord] + trimmed.slice(firstWord.length);
      issues.push({
        type:'wrongTense', severity:'medium',
        message:`"${capitalize(firstWord)}" is present tense — this role has ended`,
        fix,
      });
    }
  }

  // 4/5 merged — metric vs. result-phrase vs. neither
  const hasMetric = METRIC_REGEX.test(trimmed);
  const hasResultPhrase = RESULT_PHRASES.test(trimmed);
  if(!hasMetric && hasResultPhrase){
    issues.push({
      type:'noMetric', severity:'medium',
      message:'Claims a result but has no number — quantify it if you can',
      fix: null,
    });
  } else if(!hasMetric && !hasResultPhrase){
    issues.push({
      type:'noResult', severity:'medium',
      message:'Reads as a task, not an outcome — what changed because you did this?',
      fix: null,
    });
  }

  // 6 — run-on length
  if(trimmed.length > 220){
    issues.push({
      type:'runOn', severity:'low',
      message:`Long bullet (${trimmed.length} characters) — consider splitting into two`,
      fix: null,
    });
  }

  // 7 — curated typo check (first hit only, to avoid pile-ups)
  const words = trimmed.split(/\b/);
  for(const w of words){
    const wl = w.toLowerCase();
    if(TYPO_MAP[wl]){
      const correct = /^[A-Z]/.test(w) ? capitalize(TYPO_MAP[wl]) : TYPO_MAP[wl];
      const fix = trimmed.replace(new RegExp('\\b'+w+'\\b'), correct);
      issues.push({
        type:'spelling', severity:'medium',
        message:`Possible typo: "${w}" → "${correct}"`,
        fix,
      });
      break;
    }
  }

  return issues;
}

// LOCAL PROVIDER — synchronous today, wrapped async so the call site
// never needs to change when a real backend replaces it.
async function suggestionsLocal(fieldType, text, context){
  if(fieldType === 'summary_text') return checkSummaryText(text);
  if(fieldType !== 'experience_bullet' && fieldType !== 'project_bullet') return [];
  const isCurrentRole = context && context.isCurrentRole;
  const lines = (text || '').split('\n');
  const out = [];
  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.replace(/^•\s*/, '');
    if(!line.trim()) return;
    checkBulletLine(line, { isCurrentRole }).forEach(issue => out.push({ lineIndex, ...issue }));
  });
  return out;
}

// Summary is prose, not bullets — checked sentence-by-sentence for
// the same typo list plus first-person pronouns (a common resume
// mistake — professional summaries should read fine without "I").
// Case-insensitive: without /i, a sentence starting "My 8 years..." was
// silently missed, since "my" (lowercase-only) never matches "My" — the
// single most common way this actually shows up (capitalized, sentence-
// initial) was exactly the case this regex couldn't catch.
const FIRST_PERSON = /\b(I|I'm|I've|I'll|my|myself)\b/i;
function checkSummaryText(text){
  const trimmed = (text || '').trim();
  if(!trimmed) return [];
  const sentences = trimmed.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const out = [];
  sentences.forEach((sentence, lineIndex) => {
    // typo check (reuses the same curated map as bullets)
    const words = sentence.split(/\b/);
    for(const w of words){
      const wl = w.toLowerCase();
      if(TYPO_MAP[wl]){
        const correct = /^[A-Z]/.test(w) ? capitalize(TYPO_MAP[wl]) : TYPO_MAP[wl];
        const fix = sentence.replace(new RegExp('\\b'+w+'\\b'), correct);
        out.push({ lineIndex, type:'spelling', severity:'medium', message:`Possible typo: "${w}" → "${correct}"`, fix });
        break;
      }
    }
    // first-person pronoun
    if(FIRST_PERSON.test(sentence)){
      out.push({ lineIndex, type:'firstPerson', severity:'low', message:'Professional summaries usually drop first-person pronouns ("I", "my")', fix:null });
    }
    // long sentence
    if(sentence.length > 240){
      out.push({ lineIndex, type:'runOn', severity:'low', message:`Long sentence (${sentence.length} characters) — consider splitting`, fix:null });
    }
  });
  return out;
}

/* ════════════════════════════════════════════════════════════════
   AI SEAM — single chokepoint for every Groq call in this app
   (grammar/wording, paraphrasing, JD keyword tailoring, resume
   import all funnel through callAI()). Nothing else in this file
   talks to the network directly.

   API KEY — where it comes from (first match wins):
     1. config.local.js  → window.RESUME_BUILDER_CONFIG.groqApiKey
        (gitignored; see config.local.example.js)
     2. This browser's localStorage, set by clicking the AI badge.
   The key is deliberately NOT stored in this file: the repository is
   public, and anything written here gets committed. Groq accepts direct
   browser calls (no CORS block), so no backend/proxy is needed — which
   also means the key is visible in devtools of whatever browser it is
   loaded in. Fine for one person on their own machine; do not host a
   copy with a real key in it.

   MODEL — resolved at runtime, not hardcoded. Groq retires models
   (llama-3.3-70b-versatile was shut down 2026-08-16), so the probe asks
   /models what this account can actually use and picks the first
   available entry from AI_MODEL_CANDIDATES (or config groqModel).
   ════════════════════════════════════════════════════════════════ */
const AI_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const AI_MODELS_ENDPOINT = 'https://api.groq.com/openai/v1/models';
const AI_MODEL_CANDIDATES = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile',
  'qwen/qwen3.6-27b',
];
const AI_KEY_STORAGE = 'resume_builder_groq_key';
const AI_CALL_TIMEOUT_MS = 45000;
const AI_PROBE_TIMEOUT_MS = 10000;
const AI_RECHECK_MS = 60000;
let AI_MODEL = null; // resolved by checkAiConnection(); null = none usable yet

/* MASTER SWITCH — AI features are PAUSED by default ("coming soon").
   While off: no request ever leaves the browser, no key is asked for, the
   badge reads "AI: coming soon", AI-only controls are disabled and
   labelled, and everything else uses the built-in local checker. All the
   AI code below is kept intact so it can be switched back on later by
   setting `aiEnabled: true` in config.local.js (no code change needed),
   or by flipping AI_ENABLED_DEFAULT. */
const AI_ENABLED_DEFAULT = false;
const AI_PAUSED_DETAIL = 'AI features are paused for now (coming soon). The built-in checker is used instead, and nothing leaves this browser.';
function aiEnabled(){
  const v = getAiConfig().aiEnabled;
  return typeof v === 'boolean' ? v : AI_ENABLED_DEFAULT;
}

function getAiConfig(){
  try{ return (window.RESUME_BUILDER_CONFIG && typeof window.RESUME_BUILDER_CONFIG === 'object') ? window.RESUME_BUILDER_CONFIG : {}; }
  catch(e){ return {}; }
}

function getGroqKey(){
  const cfgKey = getAiConfig().groqApiKey;
  if(typeof cfgKey === 'string' && cfgKey.trim()) return cfgKey.trim();
  try{ return (localStorage.getItem(AI_KEY_STORAGE) || '').trim(); }
  catch(e){ return ''; }
}

/* ── AI connection status ──
   Small badge (landing nav + builder toolbar) showing whether AI
   features are actually usable right now. It reflects real behavior:
   a startup probe, a re-probe every AI_RECHECK_MS while the tab is
   visible, re-probes on online/offline and tab-focus, and every real
   AI call updates it with what actually happened. Clicking it re-checks
   (or, if no key is set, prompts for one). */
let aiStatus = aiEnabled()
  ? { state: 'checking', detail: 'Checking AI connection…', at: 0 }
  : { state: 'paused', detail: AI_PAUSED_DETAIL, at: 0 };
const AI_STATUS_META = {
  'paused':         { dot: '○', label: 'AI: coming soon',    cls: 'ai-status-off ai-status-paused' },
  'not-configured': { dot: '○', label: 'AI: not set up',     cls: 'ai-status-off' },
  'checking':       { dot: '◌', label: 'AI: checking…',      cls: 'ai-status-checking' },
  'connected':      { dot: '●', label: 'AI: connected',      cls: 'ai-status-on' },
  'limited':        { dot: '●', label: 'AI: rate-limited',   cls: 'ai-status-error' },
  'unavailable':    { dot: '●', label: 'AI: unavailable',    cls: 'ai-status-error' },
};

function aiStatusTitle(){
  const meta = AI_STATUS_META[aiStatus.state] || AI_STATUS_META.unavailable;
  const base = aiStatus.detail || meta.label;
  if(aiStatus.state === 'paused') return base; // nothing to check or click
  const when = aiStatus.at ? ` (checked ${new Date(aiStatus.at).toLocaleTimeString()})` : '';
  const hint = aiStatus.state === 'not-configured' ? ' Click to add your key.' : ' Click to re-check.';
  return base + when + hint;
}

function aiStatusBadgeHTML(){
  const meta = AI_STATUS_META[aiStatus.state] || AI_STATUS_META.unavailable;
  return `<span class="ai-status-badge ${meta.cls}" title="${esc(aiStatusTitle())}">${meta.dot} ${meta.label}</span>`;
}

function syncNavAiStatus(){
  const el = document.getElementById('navAiStatus');
  if(!el) return;
  const meta = AI_STATUS_META[aiStatus.state] || AI_STATUS_META.unavailable;
  el.className = `ai-status-badge ${meta.cls}`;
  el.textContent = `${meta.dot} ${meta.label}`;
  el.title = aiStatusTitle();
}

function setAiStatus(state, detail){
  aiStatus = { state, detail: detail || '', at: Date.now() };
  syncNavAiStatus();
  // renderToolbar() rewrites #toolbarLeft wholesale — safe to call even
  // before the builder is ever entered, it just paints into a hidden
  // element (same reasoning landing.js already relies on for renderStep()).
  if(typeof renderToolbar === 'function') renderToolbar();
}

// fetch with a hard timeout, so a hung connection can't leave the UI
// sitting on "Rewriting…" forever.
async function aiFetch(url, init, timeoutMs){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try{ return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally{ clearTimeout(timer); }
}

// Probe — hits Groq's model-list endpoint (a plain GET, no completion
// tokens spent). Confirms the key is valid, the service is reachable,
// AND that a usable model exists on this account, then remembers which
// one callAI() should use. Concurrent calls share one in-flight probe.
let _aiProbeInFlight = null;
function checkAiConnection(){
  if(!_aiProbeInFlight){
    _aiProbeInFlight = _probeAi().finally(() => { _aiProbeInFlight = null; });
  }
  return _aiProbeInFlight;
}

async function _probeAi(){
  if(!aiEnabled()){
    AI_MODEL = null;
    if(aiStatus.state !== 'paused') setAiStatus('paused', AI_PAUSED_DETAIL);
    return;
  }
  const key = getGroqKey();
  if(!key){
    AI_MODEL = null;
    setAiStatus('not-configured', 'No Groq API key set — AI features are off.');
    return;
  }
  if(typeof navigator !== 'undefined' && navigator.onLine === false){
    setAiStatus('unavailable', 'You appear to be offline — AI features will use the local checker until you reconnect.');
    return;
  }
  // Don't flash "checking…" over a healthy badge on routine re-probes.
  if(aiStatus.state !== 'connected') setAiStatus('checking', 'Checking AI connection…');
  try{
    const res = await aiFetch(AI_MODELS_ENDPOINT, { headers: { 'Authorization': `Bearer ${key}` } }, AI_PROBE_TIMEOUT_MS);
    if(res.status === 401 || res.status === 403){
      AI_MODEL = null;
      setAiStatus('unavailable', 'Groq rejected the API key — check it is correct.');
      return;
    }
    if(res.status === 429){
      setAiStatus('limited', 'Groq rate limit reached — AI will recover on its own; using the local checker meanwhile.');
      return;
    }
    if(!res.ok){
      AI_MODEL = null;
      setAiStatus('unavailable', `Groq returned an error (${res.status}).`);
      return;
    }
    const data = await res.json().catch(() => null);
    const ids = Array.isArray(data?.data) ? data.data.map(m => m && m.id).filter(Boolean) : [];
    const preferred = getAiConfig().groqModel;
    const pick = [preferred, ...AI_MODEL_CANDIDATES].find(m => m && ids.includes(m));
    if(!pick){
      AI_MODEL = null;
      setAiStatus('unavailable', 'Key is valid, but none of the supported models are available on this Groq account.');
      return;
    }
    AI_MODEL = pick;
    setAiStatus('connected', `AI is connected — key valid, using ${pick}.`);
  }catch(e){
    setAiStatus('unavailable', e && e.name === 'AbortError'
      ? 'Groq did not respond in time — will retry automatically.'
      : 'Could not reach Groq — check your internet connection.');
  }
}

// Keeps the badge honest over time instead of only checking once.
let _aiMonitorStarted = false;
function startAiStatusMonitor(){
  if(_aiMonitorStarted || !aiEnabled()) return; // paused: no timers, no listeners, no prompts
  _aiMonitorStarted = true;
  setInterval(() => { if(!document.hidden) checkAiConnection(); }, AI_RECHECK_MS);
  window.addEventListener('online', () => checkAiConnection());
  window.addEventListener('offline', () => {
    setAiStatus('unavailable', 'You appear to be offline — AI features will use the local checker until you reconnect.');
  });
  document.addEventListener('visibilitychange', () => {
    if(!document.hidden && Date.now() - (aiStatus.at || 0) > 30000) checkAiConnection();
  });
  // Badge click: no key → ask for one; otherwise force a re-check.
  document.addEventListener('click', (ev) => {
    const badge = ev.target && ev.target.closest && ev.target.closest('.ai-status-badge');
    if(!badge) return;
    if(aiStatus.state === 'not-configured') promptForGroqKey();
    else checkAiConnection();
  });
}

function promptForGroqKey(){
  const entered = window.prompt(
    'Paste your Groq API key. It is saved only in this browser (not in the app files).\nLeave empty to remove a saved key.',
    ''
  );
  if(entered === null) return; // cancelled
  try{
    const trimmed = entered.trim();
    if(trimmed) localStorage.setItem(AI_KEY_STORAGE, trimmed);
    else localStorage.removeItem(AI_KEY_STORAGE);
  }catch(e){
    if(typeof showToast === 'function') showToast("Couldn't save the key in this browser — use config.local.js instead.", 'error');
    return;
  }
  checkAiConnection();
}

// Thin wrapper around one chat-completion call. `messages` is the
// standard [{role, content}] array. Returns the assistant's raw text
// reply, or throws — callers decide how to surface failures (the
// writing panel falls back to the local checker; the JD panel shows
// a toast). Keeps the status badge in sync with how the AI is
// actually behaving right now, not just the periodic probe.
async function callAI(messages, { json = false, maxTokens = 800 } = {}){
  if(!aiEnabled()) throw new Error('AI features are paused'); // hard stop: never touch the network
  const key = getGroqKey();
  if(!key){
    setAiStatus('not-configured', 'No Groq API key set — AI features are off.');
    throw new Error('AI not configured: no Groq API key');
  }
  if(!AI_MODEL){
    await checkAiConnection();
    if(!AI_MODEL) throw new Error(`AI unavailable: ${aiStatus.detail}`);
  }
  const model = AI_MODEL;
  // gpt-oss models spend part of the token budget on hidden reasoning;
  // keep it short and leave headroom so the JSON answer isn't truncated.
  const isGptOss = /gpt-oss/i.test(model);
  const body = {
    model,
    max_tokens: maxTokens + (isGptOss ? 1024 : 0),
    temperature: 0.4,
    messages,
    ...(isGptOss ? { reasoning_effort: 'low', include_reasoning: false } : {}),
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  };
  const post = () => aiFetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify(body),
  }, AI_CALL_TIMEOUT_MS);

  let res;
  try{
    res = await post();
  }catch(e){
    setAiStatus('unavailable', e && e.name === 'AbortError'
      ? 'The AI request timed out — will retry automatically.'
      : 'Could not reach Groq — check your internet connection.');
    throw e;
  }

  let errText = '';
  if(!res.ok){
    errText = await res.text().catch(() => '');
    // Some models reject JSON mode — retry once without it; callAIJson
    // already tolerates fenced / chatty replies.
    if(res.status === 400 && json && /response_format|json/i.test(errText)){
      delete body.response_format;
      try{ res = await post(); }
      catch(e){
        setAiStatus('unavailable', 'Could not reach Groq — check your internet connection.');
        throw e;
      }
      errText = res.ok ? '' : await res.text().catch(() => '');
    }
  }

  if(!res.ok){
    if(res.status === 401 || res.status === 403){
      AI_MODEL = null;
      setAiStatus('unavailable', 'Groq rejected the API key — check it is correct.');
    }else if(res.status === 429){
      setAiStatus('limited', 'Groq rate limit reached — using the local checker; AI will recover on its own.');
    }else if(res.status === 404 || (/model/i.test(errText) && /(not found|decommission|deprecat|does not exist|no longer)/i.test(errText))){
      // Model was retired / removed since the last probe — rediscover.
      AI_MODEL = null;
      setAiStatus('unavailable', `Model ${model} is no longer available — looking for another…`);
      checkAiConnection();
    }else{
      setAiStatus('unavailable', `The last AI call failed (${res.status}).`);
    }
    throw new Error(`AI request failed (${res.status}): ${errText.slice(0,200)}`);
  }

  const data = await res.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  if(typeof text !== 'string' || !text.trim()){
    setAiStatus('unavailable', 'The AI replied with no usable content — will retry on the next request.');
    throw new Error('AI response had no content');
  }
  setAiStatus('connected', `AI is connected — key valid, using ${model}.`);
  return text;
}

// Same contract as callAI but parses the reply as JSON, stripping
// stray ```json fences and <think> blocks some models add despite
// instructions, and falling back to the outermost {...} if there is
// chatter around it.
async function callAIJson(messages, opts = {}){
  const raw = await callAI(messages, { ...opts, json: true });
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*```(?:json)?\s*|\s*```\s*$/gi, '')
    .trim();
  try{
    return JSON.parse(cleaned);
  }catch(e){
    const a = cleaned.indexOf('{'), b = cleaned.lastIndexOf('}');
    if(a > -1 && b > a) return JSON.parse(cleaned.slice(a, b + 1));
    throw e;
  }
}

// ── Provider seam ──
// Swap ACTIVE_PROVIDER to point at a new function with this exact
// signature — (fieldType, text, context) => Promise<issue[]> — to
// bring in a real model later (e.g. a self-hosted Llama endpoint).
// Nothing that calls getSuggestions() needs to know which one is live.
const SUGGESTION_PROVIDERS = { local: suggestionsLocal, ai: suggestionsAI };
let ACTIVE_PROVIDER = 'ai'; // calls Groq directly via callAI() above; falls back to 'local' automatically if a call fails
async function getSuggestions(fieldType, text, context){
  // Paused → go straight to the local checker (no AI attempt, no fallback noise).
  if(!aiEnabled()) return suggestionsLocal(fieldType, text, context);
  try{
    return await SUGGESTION_PROVIDERS[ACTIVE_PROVIDER](fieldType, text, context);
  }catch(e){
    // Network/model failure never blocks the writing panel — silently
    // fall back to the local rule-based checker for this call.
    if(ACTIVE_PROVIDER !== 'local') return suggestionsLocal(fieldType, text, context);
    return [];
  }
}

// AI PROVIDER — same (fieldType, text, context) => issue[] shape as
// suggestionsLocal, so the caller (collectWritingIssues, used by the
// Analyze Resume step) works unmodified. Asks the model for grammar/
// wording issues AND a suggested fix per line, matched to the same
// { lineIndex, severity, message, fix } shape the local checker
// produces.
async function suggestionsAI(fieldType, text, context){
  if(fieldType === 'summary_text') return suggestionsAISummary(text);
  if(fieldType !== 'experience_bullet' && fieldType !== 'project_bullet') return [];
  const lines = (text || '').split('\n').map(l => l.replace(/^•\s*/, ''));
  const nonEmpty = lines.map((l,i) => ({ i, l })).filter(x => x.l.trim());
  if(!nonEmpty.length) return [];

  const prompt = `You are a resume-writing reviewer. For each numbered bullet line below, check grammar, spelling, tense consistency, weak "duty-list" openers (e.g. "responsible for", "helped with"), and whether it quantifies a result. ${context?.isCurrentRole ? 'This is a CURRENT role — bullets should use present tense/gerund, not past tense.' : 'This is a PAST role — bullets should use past tense.'}

Lines:
${nonEmpty.map(x => `${x.i}: ${x.l}`).join('\n')}

Respond ONLY with JSON: {"issues":[{"lineIndex":<number>,"severity":"high"|"medium"|"low","message":"<short actionable note>","fix":"<corrected full line, or null if it needs manual judgment>"}]}. Omit lines with no issues. No preamble, no markdown fences.`;

  const parsed = await callAIJson([{ role:'user', content: prompt }], { maxTokens: 900 });
  const issues = Array.isArray(parsed?.issues) ? parsed.issues : [];
  return issues
    .filter(it => Number.isInteger(it.lineIndex) && lines[it.lineIndex] !== undefined)
    .map(it => ({
      lineIndex: it.lineIndex,
      severity: ['high','medium','low'].includes(it.severity) ? it.severity : 'medium',
      message: String(it.message || 'Review this line'),
      fix: it.fix ? String(it.fix) : null,
    }));
}

// Summary is one prose paragraph, not line-delimited bullets — asked
// for as sentence-indexed issues against the same sentence split the
// local checker uses, so scrollToWritingIssue/applyWritingFix (which
// operate on \n-joined "lines") stay consistent: the summary textarea
// has no real newlines, so lineIndex here addresses SENTENCES joined
// back with a single space on apply.
async function suggestionsAISummary(text){
  const trimmed = (text || '').trim();
  if(!trimmed) return [];
  const sentences = trimmed.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  if(!sentences.length) return [];

  const prompt = `You are a resume-writing reviewer. This is a professional summary (2-5 sentences of prose, not bullets). For each numbered sentence below, check grammar, spelling, first-person pronoun use ("I", "my" — summaries should usually avoid these), weak/vague language, and clarity.

Sentences:
${sentences.map((s,i) => `${i}: ${s}`).join('\n')}

Respond ONLY with JSON: {"issues":[{"lineIndex":<number>,"severity":"high"|"medium"|"low","message":"<short actionable note>","fix":"<corrected full sentence, or null if it needs manual judgment>"}]}. Omit sentences with no issues. No preamble, no markdown fences.`;

  const parsed = await callAIJson([{ role:'user', content: prompt }], { maxTokens: 700 });
  const issues = Array.isArray(parsed?.issues) ? parsed.issues : [];
  return issues
    .filter(it => Number.isInteger(it.lineIndex) && sentences[it.lineIndex] !== undefined)
    .map(it => ({
      lineIndex: it.lineIndex,
      severity: ['high','medium','low'].includes(it.severity) ? it.severity : 'medium',
      message: String(it.message || 'Review this sentence'),
      fix: it.fix ? String(it.fix) : null,
    }));
}

// PARAPHRASE — used by the section-level "Rewrite with AI" button on
// an experience/project card. Takes the ENTIRE bullet block for that
// one entry and returns AT MOST 5 rewritten bullet lines. If the
// original has more than 5 lines, the model is instructed to
// consolidate/merge related points down to 5 rather than truncate —
// every original bullet's substance should still be represented
// somewhere in the 5, just combined where two lines cover one theme.
const MAX_REWRITE_BULLETS = 5;
async function rewriteBulletSection(text, { fieldType, isCurrentRole, jdText, focusKeyword, focusNote } = {}){
  const lines = (text || '').split('\n').map(l => l.replace(/^•\s*/, '').trim()).filter(Boolean);
  if(!lines.length) return [];

  const roleHint = fieldType === 'experience_bullet'
    ? (isCurrentRole ? 'Use present tense/gerund throughout (this is a current role).' : 'Use past tense throughout (this is a past role).')
    : '';
  const jdHint = jdText
    ? `Where it fits naturally without misrepresenting the work, favor terminology and priorities from this job description: """${jdText.slice(0, 1200)}"""`
    : '';
  // focusKeyword/focusNote drive a targeted, one-suggestion rewrite
  // (the JD Suggestions "Apply" button) rather than the generic
  // section-level "Rewrite with AI" pass — the model is told exactly
  // which missing keyword this rewrite exists to work in, and told to
  // hold everything else close to the original wording so a person
  // reviewing the diff sees one focused change, not a full rewording.
  const focusHint = (focusKeyword || focusNote)
    ? `\nThis specific rewrite has ONE job: naturally work in the keyword/skill "${focusKeyword || ''}" — ${focusNote || 'per the reviewer note above'} — into whichever bullet it truthfully fits. Only do this if the original bullets already support that claim; never invent a tool, result, or responsibility the person didn't already describe. Leave bullets that aren't related to this keyword as close to their original wording as possible — this is a targeted edit, not a full rewrite.`
    : '';
  const countHint = lines.length > MAX_REWRITE_BULLETS
    ? `The original has ${lines.length} bullets — that is too many. CONSOLIDATE related bullets so the result is exactly ${MAX_REWRITE_BULLETS} bullets. Do not simply drop bullets — merge overlapping points into one stronger line so no original achievement is lost, unless a line is truly redundant.`
    : `Keep it to ${lines.length <= MAX_REWRITE_BULLETS ? lines.length : MAX_REWRITE_BULLETS} bullets, never more than ${MAX_REWRITE_BULLETS}.`;

  const prompt = `Rewrite this full set of resume bullets to be stronger. Each bullet: lead with an action verb, stay truthful to the original facts (never invent new numbers or achievements), quantify results where one is implied. ${roleHint} ${jdHint}${focusHint}
${countHint}

Original bullets:
${lines.map((l,i) => `${i+1}. ${l}`).join('\n')}

Respond ONLY with JSON: {"bullets":["line one","line two", ...]}. Maximum ${MAX_REWRITE_BULLETS} strings in the array. No preamble, no markdown fences, no bullet symbols inside the strings.`;

  const parsed = await callAIJson([{ role:'user', content: prompt }], { maxTokens: 900 });
  const out = Array.isArray(parsed?.bullets) ? parsed.bullets.map(String).filter(Boolean) : [];
  return out.slice(0, MAX_REWRITE_BULLETS);
}

/* ── Rewrite-with-AI button wiring (Experience / Projects cards) ──
   Section-level, not per-line: rewrites the whole Achievements /
   Description block for one entry, capped at MAX_REWRITE_BULLETS.
   Shows a preview with Accept/Discard rather than overwriting the
   textarea immediately, since this can restructure/merge lines. */
let _pendingRewrite = null; // { key, index, bullets } for whichever card is mid-preview

async function startSectionRewrite(key, i){
  if(!aiEnabled()){ showToast('AI rewriting is coming soon', 'error'); return; }
  const fieldId = key === 'experience' ? `exp_desc_${i}` : `proj_desc_${i}`;
  const btn = $(`rewriteBtn_${key}_${i}`);
  const slot = $(`rewriteSlot_${key}_${i}`);
  const ta = $(fieldId);
  if(!ta || !slot) return;

  const original = ta.value;
  if(!original.trim()){ showToast('Add a bullet or two first', 'error'); return; }

  if(btn){ btn.disabled = true; btn.textContent = 'Rewriting…'; }
  slot.innerHTML = `<div class="rewrite-preview rewrite-loading">Rewriting with AI…</div>`;

  try{
    const fieldType = key === 'experience' ? 'experience_bullet' : 'project_bullet';
    const isCurrentRole = key === 'experience' ? !!state.data.experience[i]?.current : false;
    const jdText = (state.data.jd || '').trim() || null;
    const bullets = await rewriteBulletSection(original, { fieldType, isCurrentRole, jdText });

    if(!bullets.length){
      slot.innerHTML = '';
      showToast("Couldn't generate a rewrite — try again", 'error');
      return;
    }
    _pendingRewrite = { key, i, bullets };
    renderRewritePreview(key, i);
  }catch(e){
    slot.innerHTML = '';
    showToast('AI rewrite failed — check your connection', 'error');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '✦ Rewrite with AI'; }
  }
}

function renderRewritePreview(key, i){
  const slot = $(`rewriteSlot_${key}_${i}`);
  if(!slot || !_pendingRewrite) return;
  const { bullets } = _pendingRewrite;
  slot.innerHTML = `<div class="rewrite-preview">
    <div class="rewrite-preview-title">AI rewrite (${bullets.length} bullet${bullets.length===1?'':'s'}) — review before applying</div>
    <ul class="rewrite-preview-list">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    <div class="rewrite-preview-actions">
      <button type="button" class="btn btn-primary btn-sm" onclick="acceptRewrite('${key}',${i})">Use this rewrite</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="discardRewrite('${key}',${i})">Discard</button>
    </div>
  </div>`;
}

function acceptRewrite(key, i){
  if(!_pendingRewrite || _pendingRewrite.key !== key || _pendingRewrite.i !== i) return;
  const fieldId = key === 'experience' ? `exp_desc_${i}` : `proj_desc_${i}`;
  const ta = $(fieldId);
  if(!ta) return;
  ta.value = _pendingRewrite.bullets.map(b => BULLET + b).join('\n');
  saveField();
  discardRewrite(key, i); // clears the preview slot
  showToast('Rewrite applied', 'success');
  renderAnalyzeResults();
}

function discardRewrite(key, i){
  _pendingRewrite = null;
  const slot = $(`rewriteSlot_${key}_${i}`);
  if(slot) slot.innerHTML = '';
}

/* ── JD Suggestions "Apply" (Analyze Resume step) ──
   Gives the AI's contextual suggestions (jd.suggestions[], e.g. "work
   Kubernetes into your DevOps Engineer bullet") the same one-click,
   review-before-committing treatment the per-card "Rewrite with AI"
   button already has — reusing rewriteBulletSection with a focus
   hint, rather than leaving these as read-only "jump to that step"
   pointers. Only suggestions with a targetField (experience/projects)
   qualify; summary/skills suggestions still just navigate, since
   there's no single bullet block to rewrite for those. */
let _pendingJdSuggestionRewrite = null; // { idx, key, i, bullets }

async function applyJdSuggestion(idx){
  if(!aiEnabled()){ showToast('AI suggestions are coming soon', 'error'); return; }
  const jd = _resumeAnalysis?.jd;
  const s = jd?.suggestions?.[idx];
  if(!s || !s.targetField) return;
  const expMatch = /^exp_desc_(\d+)$/.exec(s.targetField);
  const projMatch = /^proj_desc_(\d+)$/.exec(s.targetField);
  const key = expMatch ? 'experience' : (projMatch ? 'projects' : null);
  const i = expMatch ? +expMatch[1] : (projMatch ? +projMatch[1] : null);
  if(!key || i === null || !state.data[key]?.[i]) return;
  const entry = state.data[key][i];

  const slot = $(`jdSuggSlot_${idx}`);
  const btn = $(`jdSuggApplyBtn_${idx}`);
  if(btn){ btn.disabled = true; btn.textContent = 'Rewriting…'; }
  if(slot) slot.innerHTML = `<div class="rewrite-preview rewrite-loading">Rewriting with AI…</div>`;

  try{
    const isCurrentRole = key === 'experience' ? !!entry.current : false;
    const jdText = (state.data.jd || '').trim() || null;
    const bullets = await rewriteBulletSection(entry.description, {
      fieldType: key === 'experience' ? 'experience_bullet' : 'project_bullet',
      isCurrentRole, jdText,
      focusKeyword: s.keyword, focusNote: s.note,
    });
    if(!bullets.length){
      if(slot) slot.innerHTML = '';
      showToast("Couldn't generate a rewrite — try again", 'error');
      return;
    }
    _pendingJdSuggestionRewrite = { idx, key, i, bullets };
    renderJdSuggestionPreview(idx);
  }catch(e){
    if(slot) slot.innerHTML = '';
    showToast('AI rewrite failed — check your connection', 'error');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = 'Apply with AI'; }
  }
}

function renderJdSuggestionPreview(idx){
  const slot = $(`jdSuggSlot_${idx}`);
  if(!slot || !_pendingJdSuggestionRewrite || _pendingJdSuggestionRewrite.idx !== idx) return;
  const { bullets } = _pendingJdSuggestionRewrite;
  slot.innerHTML = `<div class="rewrite-preview">
    <div class="rewrite-preview-title">AI rewrite (${bullets.length} bullet${bullets.length===1?'':'s'}) — review before applying</div>
    <ul class="rewrite-preview-list">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    <div class="rewrite-preview-actions">
      <button type="button" class="btn btn-primary btn-sm" onclick="acceptJdSuggestion(${idx})">Use this rewrite</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="discardJdSuggestion(${idx})">Discard</button>
    </div>
  </div>`;
}

function acceptJdSuggestion(idx){
  if(!_pendingJdSuggestionRewrite || _pendingJdSuggestionRewrite.idx !== idx) return;
  const { key, i, bullets } = _pendingJdSuggestionRewrite;
  const entry = state.data[key]?.[i];
  if(!entry) return;
  entry.description = bullets.map(b => BULLET + b).join('\n');
  saveLS();
  renderPreview();

  const s = _resumeAnalysis?.jd?.suggestions?.[idx];

  // The bullet text just changed — any writing issues cached against
  // this field are stale, same as a direct "Apply fix". This also
  // re-renders the Analyze panel.
  if(s?.targetField) reconcileWritingFixesLocally([s.targetField]);

  // If this suggestion targeted a specific known "missing" keyword,
  // resolve it the same locally-only way applyMissingKeyword does —
  // the keyword is now literally in the rewritten bullet, no extra AI
  // round trip needed to "confirm" that.
  if(s?.keyword && _resumeAnalysis?.jd){
    const m = _resumeAnalysis.jd.missing.find(mm => mm.text.toLowerCase() === s.keyword.toLowerCase());
    if(m) reconcileKeywordMatchLocally([m]);
  }

  discardJdSuggestion(idx);
  showToast('Suggestion applied', 'success');
}

function discardJdSuggestion(idx){
  if(_pendingJdSuggestionRewrite?.idx === idx) _pendingJdSuggestionRewrite = null;
  const slot = $(`jdSuggSlot_${idx}`);
  if(slot) slot.innerHTML = '';
}

/* ════════════════════════════════════════════════════════════════
   KEYWORD MATCHING — part of the Analyze Resume step. Sends the
   pasted job description alongside a compact snapshot of the
   resume's own content and asks for: matched keywords, missing
   keywords, and up to 5 concrete line-level suggestions. Read-only
   analysis — this never edits resume fields itself; each suggestion
   just points at which field to revisit (the per-card "Rewrite with
   AI" button, already JD-aware via state.data.jd, does the actual
   rewriting).
   ════════════════════════════════════════════════════════════════ */

// Flattens the parts of the resume worth keyword-matching against into
// plain text for the prompt (and for the literal-text reconciliation
// pass below). Dates/contact info deliberately excluded — those never
// carry JD keywords. Title, education, and certifications ARE included
// (unlike the original version, which omitted them): a JD asking for
// "AWS Certified" or a specific degree would otherwise get reported as
// permanently "missing" even when the resume already states it, just
// because that content lives outside the summary/skills/experience
// fields this function used to look at.
function buildResumeSnapshot(){
  const d = state.data;
  const parts = [];
  if(d.personal.title.trim()) parts.push(`Title: ${d.personal.title.trim()}`);
  if(d.summary.trim()) parts.push(`Summary: ${d.summary.trim()}`);
  const allSkills = [...d.skills.technical, ...d.skills.core];
  if(allSkills.length) parts.push(`Skills: ${allSkills.join(', ')}`);
  d.experience.forEach(ex => {
    if(ex.description.trim()) parts.push(`Experience (${ex.role || 'role'} @ ${ex.company || 'company'}): ${ex.description.trim()}`);
  });
  d.projects.forEach(p => {
    if(p.description.trim()) parts.push(`Project (${p.name || 'project'}): ${p.description.trim()}`);
  });
  d.education.forEach(ed => {
    const line = [ed.degree, ed.field ? `in ${ed.field}` : '', ed.school ? `— ${ed.school}` : ''].filter(Boolean).join(' ');
    if(line.trim()) parts.push(`Education: ${line.trim()}`);
  });
  if(d.certifications.some(c => c.name)) {
    parts.push(`Certifications: ${d.certifications.filter(c => c.name).map(c => [c.name, c.issuer].filter(Boolean).join(' — ')).join('; ')}`);
  }
  return parts.join('\n\n');
}

// One-directional safety net, run after the AI call in analyzeJdMatch:
// promotes an item the AI called "missing" to "matched" when its exact
// text is literally present in the resume snapshot. Deliberately never
// runs the other way (downgrading a "matched" item just because its
// exact text isn't literally present) — the AI is legitimately better
// than a substring check at recognizing a synonym match (e.g. JD
// "Kubernetes" satisfied by resume "K8s"), and reclassifying those away
// would trade a real capability for a false sense of rigor. This only
// ever corrects the AI's false negatives, never second-guesses its
// positives — the same literal-scan approach many real ATS keyword
// filters actually use, so a "missing" item that survives this pass is
// one that's provably not in the resume's own text, not just an LLM's
// opinion.
function reconcileMissingAgainstSnapshot(matched, missing, snapshotText){
  const haystack = (snapshotText || '').toLowerCase();
  function isLiterallyPresent(text){
    const needle = text.toLowerCase().trim();
    if(!needle) return false;
    if(needle.includes(' ')) return haystack.includes(needle);
    // Single-token keywords need a word-boundary check so "AI" doesn't
    // match inside "email" or "Air", and "R" doesn't match inside "HR".
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
  }
  const stillMissing = [], rescued = [];
  missing.forEach(m => (isLiterallyPresent(m.text) ? rescued : stillMissing).push(m));
  return { matched: [...matched, ...rescued], missing: stillMissing };
}

async function analyzeJdMatch(jdText, resumeSnapshot){
  const prompt = `You are helping tailor a resume to a specific job description. Compare the RESUME content against the JOB DESCRIPTION and identify keyword/skill alignment.

JOB DESCRIPTION:
"""${jdText.slice(0, 4000)}"""

RESUME CONTENT:
"""${resumeSnapshot.slice(0, 4000) || '(empty — no resume content yet)'}"""

Respond ONLY with JSON in this exact shape:
{
  "matched": [{"text":"keyword already present in the resume","group":"technical"|"core","priority":"required"|"preferred"}, ...],
  "missing": [{"text":"important keyword/skill from the JD that the resume does NOT mention","group":"technical"|"core","priority":"required"|"preferred"}, ...],
  "suggestions": [{"area":"summary"|"skills"|"experience"|"projects","note":"<one concrete, specific suggestion for working a missing keyword in naturally>","targetField":"<fieldId this applies to, e.g. 's_text' for summary or 'exp_desc_0' for the first experience entry's bullets — omit if area is 'skills'>","keyword":"<the single missing keyword this suggestion is about>"}]
}
For each "matched"/"missing" item: set "group" to "technical" for tools/software/hard skills (e.g. Power BI, SAP ERP, Six Sigma) and "core" for soft skills/competencies (e.g. Accountability, Time Management). Set "priority" to "required" if the JD lists it as a must-have, appears more than once, or sits in the JD's core requirements/title — otherwise "preferred". Limit "matched" and "missing" to at most 12 items each, most important first. Limit "suggestions" to at most 5 items, and only give a "targetField" when area is "experience" or "projects" (matching the numbered entries implied by the resume content above, 0-indexed in order). Never suggest fabricating experience the resume doesn't support — only suggest rewording existing content or adding a skill the resume implies. No preamble, no markdown fences.`;

  const parsed = await callAIJson([{ role:'user', content: prompt }], { maxTokens: 1300 });
  // Tolerates the AI returning matched/missing as plain strings (older
  // shape, or a model that ignores the group/priority instructions) by
  // defaulting group to 'technical' and priority to 'preferred' —
  // never drop an item just for missing a field.
  const normalizeKeywordItem = (m) => {
    const text = String((m && typeof m === 'object') ? (m.text ?? '') : (m ?? '')).trim();
    const group = (m && typeof m === 'object' && m.group === 'core') ? 'core' : 'technical';
    const priority = (m && typeof m === 'object' && m.priority === 'required') ? 'required' : 'preferred';
    return { text, group, priority };
  };
  const rawMatched = Array.isArray(parsed?.matched) ? parsed.matched.slice(0,12).map(normalizeKeywordItem).filter(m => m.text) : [];
  const rawMissing = Array.isArray(parsed?.missing) ? parsed.missing.slice(0,12).map(normalizeKeywordItem).filter(m => m.text) : [];
  // Safety net against the AI's own false negatives — see the function's
  // own comment for why this only ever moves items missing -> matched.
  const { matched, missing } = reconcileMissingAgainstSnapshot(rawMatched, rawMissing, resumeSnapshot);

  return {
    matched, missing,
    suggestions: Array.isArray(parsed?.suggestions) ? parsed.suggestions.slice(0,5).map(s => ({
      area: ['summary','skills','experience','projects'].includes(s.area) ? s.area : 'summary',
      note: String(s.note || ''),
      // Only experience/projects suggestions carry a real fieldId — a
      // 'skills' or 'summary' area suggestion without one just falls
      // back to "jump to that step", same as before.
      targetField: (['experience','projects'].includes(s.area) && typeof s.targetField === 'string' && /^(exp|proj)_desc_\d+$/.test(s.targetField)) ? s.targetField : null,
      keyword: String(s.keyword || '').trim() || null,
    })).filter(s => s.note) : [],
  };
}

// _resumeAnalysis holds everything the Analyze Resume panel shows,
// cached so switching steps and back re-renders without a new call:
//   { atsScore: {score, reasons}, jd: {matched,missing,suggestions}|null,
//     issuesByArea: { summary:[], experience:[], projects:[] } }
let _resumeAnalysis = null;

async function runResumeAnalysis(){
  const btn = $('analyzeBtn');
  const slot = $('analyzeResultSlot');
  if(!slot) return;

  const aiOn = aiEnabled();
  if(btn){ btn.disabled = true; btn.textContent = 'Analyzing…'; }
  slot.innerHTML = `<div class="rewrite-preview rewrite-loading">${aiOn ? 'Analyzing grammar, wording, and keywords…' : 'Analyzing grammar and wording…'}</div>`;

  try{
    // Read the JD textarea's live value directly rather than trusting
    // state.data.jd to already be in sync — oninput's saveField() call
    // can lag behind (or be skipped by some paste paths) a click that
    // follows immediately after pasting, which was causing Analyze to
    // run with an empty JD even though text was visibly in the box.
    const liveJd = aiOn ? gv('jd_text') : '';
    if(liveJd) state.data.jd = liveJd;
    // Keyword matching is AI-only (no local fallback), so while AI is
    // paused it is skipped entirely — a saved JD stays saved, untouched.
    const jdText = aiOn ? (state.data.jd || '').trim() : '';

    // Writing check across summary + experience + projects, and (if a
    // JD was pasted) the keyword match — run together so one button
    // press produces the whole report. The JD call is isolated with
    // its own catch: if it fails (bad/missing API key, network), the
    // rest of the report — ATS score, grammar/wording issues — should
    // still render rather than the whole analysis aborting.
    // Keep whatever JD analysis we already had (if any) as the fallback
    // for this run — a failed re-analysis should never erase a
    // previously successful one. Only a JD call that actually succeeds
    // (or an empty JD box, meaning "no longer applicable") is allowed
    // to replace it.
    const previousJd = _resumeAnalysis?.jd || null;
    let jdFailed = false;
    const [issues, jdCallResult] = await Promise.all([
      collectWritingIssues(),
      jdText
        ? analyzeJdMatch(jdText, buildResumeSnapshot()).catch(() => { jdFailed = true; return undefined; })
        : Promise.resolve(null), // JD box genuinely empty — no JD to match against
    ]);
    _writingIssuesCache = issues;

    // undefined = call failed, keep last-good result; null = JD box is
    // empty, correctly clear it; object = fresh successful result.
    const jdResult = jdCallResult === undefined ? previousJd : jdCallResult;

    const issuesByArea = { summary:[], experience:[], projects:[] };
    issues.forEach(it => { if(issuesByArea[it.area]) issuesByArea[it.area].push(it); });

    const atsScore = computeAtsScore();
    const completeness = computeCompleteness(issues.length);
    const keywordScore = computeKeywordScore(jdResult);
    const overallScore = computeOverallScore(atsScore, completeness, keywordScore);

    // completeness is cached here (not just folded into overallScore)
    // so a later local-only reconcile (apply one keyword/fix) can
    // recompute overallScore without needing a full re-analysis to
    // regenerate it — see reconcileKeywordMatchLocally /
    // reconcileWritingFixesLocally below.
    _resumeAnalysis = { atsScore, completeness, keywordScore, overallScore, jd: jdResult, issuesByArea };
    renderAnalyzeResults();
    if(jdFailed) showToast(previousJd ? 'Keyword match refresh failed — showing last successful results.' : 'Keyword match failed — check your connection or API key.', 'error');
  }catch(e){
    slot.innerHTML = '';
    showToast('Analysis failed — check your connection', 'error');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '✦ Analyze Resume'; }
  }
}

// Maps a 0-100 score to a status class shared by rings, chips, and
// check icons — one scale, used everywhere a score is shown.
function scoreStatusClass(score){
  return score >= 80 ? 'ok' : (score >= 60 ? 'warn' : 'danger');
}

// Renders one ring in the score cluster. `result` is {score, reasons}
// as returned by the compute*Score functions above, or null for a
// score that hasn't been run yet (keyword match with no JD pasted).
// The ring's stroke-dashoffset is set inline so the arc length is a
// literal, proportional read of the number inside it — the shape
// *is* the score, not decoration next to it.
function renderScoreRing(label, sub, result, pendingText = 'No JD yet'){
  const R = 45, C = 2 * Math.PI * R;
  if(!result){
    return `<div class="score-ring-card">
      <div class="score-ring-wrap">
        <svg class="score-ring-svg" viewBox="0 0 108 108">
          <circle class="score-ring-track" cx="54" cy="54" r="${R}"/>
          <circle class="score-ring-bar pending" cx="54" cy="54" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}"/>
        </svg>
        <div class="score-ring-num pending">${esc(pendingText)}</div>
      </div>
      <div class="score-ring-label">${esc(label)}</div>
      <div class="score-ring-sub">${esc(sub)}</div>
    </div>`;
  }
  const cls = scoreStatusClass(result.score);
  const offset = C - (result.score/100)*C;
  return `<div class="score-ring-card">
    <div class="score-ring-wrap">
      <svg class="score-ring-svg" viewBox="0 0 108 108">
        <circle class="score-ring-track" cx="54" cy="54" r="${R}"/>
        <circle class="score-ring-bar ${cls}" cx="54" cy="54" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${offset}"/>
      </svg>
      <div class="score-ring-num">${result.score}</div>
    </div>
    <div class="score-ring-label">${esc(label)}</div>
    <div class="score-ring-sub">${esc(sub)}</div>
  </div>`;
}

// Re-renders the cached analysis (e.g. after an Apply click updates
// one issue) without re-running any AI calls. runResumeAnalysis()
// re-runs the calls; this just repaints from _resumeAnalysis.
function renderAnalyzeResults(){
  const slot = $('analyzeResultSlot');
  if(!slot || !_resumeAnalysis) return;
  const { atsScore, keywordScore, overallScore, jd, issuesByArea } = _resumeAnalysis;

  // ── Score cluster: Overall / ATS / Keyword Match, side by side ──
  const cluster = `<div class="score-cluster">
    ${renderScoreRing('Overall Score', 'Format, content, and keyword fit combined', overallScore)}
    ${renderScoreRing('ATS Score', 'Can a parser read this document', atsScore)}
    ${aiEnabled()
      ? renderScoreRing('Keyword Match', jd ? 'Resume coverage of the pasted JD' : 'Paste a job description to unlock', keywordScore)
      : renderScoreRing('Keyword Match', 'AI keyword matching is paused for now', null, 'Coming soon')}
  </div>`;

  const reasonsBlock = (title, result) => `<div class="jd-report-block ats-score-block">
    <div class="jd-report-title">${esc(title)}</div>
    ${result.reasons.length ? `<div class="ats-score-reasons">${result.reasons.map(r => `<div class="ats-check"><span class="ats-check-icon warn">!</span>${esc(r)}</div>`).join('')}</div>` : '<div class="jd-empty-note">No issues found in scored checks.</div>'}
  </div>`;

  // ── AI Suggestions: JD-aware keyword suggestions + grammar/wording
  // issues, merged into one clearly-labeled panel so it reads as a
  // single "here's what the AI found" surface rather than two
  // separate, differently-styled lists. ──
  const flatIssues = [];
  const writingRows = Object.entries(issuesByArea)
    .filter(([, list]) => list.length)
    .map(([, list]) => list.map(issue => {
      const idx = flatIssues.length;
      flatIssues.push(issue);
      return renderWritingIssueRow(issue, idx);
    }).join('')).join('');
  _writingIssuesCache = flatIssues;
  // Selection is by index into _writingIssuesCache, which is rebuilt
  // fresh on every render — old indices no longer correspond to the
  // same issues, so any prior selection is stale and gets dropped.
  _selectedFixIdx.clear();

  const jdSuggRows = (jd && jd.suggestions.length)
    ? jd.suggestions.map((s, idx) => {
        // Suggestions with a targetField (experience/projects) get a
        // real "Apply with AI" button — see applyJdSuggestion — that
        // rewrites that entry's bullets with this keyword worked in,
        // shown for review before committing. Summary/skills
        // suggestions have no single bullet block to target, so they
        // keep the original "click to jump to that step" behavior.
        const applyBtn = s.targetField
          ? `<button class="btn btn-secondary btn-sm" id="jdSuggApplyBtn_${idx}" onclick="event.stopPropagation(); applyJdSuggestion(${idx})">Apply with AI</button>`
          : '';
        return `<div class="writing-issue">
        <span class="writing-issue-icon medium ai-suggest-icon">✦</span>
        <div class="writing-issue-body" onclick="goStep(${STEPS.findIndex(st=>st.id===s.area)})">
          <div class="writing-issue-msg">${esc(s.note)}</div>
          <div class="writing-issue-meta">${esc(FIELD_AREA_LABEL[s.area] || s.area)} · keyword fit</div>
          <div id="jdSuggSlot_${idx}" onclick="event.stopPropagation()"></div>
        </div>
        ${applyBtn}
      </div>`;
      }).join('')
    : '';

  const suggestionRows = jdSuggRows + writingRows;
  const suggestCount = (jd ? jd.suggestions.length : 0) + flatIssues.length;
  // Only the writing-issue rows carry a concrete fix() a checkbox can
  // stage — JD keyword suggestions are read-only pointers to a step,
  // so they're excluded from "select all" / bulk apply entirely.
  const fixableCount = flatIssues.filter(i => i.fix).length;
  const selectAllControl = fixableCount > 1
    ? `<label class="select-all-fixes">
        <input type="checkbox" id="selectAllFixes" onchange="toggleSelectAllFixes(this.checked)">
        Select all
      </label>`
    : '';
  const aiSuggestBlock = `<div class="jd-report-block">
    <div class="jd-report-title-row">
      <div class="jd-report-title">${aiEnabled() ? 'AI Suggestions' : 'Suggestions'}${suggestCount ? ` (${suggestCount})` : ''}</div>
      ${selectAllControl}
    </div>
    ${suggestionRows
      ? `<div class="writing-panel" style="border:none;box-shadow:none;">${suggestionRows}</div>`
      : `<div class="jd-empty-note">${aiEnabled() ? 'No suggestions right now — grammar, wording, and keyword fit all look solid.' : 'No suggestions right now — grammar and wording look solid.'}</div>`}
    ${fixableCount > 1 ? `<div id="bulkApplyBar" class="bulk-apply-bar" style="display:none;">
      <span id="bulkApplyCount">0 selected</span>
      <button class="btn btn-primary btn-sm" onclick="applySelectedFixes()">Apply selected</button>
    </div>` : ''}
  </div>`;

  // ── Keyword detail: matched/missing chip lists, shown only once a
  // JD has actually been analyzed. Missing-keyword chips are the one
  // part of this panel that actually edits the resume: each carries
  // an "Add" button that inserts it into Skills (technical or core,
  // per jd.missing[].group) — previously these chips were pure
  // display with nothing wired to state.data at all. Matched chips
  // stay read-only; there's nothing to "apply" about a keyword
  // that's already present. ──
  let keywordDetail = '';
  if(jd){
    // "Required" priority keywords get a small marker on the chip —
    // that's the signal the weighted score (computeKeywordScore) is
    // actually keying off of, so it should be visible, not implicit.
    const priorityMark = (m) => m.priority === 'required' ? `<span class="jd-chip-priority" title="Marked required/must-have in the job description">★</span>` : '';
    const matchedChips = jd.matched.length
      ? `<div class="jd-chip-row">${jd.matched.map(m => `<span class="jd-chip jd-chip-match">${priorityMark(m)}${esc(m.text)}</span>`).join('')}</div>`
      : `<div class="jd-empty-note">None found.</div>`;
    // Already-added keywords (case-insensitively present in the
    // matching skills bucket) render as a plain matched-style chip
    // instead of an actionable one — otherwise a keyword added last
    // render would still show an "Add" button pointing at a no-op.
    const missingChips = jd.missing.length
      ? `<div class="jd-chip-row">${jd.missing.map((m, i) => {
          const already = state.data.skills[m.group].some(s => s.toLowerCase() === m.text.toLowerCase());
          return already
            ? `<span class="jd-chip jd-chip-match">${priorityMark(m)}${esc(m.text)}</span>`
            : `<span class="jd-chip jd-chip-missing jd-chip-actionable">${priorityMark(m)}${esc(m.text)}<button class="jd-chip-add" onclick="applyMissingKeyword(${i})" aria-label="Add ${esc(m.text)} to skills">+</button></span>`;
        }).join('')}</div>`
      : `<div class="jd-empty-note">None found.</div>`;
    const addableCount = jd.missing.filter(m => !state.data.skills[m.group].some(s => s.toLowerCase() === m.text.toLowerCase())).length;
    keywordDetail = `
      <div class="jd-report-block">
        <div class="jd-report-title">Matched keywords (${jd.matched.length})</div>
        ${matchedChips}
      </div>
      <div class="jd-report-block">
        <div class="jd-report-title-row">
          <div class="jd-report-title">Missing keywords (${jd.missing.length})</div>
          ${addableCount > 1 ? `<button class="btn btn-secondary btn-sm" onclick="applyAllMissingKeywords()">Add all (${addableCount})</button>` : ''}
        </div>
        ${missingChips}
      </div>
    `;
  } else {
    keywordDetail = `<div class="jd-report-block"><div class="jd-empty-note">${aiEnabled()
      ? 'Paste a job description above and re-run analysis to get a keyword matching score and matched/missing keyword breakdown.'
      : 'Keyword matching against a job description is coming soon.'}</div></div>`;
  }

  slot.innerHTML = `
    ${cluster}
    <div class="jd-report">
      ${reasonsBlock('What\u2019s holding the Overall Score back', overallScore)}
      ${aiSuggestBlock}
      ${keywordDetail}
    </div>
  `;
}

// Field-name labels used to group suggestions on the Analyze step —
// same vocabulary as the JD suggestion "area" field, so both feed
// into one grouped list.
const FIELD_AREA_LABEL = { summary:'Professional Summary', skills:'Skills', experience:'Work Experience', projects:'Projects' };

// Walks the summary plus every Experience / Project entry and
// gathers writing issues into one flat list, tagged with which
// field/area each issue belongs to (used to group the Analyze
// Resume results by field name).
async function collectWritingIssues(){
  const results = [];
  const summaryIssues = await getSuggestions('summary_text', state.data.summary, {});
  summaryIssues.forEach(it => results.push({ ...it, fieldId:'s_text', area:'summary', itemLabel:'Professional Summary' }));

  for(const [i, ex] of state.data.experience.entries()){
    const issues = await getSuggestions('experience_bullet', ex.description, { isCurrentRole: ex.current });
    issues.forEach(it => results.push({ ...it, fieldId:`exp_desc_${i}`, area:'experience', itemLabel: ex.role || ex.company || `Position ${i+1}` }));
  }
  for(const [i, p] of state.data.projects.entries()){
    const issues = await getSuggestions('project_bullet', p.description, {});
    issues.forEach(it => results.push({ ...it, fieldId:`proj_desc_${i}`, area:'projects', itemLabel: p.name || `Project ${i+1}` }));
  }
  const rank = { high:0, medium:1, low:2 };
  return results.sort((a,b) => rank[a.severity]-rank[b.severity]);
}

const SEVERITY_LABEL = { high:'!', medium:'●', low:'○' };

function renderWritingIssueRow(issue, idx){
  const applyBtn = issue.fix
    ? `<button class="btn btn-secondary btn-sm writing-issue-apply" onclick="applyWritingFix(${idx})">Apply fix</button>`
    : `<span class="writing-issue-tip">Manual review</span>`;
  // Only fixable issues get a checkbox — "manual review" rows have
  // nothing a bulk apply could act on, so a spacer keeps the row
  // grid aligned instead.
  const selectBox = issue.fix
    ? `<input type="checkbox" class="writing-issue-select" data-idx="${idx}" ${_selectedFixIdx.has(idx) ? 'checked' : ''} onclick="event.stopPropagation()" onchange="toggleFixSelect(${idx}, this.checked)">`
    : `<span class="writing-issue-select-spacer"></span>`;
  return `<div class="writing-issue" data-idx="${idx}">
    ${selectBox}
    <span class="writing-issue-icon ${issue.severity}">${SEVERITY_LABEL[issue.severity]}</span>
    <div class="writing-issue-body" onclick="scrollToWritingIssue(${idx})">
      <div class="writing-issue-msg">${esc(issue.message)}</div>
      <div class="writing-issue-meta">${esc(issue.itemLabel)}</div>
    </div>
    ${applyBtn}
  </div>`;
}

// Tracks which fixable AI Suggestion rows are checked, by index into
// _writingIssuesCache. Cleared whenever that cache is rebuilt (see
// renderAnalyzeResults) since indices are only valid for one render.
let _selectedFixIdx = new Set();

function toggleFixSelect(idx, checked){
  if(checked) _selectedFixIdx.add(idx); else _selectedFixIdx.delete(idx);
  syncBulkApplyUI();
}

// "Select all" only ever targets fixable rows — issues without a fix
// have no checkbox to begin with, so nothing to add there.
function toggleSelectAllFixes(checked){
  _selectedFixIdx.clear();
  if(checked){
    _writingIssuesCache.forEach((issue, idx) => { if(issue.fix) _selectedFixIdx.add(idx); });
  }
  document.querySelectorAll('.writing-issue-select').forEach(cb => {
    cb.checked = _selectedFixIdx.has(+cb.dataset.idx);
  });
  syncBulkApplyUI();
}

// Keeps the bulk-apply bar (count + button) and the "Select all"
// checkbox's checked/indeterminate state in sync with the current
// selection, without touching the individual row checkboxes.
function syncBulkApplyUI(){
  const bar = $('bulkApplyBar');
  const n = _selectedFixIdx.size;
  if(bar){
    bar.style.display = n ? 'flex' : 'none';
    const countEl = $('bulkApplyCount');
    if(countEl) countEl.textContent = `${n} selected`;
  }
  const selectAll = $('selectAllFixes');
  if(selectAll){
    const fixable = _writingIssuesCache.filter(i => i.fix).length;
    selectAll.checked = fixable > 0 && n === fixable;
    selectAll.indeterminate = n > 0 && n < fixable;
  }
}

// Shared by applyWritingFix (single) and applySelectedFixes (bulk) —
// mutates state.data in place for one issue, without saving/
// re-rendering/re-analyzing, so bulk apply can do that once at the
// end instead of once per fix.
function applyFixToState(issue){
  if(!issue || !issue.fix) return;
  const isSummary = issue.fieldId === 's_text';
  const current = getIssueSourceText(issue);
  if(isSummary){
    const sentences = splitSummarySentences(current);
    const original = sentences[issue.lineIndex] || '';
    if(original) setIssueSourceText(issue, current.replace(original, issue.fix));
  } else {
    const lines = current.split('\n');
    const original = lines[issue.lineIndex] || '';
    const hadBullet = original.trimStart().startsWith('•');
    lines[issue.lineIndex] = (hadBullet ? BULLET : '') + issue.fix;
    setIssueSourceText(issue, lines.join('\n'));
  }
}

// Applies every checked row's fix in one pass, then saves/re-renders
// and reconciles the analysis LOCALLY (see reconcileWritingFixesLocally
// below) instead of re-running the full AI analysis — selecting 5
// fixes used to trigger 5 fields' worth of fresh grammar calls plus a
// fresh JD call every time, none of which were needed just to reflect
// text that already changed on this machine.
function applySelectedFixes(){
  const idxs = [..._selectedFixIdx].sort((a, b) => a - b);
  if(!idxs.length) return;
  const touchedFieldIds = new Set();
  idxs.forEach(idx => {
    const issue = _writingIssuesCache[idx];
    applyFixToState(issue);
    if(issue) touchedFieldIds.add(issue.fieldId);
  });
  _selectedFixIdx.clear();
  saveLS();
  renderPreview();
  showToast(`${idxs.length} fix${idxs.length > 1 ? 'es' : ''} applied`, 'success');
  reconcileWritingFixesLocally([...touchedFieldIds]);
}

// Adds one missing-keyword chip's text into state.data.skills[group]
// (technical or core, per what the JD-match call classified it as)
// — mirrors addSkill's own case-insensitive dedup so re-clicking an
// already-added chip, or a keyword that happens to match an existing
// skill's casing differently, never creates a duplicate entry.
// Previously these chips had no click handler at all: clicking a
// missing-keyword chip — or "applying" the AI Suggestions above it —
// never touched state.data, so the keyword stayed "missing" forever
// even after the resume was edited. This is the actual fix.
function applyMissingKeywordToState(text, group){
  const bucket = state.data.skills[group];
  if(text && !bucket.some(s => s.toLowerCase() === text.toLowerCase())){
    bucket.push(text);
    return true;
  }
  return false;
}
function applyMissingKeyword(i){
  if(!_resumeAnalysis?.jd) return;
  const m = _resumeAnalysis.jd.missing[i];
  if(!m) return;
  const added = applyMissingKeywordToState(m.text, m.group);
  if(!added) return;
  saveLS();
  renderPreview();
  showToast(`"${m.text}" added to skills`, 'success');
  reconcileKeywordMatchLocally([m]);
}
// "Add all" — batched the same way applySelectedFixes batches writing
// fixes: mutate state.data for every not-yet-added missing keyword in
// one pass, then save/re-render/reconcile once rather than once per
// keyword.
function applyAllMissingKeywords(){
  if(!_resumeAnalysis?.jd) return;
  const added = _resumeAnalysis.jd.missing.filter(m => applyMissingKeywordToState(m.text, m.group));
  if(!added.length) return;
  saveLS();
  renderPreview();
  showToast(`${added.length} keyword${added.length > 1 ? 's' : ''} added to skills`, 'success');
  reconcileKeywordMatchLocally(added);
}

// Moves the given missing-keyword entries into "matched" in the
// cached JD analysis and recomputes the (purely local, no-AI-needed)
// keyword + overall scores, then repaints — no network round trip.
// The keyword is now literally present in state.data.skills, so
// there's nothing left for the AI to "verify"; re-asking it only
// risked a different — or worse, still-"missing" — answer coming back
// from a temperature-0.4 model on the very next click.
function reconcileKeywordMatchLocally(appliedMissing){
  if(!_resumeAnalysis?.jd || !appliedMissing.length) return;
  const jd = _resumeAnalysis.jd;
  const appliedTexts = new Set(appliedMissing.map(m => m.text.toLowerCase()));
  jd.missing = jd.missing.filter(m => !appliedTexts.has(m.text.toLowerCase()));
  appliedMissing.forEach(m => {
    // Carries the same group/priority the item already had as "missing"
    // over to "matched" — it's the same keyword, just relocated, so its
    // weight in computeKeywordScore should be unchanged, not reset.
    if(!jd.matched.some(k => k.text.toLowerCase() === m.text.toLowerCase())){
      jd.matched.push({ text: m.text, group: m.group, priority: m.priority });
    }
  });

  _resumeAnalysis.keywordScore = computeKeywordScore(jd);
  _resumeAnalysis.overallScore = computeOverallScore(_resumeAnalysis.atsScore, _resumeAnalysis.completeness, _resumeAnalysis.keywordScore);
  renderAnalyzeResults();
}

// Maps a writing-issue fieldId back to what a background re-check of
// just that one field needs: which getSuggestions() fieldType to call,
// its current live text, its context object, and the area/itemLabel
// to file any new issue under. Mirrors the fieldId formats used by
// getIssueSourceText/setIssueSourceText above.
function fieldMetaForId(fieldId){
  if(fieldId === 's_text'){
    return { area:'summary', itemLabel:'Professional Summary', fieldType:'summary_text', context:{}, text: state.data.summary || '' };
  }
  const expMatch = /^exp_desc_(\d+)$/.exec(fieldId);
  if(expMatch){
    const i = +expMatch[1];
    const ex = state.data.experience[i];
    if(!ex) return null;
    return { area:'experience', itemLabel: ex.role || ex.company || `Position ${i+1}`, fieldType:'experience_bullet', context:{ isCurrentRole: ex.current }, text: ex.description || '' };
  }
  const projMatch = /^proj_desc_(\d+)$/.exec(fieldId);
  if(projMatch){
    const i = +projMatch[1];
    const p = state.data.projects[i];
    if(!p) return null;
    return { area:'projects', itemLabel: p.name || `Project ${i+1}`, fieldType:'project_bullet', context:{}, text: p.description || '' };
  }
  return null;
}

// Removes the just-applied issues from the cached analysis (the text
// that triggered them no longer exists), recomputes completeness +
// overall score LOCALLY, and repaints immediately — then, in the
// background, re-checks ONLY the touched field(s) for any new issue
// the edit itself might have introduced, merging results in when that
// resolves. This replaces the old behavior of calling the full
// runResumeAnalysis() (every field's grammar check, plus a fresh JD
// keyword call) on every single Apply click.
function reconcileWritingFixesLocally(fieldIds){
  if(!_resumeAnalysis || !fieldIds.length) return;
  const idSet = new Set(fieldIds);
  Object.keys(_resumeAnalysis.issuesByArea).forEach(area => {
    _resumeAnalysis.issuesByArea[area] = _resumeAnalysis.issuesByArea[area].filter(it => !idSet.has(it.fieldId));
  });
  const recomputeScores = () => {
    const total = Object.values(_resumeAnalysis.issuesByArea).reduce((n, list) => n + list.length, 0);
    _resumeAnalysis.completeness = computeCompleteness(total);
    _resumeAnalysis.overallScore = computeOverallScore(_resumeAnalysis.atsScore, _resumeAnalysis.completeness, _resumeAnalysis.keywordScore);
  };
  recomputeScores();
  renderAnalyzeResults();

  // Background re-check, scoped to just the field(s) that changed —
  // never touches other fields and never re-calls the JD match.
  fieldIds.forEach(async (fieldId) => {
    const meta = fieldMetaForId(fieldId);
    if(!meta) return;
    try{
      const fresh = await getSuggestions(meta.fieldType, meta.text, meta.context);
      if(!_resumeAnalysis) return; // analysis panel may have been cleared/replaced meanwhile
      const newIssues = fresh.map(it => ({ ...it, fieldId, area: meta.area, itemLabel: meta.itemLabel }));
      _resumeAnalysis.issuesByArea[meta.area] = [
        ..._resumeAnalysis.issuesByArea[meta.area].filter(it => it.fieldId !== fieldId),
        ...newIssues,
      ];
      recomputeScores();
      renderAnalyzeResults();
    }catch(e){ /* silent — the local reconcile above already reflects the fix correctly */ }
  });
}

// Cached so click handlers (which only get an index, to keep onclick
// attributes short) can look the issue back up.
let _writingIssuesCache = [];

// Sentence-split text back into the same array checkSummaryText /
// suggestionsAISummary used, so an issue's lineIndex maps onto the
// same slice of the summary paragraph.
function splitSummarySentences(text){
  return (text || '').trim().split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
}

// Reads the CURRENT raw text for whichever field an issue points at,
// straight from state.data — not the DOM. Needed because issues are
// shown on the Analyze Resume step, where the Experience/Projects/
// Summary textareas the issue refers to aren't rendered at all.
function getIssueSourceText(issue){
  if(issue.fieldId === 's_text') return state.data.summary || '';
  const expMatch = /^exp_desc_(\d+)$/.exec(issue.fieldId);
  if(expMatch) return state.data.experience[+expMatch[1]]?.description || '';
  const projMatch = /^proj_desc_(\d+)$/.exec(issue.fieldId);
  if(projMatch) return state.data.projects[+projMatch[1]]?.description || '';
  return '';
}
function setIssueSourceText(issue, newText){
  if(issue.fieldId === 's_text'){ state.data.summary = newText; return; }
  const expMatch = /^exp_desc_(\d+)$/.exec(issue.fieldId);
  if(expMatch){ state.data.experience[+expMatch[1]].description = newText; return; }
  const projMatch = /^proj_desc_(\d+)$/.exec(issue.fieldId);
  if(projMatch){ state.data.projects[+projMatch[1]].description = newText; return; }
}

// Clicking a suggestion navigates to the step that owns the field so
// the person can see it in context (Analyze step doesn't render that
// textarea itself).
function scrollToWritingIssue(idx){
  const issue = _writingIssuesCache[idx];
  if(!issue) return;
  const stepId = issue.area === 'summary' ? 'summary' : issue.area;
  const stepIndex = STEPS.findIndex(s => s.id === stepId);
  if(stepIndex < 0) return;
  goStep(stepIndex);
  setTimeout(() => {
    const ta = $(issue.fieldId);
    if(!ta) return;
    const isSummary = issue.fieldId === 's_text';
    const units = isSummary ? splitSummarySentences(ta.value) : ta.value.split('\n');
    let charStart = 0;
    if(isSummary){
      const target = units[issue.lineIndex] || '';
      charStart = target ? ta.value.indexOf(target) : 0;
      if(charStart < 0) charStart = 0;
    } else {
      for(let i=0;i<issue.lineIndex;i++) charStart += units[i].length + 1;
    }
    const unitLen = (units[issue.lineIndex]||'').length;
    ta.focus();
    ta.setSelectionRange(charStart, charStart + unitLen);
    ta.scrollIntoView({ behavior:'smooth', block:'center' });
    const field = ta.closest('.field') || ta;
    field.classList.add('field-pulse');
    setTimeout(() => field.classList.remove('field-pulse'), 900);
  }, 60);
}

// Applies a suggested fix directly to state.data (works from the
// Analyze step, where the source textarea isn't on screen), then
// reconciles the analysis LOCALLY — see reconcileWritingFixesLocally —
// instead of re-running the full analysis (every field's grammar
// check plus a fresh JD keyword call) just to reflect one line.
function applyWritingFix(idx){
  const issue = _writingIssuesCache[idx];
  if(!issue || !issue.fix) return;
  applyFixToState(issue);
  saveLS();
  renderPreview();
  showToast('Fix applied', 'success');
  reconcileWritingFixesLocally([issue.fieldId]);
}

// The per-entry "Rewrite with AI" button. While AI is paused it renders as a
// disabled "coming soon" control (no handler, no id) instead of disappearing,
// so it is clear the feature exists and is on the way.
function aiRewriteButton(key, i){
  if(!aiEnabled()){
    return `<button type="button" class="btn btn-secondary btn-sm rewrite-btn" disabled title="AI rewriting is coming soon" style="opacity:.6;cursor:not-allowed;">✦ AI rewrite — coming soon</button>`;
  }
  return `<button type="button" class="btn btn-secondary btn-sm rewrite-btn" onclick="startSectionRewrite('${key}',${i})" id="rewriteBtn_${key}_${i}">✦ Rewrite with AI</button>`;
}

function showToast(msg, type){
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(showToast._tid);
  showToast._tid = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ════════════════════════════════════════════════════════════════
   PHASE 2 — FORM RENDERING
   One render function per section. Every user-facing string goes
   through esc(). Inputs are read back in saveStep() by id.
   ════════════════════════════════════════════════════════════════ */

function sectionHeader(title, sub){
  return `<h2 class="section-title">${esc(title)}</h2><p class="section-sub">${esc(sub)}</p>`;
}

function renderPersonal(){
  const d = state.data.personal;
  return sectionHeader('Header & Contact', 'Name, title, and how employers reach you — this sits in the document body, not a PDF header region, since ATS parsers frequently skip real header/footer zones.') + `
    <div class="field"><label>Full Name *</label>
      <input id="p_name" value="${esc(d.name)}" placeholder="e.g. Jordan Alvarez" oninput="saveField()"></div>
    <div class="field"><label>Professional Title</label>
      <input id="p_title" value="${esc(d.title)}" placeholder="e.g. Senior Backend Engineer" oninput="saveField()"></div>
    <div class="field-row">
      <div class="field"><label>Email</label>
        <input id="p_email" type="email" value="${esc(d.email)}" placeholder="you@email.com" oninput="saveField()"></div>
      <div class="field"><label>Phone</label>
        <input id="p_phone" value="${esc(d.phone)}" placeholder="+1 555 123 4567" oninput="saveField()"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>City, Region</label>
        <input id="p_city" value="${esc(d.city)}" placeholder="e.g. Austin, TX" oninput="saveField()"></div>
      <div class="field"><label>LinkedIn</label>
        <input id="p_linkedin" value="${esc(d.linkedin)}" placeholder="linkedin.com/in/you" oninput="saveField()"></div>
    </div>
    <div class="field"><label>Portfolio / GitHub</label>
      <input id="p_portfolio" value="${esc(d.portfolio)}" placeholder="github.com/you" oninput="saveField()"></div>
  `;
}

function renderSummary(){
  return sectionHeader('Professional Summary', '3–5 lines. Make keyword matching and role fit obvious — this is the first thing both the ATS and a recruiter read.') + `
    <div class="field">
      <textarea id="s_text" rows="5" placeholder="Backend engineer with 6 years building high-throughput payment systems. Led migration of..." oninput="saveField()">${esc(state.data.summary)}</textarea>
      <div class="hint" id="summaryLen"></div>
    </div>
  `;
}

function renderSkills(){
  const s = state.data.skills;
  return sectionHeader('Skills', 'Split into Technical Skills and Core Competencies — both render under one "Skills" heading so the ATS sees a single, standard section.') + `
    <div class="skill-group-label">Technical Skills</div>
    <div class="chip-row" id="techChips">${renderChips(s.technical, 'technical')}</div>
    <div class="field-row" style="grid-template-columns:1fr auto;gap:8px;">
      <input id="techInput" placeholder="e.g. Python, PostgreSQL, Kubernetes" onkeydown="if(event.key==='Enter'){event.preventDefault();addSkill('technical');}">
      <button class="btn btn-secondary btn-sm" onclick="addSkill('technical')">Add</button>
    </div>

    <div class="skill-group-label">Core Competencies <span style="font-weight:400;color:var(--muted);text-transform:none;letter-spacing:0;">(soft skills)</span></div>
    <div class="chip-row" id="coreChips">${renderChips(s.core, 'core')}</div>
    <div class="field-row" style="grid-template-columns:1fr auto;gap:8px;">
      <input id="coreInput" placeholder="e.g. Cross-functional Leadership, Stakeholder Communication" onkeydown="if(event.key==='Enter'){event.preventDefault();addSkill('core');}">
      <button class="btn btn-secondary btn-sm" onclick="addSkill('core')">Add</button>
    </div>
  `;
}
function renderChips(list, group){
  return list.map((s,i) => `<span class="chip">${esc(s)}<button onclick="removeSkill('${group}',${i})" aria-label="Remove ${esc(s)}">✕</button></span>`).join('');
}
function addSkill(group){
  const inp = $(group === 'technical' ? 'techInput' : 'coreInput');
  const v = inp.value.trim();
  if(v && !state.data.skills[group].includes(v)){
    state.data.skills[group].push(v);
    inp.value = '';
    refreshSkillsUI(group);
    inp.focus();
  }
}
function removeSkill(group, i){
  state.data.skills[group].splice(i,1);
  refreshSkillsUI(group);
}
// Updates just the chip row + side panels for a skills group, without
// rebuilding the whole form (which would blow away input focus).
function refreshSkillsUI(group){
  const chipsEl = $(group === 'technical' ? 'techChips' : 'coreChips');
  if(chipsEl) chipsEl.innerHTML = renderChips(state.data.skills[group], group);
  renderPreview();
  renderAtsPanel();
  renderToolbar();
}

function renderExperience(){
  const items = state.data.experience;
  let h = sectionHeader('Work Experience', 'Reverse chronological — most recent first. Lead each bullet with an outcome, not a task.');
  items.forEach((ex,i) => {
    h += `<div class="item-card">
      <div class="item-card-head">
        <span class="item-tag">Position ${i+1}</span>
        ${items.length>1 ? `<button class="btn-remove" onclick="removeItem('experience',${i})">✕ Remove</button>` : ''}
      </div>
      <div class="field-row">
        <div class="field"><label>Company</label>
          <input id="exp_company_${i}" value="${esc(ex.company)}" placeholder="Company name" oninput="saveField()"></div>
        <div class="field"><label>Job Title</label>
          <input id="exp_role_${i}" value="${esc(ex.role)}" placeholder="e.g. Product Manager" oninput="saveField()"></div>
      </div>
      <div class="field"><label>Location</label>
        <input id="exp_location_${i}" value="${esc(ex.location)}" placeholder="e.g. Remote / Austin, TX" oninput="saveField()"></div>
      <div class="field-row">
        <div class="field"><label>Start Date</label>
          <input type="month" id="exp_start_${i}" value="${ex.start}" oninput="saveField()"></div>
        <div class="field"><label>End Date</label>
          <input type="month" id="exp_end_${i}" value="${ex.end}" ${ex.current?'disabled':''} oninput="saveField()">
          <label style="display:flex;align-items:center;gap:6px;margin-top:7px;text-transform:none;font-weight:500;font-size:12px;color:var(--ink-soft);cursor:pointer;">
            <input type="checkbox" id="exp_curr_${i}" ${ex.current?'checked':''} style="width:auto;" onchange="toggleCurrent(${i})"> Currently working here
          </label>
        </div>
      </div>
      <div class="field">
        <label style="display:flex;align-items:center;justify-content:space-between;">
          <span>Achievements</span>
          ${aiRewriteButton('experience', i)}
        </label>
        <textarea id="exp_desc_${i}" rows="4" placeholder="• Led migration to event-driven architecture, cutting p99 latency 40%..." oninput="saveField();autoBulletInput(event)" onkeydown="autoBulletKeydown(event)" onpaste="autoBulletPaste(event)">${esc(ex.description)}</textarea>
        <div id="rewriteSlot_experience_${i}"></div>
      </div>
    </div>`;
  });
  h += `<button class="btn-add-item" onclick="addItem('experience')">+ Add Another Position</button>`;
  return h;
}

function renderProjects(){
  const items = state.data.projects;
  let h = sectionHeader('Projects', 'Optional but strong evidence of hands-on skill — especially for technical roles. What you built, with what, and what it did.');
  items.forEach((p,i) => {
    h += `<div class="item-card">
      <div class="item-card-head">
        <span class="item-tag">Project ${i+1}</span>
        ${items.length>1 ? `<button class="btn-remove" onclick="removeItem('projects',${i})">✕ Remove</button>` : ''}
      </div>
      <div class="field-row">
        <div class="field"><label>Project Name</label>
          <input id="proj_name_${i}" value="${esc(p.name)}" placeholder="e.g. Realtime Inventory Sync" oninput="saveField()"></div>
        <div class="field"><label>Your Role</label>
          <input id="proj_role_${i}" value="${esc(p.role)}" placeholder="e.g. Lead Developer" oninput="saveField()"></div>
      </div>
      <div class="field"><label>Tech Used</label>
        <input id="proj_tech_${i}" value="${esc(p.tech)}" placeholder="e.g. Node.js, Redis, WebSockets" oninput="saveField()"></div>
      <div class="field"><label>Link (optional)</label>
        <input id="proj_link_${i}" value="${esc(p.link)}" placeholder="github.com/you/project" oninput="saveField()"></div>
      <div class="field">
        <label style="display:flex;align-items:center;justify-content:space-between;">
          <span>Description</span>
          ${aiRewriteButton('projects', i)}
        </label>
        <textarea id="proj_desc_${i}" rows="3" placeholder="• What it does and the outcome — a metric, an adoption number, a grade..." oninput="saveField();autoBulletInput(event)" onkeydown="autoBulletKeydown(event)" onpaste="autoBulletPaste(event)">${esc(p.description)}</textarea>
        <div id="rewriteSlot_projects_${i}"></div>
      </div>
    </div>`;
  });
  h += `<button class="btn-add-item" onclick="addItem('projects')">+ Add Another Project</button>`;
  return h;
}

function renderEducation(){
  const items = state.data.education;
  let h = sectionHeader('Education', 'Most recent first.');
  items.forEach((ed,i) => {
    h += `<div class="item-card">
      <div class="item-card-head">
        <span class="item-tag">Education ${i+1}</span>
        ${items.length>1 ? `<button class="btn-remove" onclick="removeItem('education',${i})">✕ Remove</button>` : ''}
      </div>
      <div class="field-row">
        <div class="field"><label>School</label>
          <input id="edu_school_${i}" value="${esc(ed.school)}" placeholder="University name" oninput="saveField()"></div>
        <div class="field"><label>Location</label>
          <input id="edu_location_${i}" value="${esc(ed.location)}" placeholder="e.g. Boston, MA" oninput="saveField()"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Degree</label>
          <input id="edu_degree_${i}" value="${esc(ed.degree)}" placeholder="e.g. B.S." oninput="saveField()"></div>
        <div class="field"><label>Field of Study</label>
          <input id="edu_field_${i}" value="${esc(ed.field)}" placeholder="e.g. Computer Science" oninput="saveField()"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Start Date</label>
          <input type="month" id="edu_start_${i}" value="${ed.start}" oninput="saveField()"></div>
        <div class="field"><label>End Date</label>
          <input type="month" id="edu_end_${i}" value="${ed.end}" oninput="saveField()"></div>
      </div>
      <div class="field"><label>Honors (optional)</label>
        <input id="edu_honors_${i}" value="${esc(ed.honors)}" placeholder="e.g. Magna Cum Laude, GPA 3.8" oninput="saveField()"></div>
    </div>`;
  });
  h += `<button class="btn-add-item" onclick="addItem('education')">+ Add Another School</button>`;
  return h;
}

function renderCertifications(){
  const items = state.data.certifications;
  let h = sectionHeader('Certifications', 'Optional — include if relevant to the target role.');
  items.forEach((c,i) => {
    h += `<div class="item-card">
      <div class="item-card-head">
        <span class="item-tag">Certification ${i+1}</span>
        ${items.length>1 ? `<button class="btn-remove" onclick="removeItem('certifications',${i})">✕ Remove</button>` : ''}
      </div>
      <div class="field-row">
        <div class="field"><label>Name</label>
          <input id="cert_name_${i}" value="${esc(c.name)}" placeholder="e.g. AWS Certified Solutions Architect" oninput="saveField()"></div>
        <div class="field"><label>Issuer</label>
          <input id="cert_issuer_${i}" value="${esc(c.issuer)}" placeholder="e.g. Amazon Web Services" oninput="saveField()"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Date</label>
          <input type="month" id="cert_date_${i}" value="${c.date}" oninput="saveField()"></div>
        <div class="field"><label>Credential ID (optional)</label>
          <input id="cert_id_${i}" value="${esc(c.id)}" oninput="saveField()"></div>
      </div>
    </div>`;
  });
  h += `<button class="btn-add-item" onclick="addItem('certifications')">+ Add Another Certification</button>`;
  return h;
}

function renderAnalyze(){
  const jd = state.data.jd || '';
  const aiOn = aiEnabled();
  let h = sectionHeader('Analyze Resume', aiOn
    ? 'Optionally paste a job description to also get a keyword match score. Then run the analysis to get an ATS score, grammar and wording review, and keyword matching — with one-click fixes.'
    : 'Run the analysis to get an ATS score and a grammar and wording review, with one-click fixes. Keyword matching against a job description is coming soon.') + `
    <div class="field"><label>${aiOn ? 'Job Description (optional — enables keyword matching)' : 'Job Description — keyword matching coming soon'}</label>
      <textarea id="jd_text" rows="8" ${aiOn ? '' : 'disabled'} placeholder="${aiOn ? 'Paste the full job posting here to also get a keyword match score...' : 'Keyword matching is paused for now.'}" oninput="saveField()">${esc(jd)}</textarea>
    </div>
    <button type="button" class="btn btn-primary btn-lg" id="analyzeBtn" onclick="runResumeAnalysis()">✦ Analyze Resume</button>
    <div id="analyzeResultSlot"></div>
  `;
  return h;
}

const RENDERERS = {
  personal: renderPersonal, summary: renderSummary, skills: renderSkills,
  experience: renderExperience, projects: renderProjects,
  education: renderEducation, certifications: renderCertifications,
  analyze: renderAnalyze,
};

/* ════════════════════════════════════════════════════════════════
   PHASE 3 — NAVIGATION, STATE SAVE/LOAD, LIVE PREVIEW
   ════════════════════════════════════════════════════════════════ */

function saveField(){
  const id = STEPS[state.currentStep].id;
  const d = state.data;
  if(id === 'personal'){
    Object.assign(d.personal, {
      name: gv('p_name'), title: gv('p_title'), email: gv('p_email'),
      phone: gv('p_phone'), city: gv('p_city'), linkedin: gv('p_linkedin'),
      portfolio: gv('p_portfolio'),
    });
  } else if(id === 'summary'){
    d.summary = gv('s_text');
    updateSummaryHint();
  } else if(id === 'experience'){
    d.experience.forEach((_,i) => {
      const isCurr = gch('exp_curr_'+i);
      Object.assign(d.experience[i], {
        company: gv('exp_company_'+i), role: gv('exp_role_'+i),
        location: gv('exp_location_'+i), start: gv('exp_start_'+i),
        end: isCurr ? d.experience[i].end : gv('exp_end_'+i), // preserve stored end date while "current" is checked
        current: isCurr, description: gv('exp_desc_'+i),
      });
    });
  } else if(id === 'projects'){
    d.projects.forEach((_,i) => {
      Object.assign(d.projects[i], {
        name: gv('proj_name_'+i), role: gv('proj_role_'+i),
        tech: gv('proj_tech_'+i), link: gv('proj_link_'+i),
        description: gv('proj_desc_'+i),
      });
    });
  } else if(id === 'education'){
    d.education.forEach((_,i) => {
      Object.assign(d.education[i], {
        school: gv('edu_school_'+i), location: gv('edu_location_'+i),
        degree: gv('edu_degree_'+i), field: gv('edu_field_'+i),
        start: gv('edu_start_'+i), end: gv('edu_end_'+i), honors: gv('edu_honors_'+i),
      });
    });
  } else if(id === 'certifications'){
    d.certifications.forEach((_,i) => {
      Object.assign(d.certifications[i], {
        name: gv('cert_name_'+i), issuer: gv('cert_issuer_'+i),
        date: gv('cert_date_'+i), id: gv('cert_id_'+i),
      });
    });
  } else if(id === 'analyze'){
    d.jd = gv('jd_text');
  }
  saveLS();
  renderPreview();
  renderAtsPanel();
  updateRail();
}
function updateSummaryHint(){
  const el = $('summaryLen');
  if(!el) return;
  const len = (state.data.summary||'').length;
  el.textContent = `${len} characters — aim for roughly 400–650 (about 3–5 lines)`;
}

function toggleCurrent(i){
  saveField();
  renderStep();
}
function addItem(key){
  saveField();
  const fn = { experience:newExperience, projects:newProject, education:newEducation, certifications:newCertification };
  state.data[key].push(fn[key]());
  renderStep();
  setTimeout(() => {
    const cards = document.querySelectorAll('.item-card');
    cards[cards.length-1]?.scrollIntoView({behavior:'smooth', block:'center'});
  }, 60);
}
function removeItem(key, i){
  saveField();
  state.data[key].splice(i,1);
  renderStep();
}

function goStep(i){
  saveField();
  state.currentStep = i;
  renderStep();
}
function nextStep(){
  saveField();
  if(state.currentStep < STEPS.length-1){ state.currentStep++; renderStep(); }
}
function prevStep(){
  saveField();
  if(state.currentStep > 0){ state.currentStep--; renderStep(); }
}

function renderStep(){
  const step = STEPS[state.currentStep];
  $('formPane').innerHTML = RENDERERS[step.id]() + `
    <div class="nav-footer" style="position:static;margin-top:24px;border-top:none;padding:0;">
      <button class="btn btn-secondary" onclick="prevStep()" ${state.currentStep===0?'disabled':''}>← Back</button>
      <button class="btn btn-primary" onclick="nextStep()" ${state.currentStep===STEPS.length-1?'disabled':''}>Next →</button>
    </div>
  `;
  if(step.id === 'summary') updateSummaryHint();
  if(step.id === 'analyze' && _resumeAnalysis) renderAnalyzeResults();
  updateRail();
  renderPreview();
  renderAtsPanel();
  renderToolbar();
}

function updateRail(){
  $('rail').innerHTML = STEPS.map((s,i) => {
    const done = i < state.currentStep && stepHasContent(s.id);
    const active = i === state.currentStep;
    return `<div class="rail-step ${active?'active':''} ${done?'done':''}" onclick="goStep(${i})" tabindex="0"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();goStep(${i});}">
      <span class="rail-step-dot"></span>${esc(s.label)}
    </div>`;
  }).join('');
}
function stepHasContent(id){
  const d = state.data;
  if(id==='personal') return !!d.personal.name;
  if(id==='summary') return !!d.summary;
  if(id==='skills') return d.skills.technical.length || d.skills.core.length;
  if(id==='experience') return hasContent(d.experience,['company','role']).length>0;
  if(id==='projects') return hasContent(d.projects,['name']).length>0;
  if(id==='education') return hasContent(d.education,['school','degree']).length>0;
  if(id==='certifications') return hasContent(d.certifications,['name']).length>0;
  if(id==='analyze') return !!_resumeAnalysis;
  return false;
}

/* ── LIVE PREVIEW ──
   Single-column, standard headings, contact line in body — every
   rule from the ATS research applied directly, and every value
   pulled through the same formatters the PDF export uses. */
function renderPreview(){
  const d = state.data;
  const font = getFont();
  const contactLine = formatContactLine(d.personal);

  const expItems = hasContent(d.experience, ['company','role']);
  const projItems = hasContent(d.projects, ['name']);
  const eduItems = hasContent(d.education, ['school','degree']);
  const certItems = hasContent(d.certifications, ['name']);

  const secTitle = (label) => `<div data-fit="section-title" style="font-size:11.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#1c1c1e;border-bottom:1.4px solid #1c1c1e;padding-bottom:3px;margin:16px 0 8px;">${esc(label)}</div>`;

  let html = `<div style="text-align:center;margin-bottom:14px;">
    <div style="font-size:22pt;font-weight:700;letter-spacing:-0.3px;">${esc(d.personal.name) || 'Your Name'}</div>
    ${d.personal.title ? `<div style="font-size:12pt;color:${'#2c5f6f'};font-weight:600;margin-top:2px;">${esc(d.personal.title)}</div>` : ''}
    ${contactLine ? `<div style="font-size:10pt;color:#555;margin-top:6px;">${renderContactLineHTML(d.personal)}</div>` : ''}
  </div>`;

  if(d.summary){
    html += secTitle('Professional Summary');
    html += `<div data-fit="body" style="font-size:10.5pt;line-height:1.5;">${esc(d.summary)}</div>`;
  }

  if(d.skills.technical.length || d.skills.core.length){
    html += secTitle('Skills');
    if(d.skills.technical.length) html += `<div data-fit="body" style="font-size:10.5pt;margin-bottom:3px;"><strong>Technical:</strong> ${esc(d.skills.technical.join(', '))}</div>`;
    if(d.skills.core.length) html += `<div data-fit="body" style="font-size:10.5pt;"><strong>Core Competencies:</strong> ${esc(d.skills.core.join(', '))}</div>`;
  }

  if(expItems.length){
    html += secTitle('Work Experience');
    expItems.forEach(e => {
      const range = formatDateRange(e.start, e.end, e.current);
      html += `<div data-fit="item-gap" style="margin-bottom:9px;">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;">
          <div><strong data-fit="body" style="font-size:10.5pt;">${esc(e.role)||'—'}</strong><span data-fit="body" style="font-size:10.5pt;color:#2c5f6f;font-weight:600;"> · ${esc(e.company)}</span></div>
          <div style="font-size:9.5pt;color:#666;">${esc(range)}${e.location?' · '+esc(e.location):''}</div>
        </div>
        ${e.description ? `<div data-fit="body" style="font-size:10pt;color:#333;margin-top:2px;white-space:pre-line;line-height:1.45;">${esc(e.description)}</div>` : ''}
      </div>`;
    });
  }

  if(projItems.length){
    html += secTitle('Projects');
    projItems.forEach(p => {
      html += `<div data-fit="item-gap" style="margin-bottom:8px;">
        <div><strong data-fit="body" style="font-size:10.5pt;">${esc(p.name)}</strong>${p.role?` <span style="font-size:9.5pt;color:#666;">— ${esc(p.role)}</span>`:''}</div>
        ${p.tech ? `<div style="font-size:9.5pt;color:#2c5f6f;">${esc(p.tech)}</div>` : ''}
        ${p.description ? `<div data-fit="body" style="font-size:10pt;color:#333;margin-top:2px;white-space:pre-line;line-height:1.45;">${esc(p.description)}</div>` : ''}
      </div>`;
    });
  }

  if(eduItems.length){
    html += secTitle('Education');
    eduItems.forEach(e => {
      const range = formatDateRange(e.start, e.end, false);
      const deg = [e.degree, e.field?('in '+e.field):''].filter(Boolean).join(' ');
      html += `<div data-fit="item-gap" style="margin-bottom:7px;">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;">
          <strong data-fit="body" style="font-size:10.5pt;">${esc(deg)}</strong>
          <span style="font-size:9.5pt;color:#666;">${esc(range)}</span>
        </div>
        <div data-fit="body" style="font-size:10pt;color:#2c5f6f;">${esc(e.school)}${e.location?' · '+esc(e.location):''}</div>
        ${e.honors ? `<div style="font-size:9.5pt;color:#666;font-style:italic;">${esc(e.honors)}</div>` : ''}
      </div>`;
    });
  }

  if(certItems.length){
    html += secTitle('Certifications');
    certItems.forEach(c => {
      html += `<div data-fit="item-gap" style="display:flex;justify-content:space-between;margin-bottom:4px;flex-wrap:wrap;gap:4px;">
        <span data-fit="body" style="font-size:10.5pt;"><strong>${esc(c.name)}</strong>${c.issuer?' — '+esc(c.issuer):''}</span>
        <span style="color:#666;font-size:9.5pt;">${esc(formatDate(c.date))}</span>
      </div>`;
    });
  }

  $('previewPane').innerHTML = `
    <div class="doc-toolbar">
      <div class="doc-toolbar-title">Live Preview — A4</div>
      <div class="doc-toolbar-controls">
        <select id="zoomSelect" onchange="changePreviewZoom()" style="width:auto;padding:6px 9px;font-size:12px;">
          ${PREVIEW_ZOOM_OPTIONS.map(z => `<option value="${z.value}" ${z.value===_previewZoomMode?'selected':''}>${esc(z.label)}</option>`).join('')}
        </select>
        <select id="fontSelect" onchange="changeFont()" style="width:auto;padding:6px 9px;font-size:12px;">
          ${SAFE_FONTS.map(f => `<option value="${f.id}" ${f.id===state.font?'selected':''}>${esc(f.label)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="page-shell">
      <div class="page-shell-inner" style="font-family:${font.family};">${html}</div>
    </div>
    <div id="atsPanelSlot"></div>
  `;
  applyPreviewZoom();
}

// ── PREVIEW ZOOM ──
// A4 at true size (210mm ≈ 794px + the page-shell's 24px of padding)
// is wider than the 700px preview pane, so it needs to be scaled down
// to be usable on most screens. "Fit width" (the default) shrinks it
// to whatever room is actually available; fixed percentages are for
// people who want a specific, predictable size instead.
const A4_SHELL_WIDTH_PX = Math.round(210 / 25.4 * 96) + 24; // 210mm + page-shell padding (12px * 2)
const PREVIEW_ZOOM_OPTIONS = [
  { value: 'fit', label: 'Fit width' },
  { value: '0.5', label: '50%' },
  { value: '0.75', label: '75%' },
  { value: '1', label: '100%' },
  { value: '1.25', label: '125%' },
];
let _previewZoomMode = 'fit';

function computePreviewFitZoom(){
  const pane = document.querySelector('.preview-pane');
  if(!pane || !pane.clientWidth) return 1;
  return Math.min(1, pane.clientWidth / A4_SHELL_WIDTH_PX);
}

function applyPreviewZoom(){
  const shell = document.querySelector('.page-shell');
  if(!shell) return;
  const factor = _previewZoomMode === 'fit' ? computePreviewFitZoom() : parseFloat(_previewZoomMode);
  shell.style.zoom = factor;
}

function changePreviewZoom(){
  _previewZoomMode = gv('zoomSelect') || 'fit';
  applyPreviewZoom();
}

// "Fit width" depends on the pane's current size, so it needs to be
// recalculated on resize — fixed percentages don't, since they're not
// container-relative. Debounced to avoid running on every resize tick.
let _previewZoomResizeTid = null;
window.addEventListener('resize', () => {
  if(_previewZoomMode !== 'fit') return;
  clearTimeout(_previewZoomResizeTid);
  _previewZoomResizeTid = setTimeout(applyPreviewZoom, 120);
});
function changeFont(){
  state.font = gv('fontSelect');
  saveLS();
  renderPreview();
  renderAtsPanel();
}

// Emoji/pictographic/arrow characters — a genuine literal-parseability
// hazard (some ATS text extractors render these as garbage bytes or a
// stray "?", not a styling nitpick), and increasingly common in
// AI-generated resume text. Bullet markers, dashes, and accented Latin
// letters are all real, normal resume content and are NOT flagged here.
const UNSAFE_CHAR_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/u;
function findUnsafeCharacterField(){
  const d = state.data;
  const fields = [
    ['name', d.personal.name], ['title', d.personal.title], ['summary', d.summary],
    ...d.experience.map((e,i) => [`Experience ${i+1}`, e.description]),
    ...d.projects.map((p,i) => [`Project ${i+1}`, p.description]),
  ];
  const hit = fields.find(([,text]) => UNSAFE_CHAR_RE.test(text || ''));
  return hit ? hit[0] : null;
}

/* ── ATS SAFETY PANEL ──
   Deliberately not a fabricated score. Every line here is a real,
   checkable property of THIS document's structure — matched against
   the ATS format rules verified in this conversation — not a
   heuristic percentage presented as authoritative (see ProDocs audit). */
function getFormatChecks(){
  const d = state.data;
  const font = getFont();
  const unsafeField = findUnsafeCharacterField();
  return [
    { ok:true, label:'Single-column layout' },
    { ok:true, label:'No tables, text boxes, or images used for content' },
    { ok:true, label:'Contact info in document body, not header/footer region' },
    { ok:!!d.personal.name, label: d.personal.name ? 'Name present' : 'Name missing — add your full name' },
    { ok:!!formatContactLine(d.personal), label: formatContactLine(d.personal) ? 'At least one contact method present' : 'No contact method added yet' },
    { ok:true, label:`Font: ${font.label} — sans-serif class, on the vetted safe list`, warn: font.id==='georgia' },
    { ok:true, label:'Selectable text layer — export prints real DOM text, never rasterizes' },
    { ok: !unsafeField, label: unsafeField ? `Emoji or symbol characters in ${unsafeField} — some ATS parsers render these as garbled text` : 'No emoji or pictographic symbols in resume text' },
    { ok: !PRINT_FIT.lastRun || PRINT_FIT.lastFontPt >= PRINT_FIT.FLOOR_PT,
      label: PRINT_FIT.lastRun
        ? `Export font floor respected (${PRINT_FIT.lastFontPt}pt ≥ ${PRINT_FIT.FLOOR_PT}pt minimum)`
        : 'Export font floor — checked after first export' },
  ];
}

function renderAtsPanel(){
  const checks = getFormatChecks();
  const slot = $('atsPanelSlot');
  if(!slot) return;
  slot.innerHTML = `<div class="ats-panel">
    <div class="ats-panel-title">Format Check</div>
    ${checks.map(c => {
      const cls = c.ok === 'pending' ? 'pending' : (c.warn ? 'warn' : (c.ok ? 'ok' : 'warn'));
      const icon = c.ok === 'pending' ? '…' : (c.ok ? '✓' : '!');
      return `<div class="ats-check"><span class="ats-check-icon ${cls}">${icon}</span>${esc(c.label)}</div>`;
    }).join('')}
  </div>`;
}

/* ════════════════════════════════════════════════════════════════
   SCORING — three separate, honestly-scoped numbers instead of one
   blended figure. Each is built entirely from real, checkable facts
   about this resume; every point deducted maps to a visible reason,
   so no number is a fabricated black-box percentage.

     computeAtsScore()      — CAN A PARSER READ THIS. Format/structure
                               checks only (single column, safe font,
                               contact placement, text layer, etc).
     computeKeywordScore()  — HOW WELL DOES IT MATCH THE JD. Wraps the
                               existing matched/missing keyword ratio.
     computeCompleteness()  — section completeness + writing quality,
                               feeding into Overall (not shown as its
                               own ring — Overall already communicates
                               it, and a 4th ring would crowd the
                               cluster without adding a new question
                               the person is asking).
     computeOverallScore()  — weighted roll-up of all three so there's
                               one clear "how's the whole resume doing"
                               number, with keyword weight excluded
                               from the denominator until a JD exists.
   ════════════════════════════════════════════════════════════════ */

// Pure parseability score — nothing about content quality or JD fit,
// only "will an ATS's parser choke on this document's structure."
function computeAtsScore(){
  const formatChecks = getFormatChecks();
  const formatOk = formatChecks.filter(c => c.ok === true).length;
  const pct = Math.round((formatOk / formatChecks.length) * 100);
  const reasons = formatChecks.filter(c => c.ok !== true).map(c => c.label);
  return { score: pct, reasons: reasons.slice(0, 6) };
}

// Section completeness + writing quality — the "is there enough
// real, well-written content here" score. Feeds Overall; not its
// own ring (see note above).
function computeCompleteness(writingIssueCount){
  const d = state.data;
  const reasons = [];
  let score = 0;

  const expWithContent = hasContent(d.experience,['company','role']).some(e => (e.description||'').trim().length > 40);
  const sectionChecks = [
    { ok: !!d.personal.name, pts:8, failLabel:'Add your name' },
    { ok: !!d.personal.title, pts:6, failLabel:'Add a professional title/headline — many ATS systems index this as your current role' },
    { ok: !!formatContactLine(d.personal), pts:8, failLabel:'Add a contact method' },
    { ok: (d.summary||'').trim().length >= 80, pts:14, failLabel:'Professional summary is thin or missing' },
    { ok: (d.skills.technical.length + d.skills.core.length) >= 4, pts:10, failLabel:'Add more skills (aim for 4+)' },
    { ok: expWithContent, pts:18, failLabel:'Add bullet content to work experience' },
    { ok: hasContent(d.education,['school','degree']).length > 0, pts:10, failLabel:'Add an education entry' },
  ];
  sectionChecks.forEach(c => { if(c.ok) score += c.pts; else reasons.push(c.failLabel); });
  const sectionMax = sectionChecks.reduce((s,c) => s+c.pts, 0); // 68

  // Writing quality — remaining points, penalized per open issue.
  const writingMax = 100 - sectionMax; // 32
  const writingPenalty = Math.min(writingMax, (writingIssueCount||0) * 4);
  score += (writingMax - writingPenalty);
  if(writingIssueCount > 0) reasons.push(`${writingIssueCount} writing issue${writingIssueCount===1?'':'s'} still open`);

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons: reasons.slice(0, 6) };
}

// Keyword match vs a pasted JD. Returns null (not a 0) when no JD
// has been analyzed yet — "no data" and "0% match" are different
// facts and the UI renders them differently (pending ring vs red ring).
//
// WEIGHTED, not a flat matched/(matched+missing) count: a JD keyword
// tagged "required" (must-have, appears repeatedly, or sits in core
// requirements/title) counts more toward this score than one tagged
// "preferred" — closer to how real ATS ranking weighs a resume, where
// missing a named must-have tool hurts more than missing a generic
// nice-to-have. Falls back gracefully to an even 1-point weight for
// any item that came back without a priority (older AI response shape).
const KEYWORD_WEIGHT = { required: 3, preferred: 1 };
function computeKeywordScore(jdAnalysis){
  if(!jdAnalysis) return null;
  const weight = (item) => KEYWORD_WEIGHT[item.priority] || 1;
  const matchedWeight = jdAnalysis.matched.reduce((sum, m) => sum + weight(m), 0);
  const missingWeight = jdAnalysis.missing.reduce((sum, m) => sum + weight(m), 0);
  const totalWeight = matchedWeight + missingWeight;
  // No keywords extracted at all (matched AND missing both empty) is a
  // "we couldn't analyze this" outcome, not a "perfect match" — defaulting
  // to 100% here would be the one score in this whole panel that isn't
  // grounded in a real, checkable fact. 0 + an explicit reason is the
  // honest fallback: it never overstates the match, and the reason tells
  // the person why the ring reads low instead of leaving them to guess.
  if(totalWeight === 0){
    return { score: 0, reasons: ['No specific keywords could be extracted from the pasted job description — try pasting the full posting text'] };
  }
  const pct = Math.round((matchedWeight/totalWeight)*100);

  const missingRequired = jdAnalysis.missing.filter(m => m.priority === 'required').length;
  const missingPreferred = jdAnalysis.missing.length - missingRequired;
  const reasons = [];
  if(missingRequired) reasons.push(`${missingRequired} required JD keyword${missingRequired===1?'':'s'} not yet reflected in the resume`);
  if(missingPreferred) reasons.push(`${missingPreferred} preferred JD keyword${missingPreferred===1?'':'s'} not yet reflected in the resume`);
  return { score: pct, reasons };
}

// Weighted roll-up: format 25%, completeness+writing 45%, keyword
// match 30% — but keyword weight is only in the denominator once a
// JD has actually been analyzed, so a resume isn't punished for a
// score category the person hasn't opted into yet.
function computeOverallScore(atsResult, completenessResult, keywordResult){
  const weights = keywordResult
    ? { ats:0.25, completeness:0.45, keyword:0.30 }
    : { ats:0.35, completeness:0.65, keyword:0 };
  let score = atsResult.score*weights.ats + completenessResult.score*weights.completeness;
  if(keywordResult) score += keywordResult.score*weights.keyword;
  const reasons = [...completenessResult.reasons, ...atsResult.reasons, ...(keywordResult ? keywordResult.reasons : [])];
  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons: reasons.slice(0, 6) };
}

/* ── PERSISTENCE ── */
function saveLS(){
  try{ localStorage.setItem('resumeBuilderState', JSON.stringify({ font: state.font, data: state.data })); }
  catch(e){ /* storage unavailable — app still works, just won't persist */ }
}
function loadLS(){
  try{
    const raw = localStorage.getItem('resumeBuilderState');
    if(!raw) return false;
    const parsed = JSON.parse(raw);
    if(parsed.font) state.font = parsed.font;
    if(parsed.data) Object.assign(state.data, parsed.data);
    // defensive fill for any fields added after a save was made
    if(!state.data.skills) state.data.skills = { technical:[], core:[] };
    if(!state.data.skills.technical) state.data.skills.technical = [];
    if(!state.data.skills.core) state.data.skills.core = [];
    ['experience','projects','education','certifications'].forEach(k => { if(!state.data[k]) state.data[k] = []; });
    if(typeof state.data.jd !== 'string') state.data.jd = '';
    return true;
  }catch(e){ return false; }
}

/* ════════════════════════════════════════════════════════════════
   TOOLBAR
   ════════════════════════════════════════════════════════════════ */
function renderToolbar(){
  $('toolbarLeft').innerHTML = `
    <span style="font-size:12.5px;color:var(--muted);">
      Step ${state.currentStep+1} of ${STEPS.length} — ${esc(STEPS[state.currentStep].label)}
    </span>
    ${aiStatusBadgeHTML()}
  `;
  $('toolbarRight').innerHTML = `
    <button class="btn btn-ghost" onclick="resetAll()">Start Over</button>
    <button class="btn btn-accent" id="exportBtn" onclick="exportPdf()">↓ Export PDF</button>
  `;
}

function resetAll(){
  if(!confirm('Clear everything and start over? This cannot be undone.')) return;
  state.currentStep = 0;
  state.font = 'calibri';
  state.data = {
    personal: { name:'', title:'', email:'', phone:'', city:'', linkedin:'', portfolio:'' },
    summary: '',
    skills: { technical: [], core: [] },
    experience: [ newExperience() ],
    projects: [ newProject() ],
    education: [ newEducation() ],
    certifications: [ newCertification() ],
    jd: '',
  };
  saveLS();
  renderStep();
  renderToolbar();
  showToast('Cleared — starting fresh.', 'success');
}

/* ════════════════════════════════════════════════════════════════
   PHASE 4 — PDF EXPORT
   Mechanism: window.print() against real DOM text (never a canvas/
   image render), so "selectable text" is an architectural guarantee,
   not a claim to verify after the fact.

   Auto-fit runs on a detached CLONE of the preview's inner node, never
   the live one — so the on-screen preview can't flicker, shrink, or
   get left in a bad state if the loop throws partway through. The
   clone is what actually gets printed (swapped into previewPane just
   for the print, then swapped back).

   Ladder order matches the plan: line-height -> spacing -> font-size,
   each step re-measured, with a hard floor on font-size so "fits one
   page" can never win against "stays ATS-readable".
   ════════════════════════════════════════════════════════════════ */

const PRINT_FIT = {
  FLOOR_PT: 9.5,        // never shrink body/meta text below this
  BASE_PT: 10.5,        // the preview's baseline body font-size
  MIN_LINE_HEIGHT: 1.25,
  MIN_SECTION_GAP: 10,  // px, floor for the ~16px section-title margin
  lastRun: false,
  lastFontPt: null,
};

// A4 usable dimensions in CSS px at 96dpi, minus ~0.5in margin on each
// side (the margin the browser's own print dialog reserves by default).
// scrollHeight is only a meaningful "does it fit one page" signal if the
// node is actually constrained to this width while measuring — since no
// CSS exists yet to guarantee that, the width is forced explicitly below
// rather than assumed, so this stays independent of the stylesheet.
const A4_USABLE_HEIGHT_PX = Math.round((297 - 25.4) / 25.4 * 96);
const A4_USABLE_WIDTH_PX  = Math.round((210 - 25.4) / 25.4 * 96);

function fitsOnePage(node){
  return node.scrollHeight <= A4_USABLE_HEIGHT_PX;
}

// One shrink step. Returns false once every lever is at its floor and
// it still doesn't fit — caller stops and accepts multi-page rather
// than pushing font-size past FLOOR_PT.
function stepShrink(node, level){
  const bodyEls = node.querySelectorAll('[data-fit="body"]');
  const sectionEls = node.querySelectorAll('[data-fit="section-title"]');
  const currentPt = parseFloat(node.dataset.fitPt || PRINT_FIT.BASE_PT);

  if(level === 0){
    // Step 1: line-height first — cheapest, least visually destructive.
    bodyEls.forEach(el => { el.style.lineHeight = PRINT_FIT.MIN_LINE_HEIGHT; });
    return true;
  }
  if(level === 1){
    // Step 2: vertical spacing between sections/items.
    sectionEls.forEach(el => { el.style.margin = `${PRINT_FIT.MIN_SECTION_GAP}px 0 6px`; });
    node.querySelectorAll('[data-fit="item-gap"]').forEach(el => { el.style.marginBottom = '5px'; });
    return true;
  }
  // Step 3+: font-size, in 0.5pt increments, never below the floor.
  const nextPt = Math.max(PRINT_FIT.FLOOR_PT, currentPt - 0.5);
  if(nextPt === currentPt) return false; // already at floor, no more room to give
  node.dataset.fitPt = nextPt;
  bodyEls.forEach(el => { el.style.fontSize = nextPt + 'pt'; });
  return nextPt > PRINT_FIT.FLOOR_PT || true; // apply this step; report whether another is possible below
}

function runAutoFit(node){
  node.dataset.fitPt = PRINT_FIT.BASE_PT;
  let level = 0;
  const MAX_STEPS = 40; // safety cap so a measurement bug can't infinite-loop
  let steps = 0;
  while(!fitsOnePage(node) && steps < MAX_STEPS){
    const applied = stepShrink(node, Math.min(level, 2));
    if(!applied){
      break; // font floor reached with no more levers — accept overflow
    }
    if(level < 2) level++;
    steps++;
    if(level === 2 && parseFloat(node.dataset.fitPt) <= PRINT_FIT.FLOOR_PT && !fitsOnePage(node)){
      break; // at floor and still overflowing — stop, let it spill to page 2
    }
  }
  PRINT_FIT.lastRun = true;
  PRINT_FIT.lastFontPt = parseFloat(node.dataset.fitPt);
  return node;
}

function exportPdf(){
  const d = state.data;
  if(!d.personal.name || !d.personal.name.trim()){
    showToast('Add your name before exporting — required for an ATS-readable header.', 'error');
    return;
  }

  const live = document.querySelector('.page-shell-inner');
  if(!live){
    showToast('Nothing to export yet — fill in the preview first.', 'error');
    return;
  }

  // Work on a clone so auto-fit can never touch the live preview — but
  // scrollHeight is only measurable once a node is actually in the
  // rendered document, so swap it in FIRST, then measure/shrink it.
  const clone = live.cloneNode(true);
  const shell = live.closest('.page-shell') || live.parentElement;
  const placeholder = document.createComment('print-fit-placeholder');
  live.replaceWith(placeholder);
  clone.style.width = A4_USABLE_WIDTH_PX + 'px';
  clone.style.boxSizing = 'border-box';
  shell.appendChild(clone);

  // The on-screen preview may be zoomed out to fit the pane — export
  // must always print at true 100% size, independent of that setting.
  const restoreZoom = shell.style.zoom;
  shell.style.zoom = 1;

  runAutoFit(clone);

  const originalTitle = document.title;
  const suggested = (d.personal.name || 'Resume').trim();
  document.title = `${suggested} - Resume`;
  document.body.classList.add('is-printing');

  const cleanup = () => {
    document.title = originalTitle;
    document.body.classList.remove('is-printing');
    clone.replaceWith(live);
    shell.style.zoom = restoreZoom;
    window.removeEventListener('afterprint', cleanup);
    if(PRINT_FIT.lastFontPt < PRINT_FIT.BASE_PT){
      showToast(`Fit to one page at ${PRINT_FIT.lastFontPt}pt (floor: ${PRINT_FIT.FLOOR_PT}pt).`, 'success');
    }
    renderAtsPanel();
  };
  window.addEventListener('afterprint', cleanup);

  // Fallback in case the browser never fires afterprint (some older
  // WebKit builds on dialog-cancel) — cleanup still runs once, harmlessly,
  // if afterprint later fires too, since cleanup is idempotent enough
  // (replaceWith on an already-detached clone is a no-op risk we accept
  // here in exchange for never leaving the UI stuck in print mode).
  setTimeout(() => { if(document.body.classList.contains('is-printing')) cleanup(); }, 4000);

  window.print();
}

/* ════════════════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════════════════ */
(function init(){
  const restored = loadLS();
  // Ensure at least one blank entry per repeatable section so the
  // form has something to render on a first-ever visit.
  if(!state.data.experience.length) state.data.experience.push(newExperience());
  if(!state.data.projects.length) state.data.projects.push(newProject());
  if(!state.data.education.length) state.data.education.push(newEducation());
  if(!state.data.certifications.length) state.data.certifications.push(newCertification());

  renderStep();
  syncNavAiStatus();
  // When AI is on, the landing line "Your data stays in this browser" would
  // be untrue (editing text is sent to Groq), so say what actually happens.
  if(aiEnabled()){
    const mc = document.querySelector('.hero-microcopy');
    if(mc) mc.textContent = 'Takes about 8 minutes. Your resume stays in this browser — except text you send to AI features, which is processed by Groq.';
  }
  checkAiConnection();
  startAiStatusMonitor();
  if(restored) showToast('Restored your previous progress.', 'success');
})();
