/* N5 MAX — light/dark theme toggle. Persists to localStorage key n5-theme. */
(function () {
  var KEY = "n5-theme";

  function preferred() {
    try {
      var stored = localStorage.getItem(KEY);
      if (stored === "light" || stored === "dark") return stored;
    } catch (_) {}
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelectorAll("[data-theme-toggle]").forEach(function (root) {
      root.querySelectorAll("button[data-theme-value]").forEach(function (btn) {
        var on = btn.getAttribute("data-theme-value") === theme;
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    });
  }

  function set(theme) {
    if (theme !== "light" && theme !== "dark") return;
    try { localStorage.setItem(KEY, theme); } catch (_) {}
    apply(theme);
  }

  // Apply ASAP (script may be in <head> without defer)
  apply(preferred());

  function wire() {
    document.querySelectorAll("[data-theme-toggle]").forEach(function (root) {
      if (root.getAttribute("data-theme-wired") === "1") return;
      root.setAttribute("data-theme-wired", "1");
      root.addEventListener("click", function (e) {
        var btn = e.target.closest("button[data-theme-value]");
        if (!btn || !root.contains(btn)) return;
        set(btn.getAttribute("data-theme-value"));
      });
    });
    apply(preferred());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }

  // Expose for optional callers
  window.N5Theme = { get: preferred, set: set };
})();
