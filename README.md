# Resume-Builder

A browser-based resume builder (no build step — open `index.html`). Everything
works locally in the browser, including a rule-based grammar/wording checker,
an ATS score and a local resume importer.

## Templates

Pick a template above the live preview.

| Template | For | Notes |
| --- | --- | --- |
| **Classic** | Online applications (ATS) | The original single-column layout and ATS-safe fonts. Default. |
| **Sidebar** | Physical applications | Coloured left panel (contact, skills, education) + main column. |
| **Executive** | Physical applications | Centred serif header, hairline rules. |
| **Banner** | Physical applications | Coloured header block, accent section bars, skill chips. |
| **Timeline** | Physical applications | Dates on the left with a rail and dots. |

The four print templates are made for paper: they use colour, columns and a
wider choice of typefaces, so they are **not ATS-optimised**. The ATS score and
Format Check say so when one is selected. Each has a six-colour accent picker
and starts with a recommended font; the font dropdown lists the ATS-safe fonts
plus eight print fonts (Inter, Poppins, Montserrat, Lato, Source Sans 3, Lora,
Merriweather, Playfair Display). Print fonts load from Google Fonts the first
time a print template is shown; offline, a similar system font is used.

Export with **Export PDF**: text stays selectable, colours print without ticking
"Background graphics", and the page auto-fits to one A4 sheet (never below
9.5pt). The template, accent and font are remembered per browser.

Everything for this lives in `extensions/print-templates.js` and
`extensions/print-templates.css`; remove their two tags from `index.html` to
return to Classic only.

## AI features — paused ("coming soon")

AI features (AI grammar review, section rewrites, job-description keyword
matching, AI resume import) are **paused by default**. While paused:

- no request ever leaves the browser, and no API key is needed;
- the badge reads **AI: coming soon**;
- AI-only controls are disabled and labelled (AI rewrite, keyword matching);
- the built-in local checker and local importer are used instead.

All the AI code is kept in place. To turn it back on, copy
`config.local.example.js` to `config.local.js` (gitignored), set
`aiEnabled: true` and add your [Groq API key](https://console.groq.com/keys).
You can also set the key by clicking the badge once AI is enabled; it is saved
in that browser only. The key is never stored in the app files, because this
repository is public.

When AI is enabled the app sends the text you are editing to Groq for
processing, and the landing page says so.

### The AI status badge (when enabled)

| Badge | Meaning |
| --- | --- |
| AI: coming soon | AI features are paused (default) |
| AI: not set up | Enabled, but no key found |
| AI: checking… | Probing Groq |
| AI: connected | Key valid **and** a usable model was found (hover for the model and last-check time) |
| AI: rate-limited | Groq returned 429; recovers automatically |
| AI: unavailable | Key rejected, offline, timeout, or no usable model |

It re-checks every minute while the tab is visible, when the browser goes
online/offline, when the tab regains focus, and when clicked. Models are
discovered from Groq's `/models` list at runtime (see `AI_MODEL_CANDIDATES` in
`app_1_.js`), so a retired model no longer breaks the app silently; set
`groqModel` in `config.local.js` to force a specific one.
