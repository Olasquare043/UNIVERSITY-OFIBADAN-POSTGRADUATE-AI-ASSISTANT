// Runs before the app loads so the page never flashes the wrong theme.
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem("ui-pg-theme");
  } catch (e) {}
  if (theme !== "dark" && theme !== "light") {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
})();
