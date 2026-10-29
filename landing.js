'use strict';

/* ════════════════════════════════════════════════════════════════
   LANDING <-> BUILDER TRANSITION
   Deliberately thin: this file only ever shows/hides two top-level
   containers and defers to app_1_.js for everything about the
   resume-building logic itself. It does not touch `state`, does not
   duplicate any render function, and does not run until the person
   has actually clicked Build Resume — app_1_.js's own init() IIFE
   still fires immediately on page load either way, so localStorage
   restore happens whether or not the person ever leaves the landing
   page (harmless: renderStep() just paints into a hidden #formPane).
   ════════════════════════════════════════════════════════════════ */

function enterBuilder(){
  document.body.classList.add('builder-active');
  const root = document.getElementById('builderRoot');
  root.hidden = false;
  // Re-run the parts of the app that need the (now-visible) DOM to
  // have real dimensions — renderToolbar/updateRail/renderPreview
  // all read from elements that were display:none a moment ago.
  if (typeof renderToolbar === 'function') renderToolbar();
  if (typeof renderStep === 'function') renderStep();
  window.scrollTo(0, 0);
  document.getElementById('formPane')?.querySelector('input, textarea')?.focus();
}

function exitBuilder(){
  document.body.classList.remove('builder-active');
  document.getElementById('builderRoot').hidden = true;
  window.scrollTo(0, 0);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('heroBuildBtn')?.addEventListener('click', enterBuilder);
  document.getElementById('navBuildBtn')?.addEventListener('click', enterBuilder);
  document.getElementById('railBackBtn')?.addEventListener('click', exitBuilder);
});
