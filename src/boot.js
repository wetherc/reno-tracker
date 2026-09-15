// Runs before first paint as a plain script. Re-applies the saved theme
// so a dark-theme reload does not flash light. The key matches
// src/storage/prefs.js.
(function () {
  try {
    var theme = localStorage.getItem('reno-tracker:theme');
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch {
    // Storage can be blocked. The page then follows the OS theme.
  }
})();
