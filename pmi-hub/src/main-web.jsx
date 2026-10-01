// Entry point for the GitHub Pages build: Microsoft 365 sign-in and data in
// Firebase. The configuration is injected at build time from firebase.config.json.
import { render } from 'preact';
import { App } from './app.jsx';
import { S, init, emit } from './store.js';
import { createFirebaseBackend } from './backend/firebase.js';

/* global __PMI_CONFIG__ */
const cfg = __PMI_CONFIG__;
const configured = cfg && cfg.firebase && cfg.firebase.apiKey && !/^REPLACE/.test(cfg.firebase.apiKey);
const domains = ((cfg && cfg.allowedEmailDomains) || []).map((d) => d.toLowerCase());
const allowed = (email) => !domains.length || domains.some((d) => String(email || '').toLowerCase().endsWith('@' + d));

if (!configured) {
  S.status = 'setup';
  render(<App />, document.getElementById('app'));
} else {
  const fb = createFirebaseBackend(cfg);
  S.authApi = fb.auth;
  S.status = 'checking';
  render(<App />, document.getElementById('app'));
  fb.auth.redirectResult().catch((e) => {
    S.authError = e && e.code;
    emit();
  });
  let started = false;
  fb.auth.onChange(async (u) => {
    if (!u) {
      // Signed out after having been in: start over cleanly.
      if (started) return location.reload();
      S.status = 'signin';
      emit();
      return;
    }
    if (started) return;
    if (!allowed(u.email)) {
      // The database rules enforce this too; this only gives a clear message.
      S.status = 'denied';
      emit();
      return;
    }
    started = true;
    await fb.auth.recordUser(u);
    init(fb);
  });
  if (cfg.emulator) window.__pmiTest = { signIn: fb.auth.testSignIn };
}
