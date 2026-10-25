// Run before the body paints: never show the legacy orb during GPU startup.
// Unsupported browsers and pages without JavaScript retain their normal fallback.
if (navigator.gpu && !matchMedia("(forced-colors: active)").matches) {
  document.documentElement.classList.add("liquid-orbs-loading");
  const timeout = setTimeout(finish, 8000);
  function finish() {
    clearTimeout(timeout);
    document.documentElement.classList.remove("liquid-orbs-loading");
  }
  window.finishOrbStartup = finish;
}
