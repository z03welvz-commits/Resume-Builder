# Resume-Builder

A browser-based resume builder (no build step — open `index.html`). Everything
works locally in the browser, including a rule-based grammar/wording checker,
an ATS score and a local resume importer.

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
