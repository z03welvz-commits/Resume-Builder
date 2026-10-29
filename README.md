# Resume-Builder

A browser-based resume builder (no build step — open `index.html`). AI features
(grammar/wording review, section rewrites, job-description matching, paste-in
resume import) call the Groq API directly from the browser and fall back to a
local rule-based checker when AI is unavailable.

## Enabling AI

The app needs a [Groq API key](https://console.groq.com/keys). It is never
stored in the app files, because this repository is public. Use either:

1. **`config.local.js`** — copy `config.local.example.js` to `config.local.js`
   and set `groqApiKey`. The file is gitignored.
2. **The badge** — click **AI: not set up** in the app and paste the key. It is
   saved in that browser only.

## The AI status badge

The badge reflects what is actually happening, not a fixed label:

| Badge | Meaning |
| --- | --- |
| AI: not set up | No key found |
| AI: checking… | Probing Groq |
| AI: connected | Key valid **and** a usable model was found (hover for the model and last-check time) |
| AI: rate-limited | Groq returned 429; recovers automatically |
| AI: unavailable | Key rejected, offline, timeout, or no usable model |

It re-checks every minute while the tab is visible, when the browser goes
online/offline, when the tab regains focus, and when clicked. Models are
discovered from Groq's `/models` list at runtime (see `AI_MODEL_CANDIDATES` in
`app_1_.js`), so a retired model no longer breaks the app silently; set
`groqModel` in `config.local.js` to force a specific one.
