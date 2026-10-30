# Resume-Builder

A free, private resume builder that runs entirely in your browser. No account,
no server, no build step: open `index.html` and start typing.

- **Five templates** — an ATS-friendly *Classic* for online applications, and four
  colour *print* templates for physical applications.
- **Real PDF export** — selectable text, A4, auto-fits to one page.
- **Built-in checks** — ATS format check and a local grammar/wording checker.
- **Import & export** — paste an existing resume as text, or back up and move a
  resume as a JSON file.
- **Your data stays on your device** — see [Privacy & security](#privacy--security).

## Quick start

1. Open `index.html` in a current browser (Chrome or Edge recommended).
2. Fill in the sections on the left; the A4 preview updates as you type.
3. Pick a template above the preview, then click **Export PDF**.

It also works hosted as plain static files (for example GitHub Pages). There is
nothing to install or compile.

## Templates

| Template | Best for | What it looks like |
| --- | --- | --- |
| **Classic** (default) | Online applications — ATS-parsed | Single column, black on white, ATS-safe fonts |
| **Sidebar** | Printed / handed-in | Coloured left panel (contact, skills, education), main column right |
| **Executive** | Printed / handed-in | Centred serif header, fine rules, restrained |
| **Banner** | Printed / handed-in | Coloured header block, accent section bars, skill chips |
| **Timeline** | Printed / handed-in | Dates on the left, a rail with milestones |

The four print templates use colour, columns and decorative fonts, so they are
**not ATS-optimised**. The ATS score and Format Check say so when one is selected.
Use Classic whenever a company will run your resume through an online system.

Print templates have a six-colour accent picker and start with a recommended
font. The font menu lists the ATS-safe fonts plus eight print fonts (Inter,
Poppins, Montserrat, Lato, Source Sans 3, Lora, Merriweather, Playfair Display).
Your template, accent and font are remembered in this browser.

## Exporting

**Export PDF** opens the browser's print dialog:

- choose **Save as PDF** (or your printer), paper size **A4**, margins **Default**;
- background colours print automatically — you don't need to tick
  "Background graphics";
- text stays selectable (the PDF is made from real text, not an image);
- the page auto-fits to one A4 sheet, never shrinking text below 9.5pt; longer
  content simply continues onto a second page.

**Export JSON / Import JSON** saves and restores a resume — content, font,
template and accent — for backup or to move it to another browser or device.
Files over 2 MB are rejected, and imported data is validated before use.

**Paste AI Resume** takes resume text from any source and splits it into the
form fields. While AI is paused this runs entirely on your device with a
rule-based parser, so always check dates and section splits before importing.

## AI features — paused ("coming soon")

AI features (AI grammar review, section rewrites, job-description keyword
matching, AI-assisted import) are **paused by default**. While paused:

- no request ever leaves your browser and no API key is needed;
- the badge reads **AI: coming soon**;
- AI-only controls are disabled and labelled;
- the built-in local checker and local importer are used instead.

All the AI code is kept in place. To turn it back on, copy
`config.local.example.js` to `config.local.js` (gitignored), set
`aiEnabled: true` and add a [Groq API key](https://console.groq.com/keys). You
can also click the badge once AI is enabled and paste the key; it is then saved
in that browser only.

When AI is enabled, the text you are editing is sent to Groq for processing, and
the landing page says so. The model is discovered from Groq's `/models` list at
run time (see `AI_MODEL_CANDIDATES` in `app_1_.js`), so a retired model does not
silently break the app; set `groqModel` in `config.local.js` to force one.

### The AI status badge (when enabled)

| Badge | Meaning |
| --- | --- |
| AI: coming soon | AI features are paused (default) |
| AI: not set up | Enabled, but no key found |
| AI: checking… | Probing Groq |
| AI: connected | Key valid **and** a usable model found (hover for the model and last-check time) |
| AI: rate-limited | Groq returned 429; recovers automatically |
| AI: unavailable | Key rejected, offline, timeout, or no usable model |

It re-checks every minute while the tab is visible, when the browser goes
online or offline, when the tab regains focus, and when clicked.

## Privacy & security

**Where your data lives.** Everything you type is kept in this browser's
`localStorage` (key `resumeBuilderState`) so it survives a refresh. There is no
server and no analytics. It is stored unencrypted, so on a shared computer click
**Start Over** when you finish.

**What leaves your device.**

| Request | When | Why |
| --- | --- | --- |
| Google Fonts | Page load; print fonts the first time a print template is shown | Typefaces. Google sees your IP address. Offline, similar system fonts are used. |
| `api.groq.com` | Only if you enable AI | AI features. Your resume text is sent in the request. |

Nothing else is contacted. The app sets `no-referrer`.

**Protections in the code.**

- **Output escaping.** Every user-supplied value (including AI responses and
  imported files) is HTML-escaped before it is rendered, and contact links only
  use `mailto:`, `tel:` or `https:`. This was tested by pushing hostile markup
  through every form step, template, import path and AI response.
- **Input validation.** Saved state and imported JSON are passed through
  `sanitizeResumeData()`, a whitelist that fixes types and drops unknown keys, so
  damaged data cannot break the app or persist a broken state.
- **Content-Security-Policy.** `index.html` restricts the page to its own files,
  Google Fonts and `api.groq.com`. Images, frames, forms and requests to any
  other host are blocked, so injected markup could not send resume data
  elsewhere.
- **API key handling.** The key is never stored in the app files: use
  `config.local.js` (gitignored) or the in-browser prompt. The repository was
  checked for committed secrets.

**Known limitations.**

- The CSP still allows `'unsafe-inline'` scripts because the UI uses inline
  `onclick` handlers. Escaping is what prevents injection today; moving the
  handlers to `addEventListener` would let the policy drop it.
- Anyone with access to your browser's developer tools can read a saved API key.
  Use a key you can revoke, and don't host a copy of the app with your key in it.
- Google Fonts is a third-party request. Self-hosting the fonts would remove it.

## Project structure

```
index.html                 landing page + builder shell, CSP, script/style tags
tokens.css                 design tokens (colours, spacing, type)
landing.css, landing.js    landing page
builder.css                builder UI, live preview page, print rules
app_1_.js                  state, forms, preview, ATS checks, local checker, PDF export, AI layer
config.local.example.js    copy to config.local.js to enable AI (gitignored)
extensions/
  ats-extras.js/.css       extra ATS-safe fonts, Hybrid layout, landing examples
  print-templates.js/.css  Sidebar / Executive / Banner / Timeline, accents, print fonts
  ai-import.js             "Paste AI Resume" (AI parse, with a local fallback)
  data-portability.js      Export / Import JSON
  sample-resumes.js        sample content
```

Extensions are loaded after `app_1_.js` and extend it by wrapping its functions;
removing an extension's `<script>`/`<link>` tags from `index.html` returns the app
to its previous behaviour. Add a template by adding an entry and a `build…`
function in `print-templates.js`.

## Limitations

- A4 only (no US Letter option yet).
- The print templates are for paper, not ATS parsing.
- No automated test suite is included in the repo.
