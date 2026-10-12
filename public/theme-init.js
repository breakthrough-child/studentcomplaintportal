// Applies the saved colour theme before the first paint (loaded synchronously in <head>), so pages never
// flash the wrong theme. "system" (the default) follows the operating system and keeps following it.
(function () {
  var root = document.documentElement;
  function stored() {
    try { return localStorage.getItem("theme"); } catch { return null; }
  }
  function apply() {
    var choice = stored();
    var dark = choice === "dark" || (choice !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
    root.dataset.theme = choice === "light" || choice === "dark" ? choice : "system";
  }
  apply();
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
  } catch { /* very old browsers: keep the initial theme */ }
})();
