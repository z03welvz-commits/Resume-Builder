/* Copy this file to config.local.js (same folder). config.local.js is
   gitignored, so a key placed here never gets committed.

   AI features are PAUSED by default ("coming soon"). To turn them back on,
   set aiEnabled: true and add your key below (or click the badge in the app
   to paste the key instead — it is then saved in that browser only). */
window.RESUME_BUILDER_CONFIG = {
  aiEnabled: false,        // true = re-enable AI features
  groqApiKey: '',          // from https://console.groq.com/keys
  // groqModel: 'openai/gpt-oss-120b', // optional: force a specific model;
                                       // by default the app picks the best
                                       // one your account can use.
};
