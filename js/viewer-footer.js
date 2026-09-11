/* Stale-viewer footer: site build SHA + status_updated_at + stale guidance. */
(function () {
  "use strict";

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fill(root) {
    if (!window.N5Status) return;
    var S = window.N5Status;
    var dataRoot = root.getAttribute("data-data-root") || S.resolveDataRoot();

    Promise.all([S.loadBuildInfo(dataRoot), S.loadCampaignStatus(dataRoot)])
      .then(function (pair) {
        var build = pair[0] || {};
        var status = pair[1] || {};
        var commit = build.git_commit || "unknown";
        var built = build.built_at ? S.formatIso(build.built_at) : "—";
        var repo = build.repo || "";
        var updated = S.statusUpdatedAt(status);
        var age = updated ? S.formatAge(updated) : "";
        var thresh = S.formatDuration(S.staleAfterS(status));
        var stale = S.isStale(status);
        var sample =
          status._source_file === "campaign-status.sample.json" ||
          status.source === "sample";

        var buildEl = root.querySelector("[data-role='build']");
        if (buildEl) {
          buildEl.innerHTML =
            "Site build · <code>" +
            esc(commit) +
            "</code>" +
            (repo ? " · " + esc(repo) : "") +
            " · " +
            esc(built);
        }

        var feedGit = S.gitCommit(status);
        var stEl = root.querySelector("[data-role='status']");
        if (stEl) {
          stEl.innerHTML =
            "Status updated · " +
            esc(updated ? S.formatIso(updated) : "not loaded") +
            (age ? " <span class=\"viewer-age\">(" + esc(age) + ")</span>" : "") +
            (feedGit ? " · feed <code>" + esc(feedGit) + "</code>" : "") +
            (sample ? " · <span class=\"viewer-sample\">sample fixture</span>" : "");
        }

        var slEl = root.querySelector("[data-role='stale']");
        if (slEl) {
          slEl.textContent =
            "Viewer may be stale if status older than " + thresh + ".";
        }

        root.classList.toggle("is-stale", stale);
        root.hidden = false;
      })
      .catch(function () {
        root.hidden = false;
      });
  }

  function init() {
    document.querySelectorAll(".viewer-stale").forEach(function (el) {
      el._n5Refresh = function () {
        fill(el);
      };
      fill(el);
    });
    // Soft poll so footer age/SHA tracks without a full page reload.
    setInterval(function () {
      if (document.hidden) return;
      document.querySelectorAll(".viewer-stale").forEach(function (el) {
        if (typeof el._n5Refresh === "function") el._n5Refresh();
      });
    }, 20000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
