/* Campaign matrix — status + timestamps only. No sealed numbers. */
(function () {
  "use strict";

  var S = window.N5Status;
  var root = document.getElementById("matrix-root");
  var metaEl = document.getElementById("matrix-meta");
  var openKey = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function labelOf(cell) {
    if (cell.layout) return cell.layout;
    if (cell.model) return cell.model;
    if (Array.isArray(cell.layouts) && cell.layouts.length) {
      return cell.layouts.join(" / ");
    }
    return "cell";
  }

  function cellTitle(cell) {
    var bits = [];
    if (cell.n != null) bits.push("#" + cell.n);
    bits.push(labelOf(cell));
    if (cell.mode && cell.mode !== "full") bits.push(cell.mode);
    if (cell.primarycache) bits.push("pc=" + cell.primarycache);
    return bits.join(" · ");
  }

  function canExpand(cell) {
    var st = S.statusClass(cell.status);
    return st === "running" || st === "passed" || S.caseList(cell).length > 0;
  }

  function renderLegend() {
    var items = [
      ["pending", "pending"],
      ["running", "running"],
      ["passed", "passed"],
      ["failed", "failed"],
      ["blocked", "blocked / skipped"],
    ];
    return (
      '<ul class="status-legend" aria-label="Status color legend">' +
      items
        .map(function (it) {
          return (
            '<li><span class="swatch st-' +
            it[0] +
            '" aria-hidden="true"></span>' +
            esc(it[1]) +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  var caseIndexPromise = null;
  function loadCaseIndex() {
    if (caseIndexPromise) return caseIndexPromise;
    caseIndexPromise = fetch("../data/test-cases-index.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) return { cases: {} };
        return res.json();
      })
      .catch(function () {
        return { cases: {} };
      });
    return caseIndexPromise;
  }

  function lookupCaseDoc(index, id) {
    if (!index) return null;
    var cases = index.cases || index;
    if (cases && typeof cases === "object" && cases[id]) return cases[id];
    if (Array.isArray(cases)) {
      for (var i = 0; i < cases.length; i++) {
        var c = cases[i];
        if (c && (c.id === id || c.tcid === id)) return c;
      }
    }
    return null;
  }

  function fieldText(doc, keys) {
    if (!doc) return "";
    for (var i = 0; i < keys.length; i++) {
      var v = doc[keys[i]];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (Array.isArray(v) && v.length) return v.join("\n");
    }
    return "";
  }

  function caseMark(st) {
    if (st === "passed") return { mark: "✓", label: "passed" };
    if (st === "failed") return { mark: "✗", label: "failed" };
    if (st === "running") return { mark: "●", label: "running" };
    if (st === "blocked" || st === "skipped") return { mark: "–", label: st };
    return { mark: "·", label: "pending" };
  }

  function caseWhen(st, started, finished) {
    if (st === "pending") return "—";
    if (!started) {
      if (st === "running") return "in progress";
      return "—";
    }
    // Clock-only on case rows — full date stays on the cell header.
    var local = (S.formatLocalTime || S.formatLocal)(started);
    if (finished) {
      var dur = S.formatDuration(started, finished);
      return dur ? local + " (" + dur + ")" : local;
    }
    if (st === "running") return local + " (…)";
    return local;
  }

  function renderCases(cell) {
    var cases = S.caseList(cell);
    if (!cases.length) {
      return '<p class="case-empty">No case-level timestamps in this feed yet.</p>';
    }
    return (
      '<ul class="case-list">' +
      cases
        .map(function (c) {
          var st = S.statusClass(c.status);
          var started = S.caseStarted(c);
          var finished = S.caseFinished(c);
          var id = S.caseId(c);
          var mk = caseMark(st);
          var when = caseWhen(st, started, finished);
          return (
            '<li class="case-row st-' +
            st +
            '">' +
            '<button type="button" class="case-open" data-case-id="' +
            esc(id) +
            '" title="' +
            esc(id + " · " + mk.label) +
            '">' +
            '<span class="case-mark" aria-label="' +
            esc(mk.label) +
            '">' +
            esc(mk.mark) +
            "</span>" +
            '<span class="case-id" title="' +
            esc(id) +
            '">' +
            esc(id) +
            "</span>" +
            '<span class="case-when">' +
            esc(when) +
            "</span>" +
            "</button>" +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function renderCell(stage, cell) {
    var key = S.cellKey(stage, cell);
    var st = S.statusClass(cell.status);
    var expandable = canExpand(cell);
    var open = openKey === key;
    var times = [];
    if (cell.started_at) times.push("started " + S.formatLocal(cell.started_at));
    if (cell.finished_at) {
      var cellDur = cell.started_at
        ? S.formatDuration(cell.started_at, cell.finished_at)
        : "";
      times.push(
        "finished " +
          S.formatLocal(cell.finished_at) +
          (cellDur ? " (" + cellDur + ")" : "")
      );
    }
    var body = "";
    if (open) {
      body =
        '<div class="cell-detail">' +
        (times.length
          ? '<p class="cell-times">' + esc(times.join(" · ")) + "</p>"
          : "") +
        renderCases(cell) +
        "</div>";
    }
    return (
      '<article class="matrix-cell st-' +
      st +
      (open ? " is-open" : "") +
      (expandable ? " is-expandable" : "") +
      '" data-key="' +
      esc(key) +
      '">' +
      '<button type="button" class="cell-head" ' +
      (expandable ? "" : "disabled ") +
      'aria-expanded="' +
      (open ? "true" : "false") +
      '">' +
      '<span class="cell-n">#' +
      esc(cell.n != null ? cell.n : "–") +
      "</span>" +
      '<span class="cell-name">' +
      esc(labelOf(cell)) +
      "</span>" +
      '<span class="cell-meta">' +
      esc(
        [cell.suite, cell.mode && cell.mode !== "full" ? cell.mode : "", cell.primarycache]
          .filter(Boolean)
          .join(" · ")
      ) +
      "</span>" +
      '<span class="cell-status">' +
      esc(st) +
      "</span>" +
      "</button>" +
      body +
      "</article>"
    );
  }

  function renderStage(stage) {
    var cells = Array.isArray(stage.cells) ? stage.cells : [];
    return (
      '<section class="matrix-stage" id="stage-' +
      esc(stage.id) +
      '">' +
      '<header class="stage-head">' +
      '<p class="section-label">Stage ' +
      esc(stage.id) +
      "</p>" +
      "<h2>" +
      esc(stage.name || "Stage " + stage.id) +
      "</h2>" +
      "</header>" +
      '<div class="cell-grid">' +
      cells.map(function (c) { return renderCell(stage, c); }).join("") +
      "</div>" +
      "</section>"
    );
  }

  function renderHeader(status) {
    var updated = S.statusUpdatedAt(status);
    var harness = S.harnessCommit(status);
    var git = S.gitCommit(status);
    var sample =
      status._source_file === "campaign-status.sample.json" ||
      status.source === "sample";
    var stale = S.isStale(status);
    var bits = [];
    bits.push(
      '<span>Updated <code>' +
        esc(updated ? S.formatIso(updated) : "—") +
        "</code>" +
        (updated ? " <em>(" + esc(S.formatAge(updated)) + ")</em>" : "") +
        "</span>"
    );
    if (harness) bits.push("<span>Harness <code>" + esc(harness) + "</code></span>");
    if (git) bits.push("<span>Git <code>" + esc(git) + "</code></span>");
    bits.push(
      "<span>Feed <code>" +
        esc(status._source_file || "campaign-status") +
        "</code>" +
        (sample ? " · sample" : "") +
        "</span>"
    );
    if (stale) bits.push('<span class="meta-stale">status older than stale window</span>');
    if (metaEl) {
      metaEl.innerHTML = bits.join("");
    }
  }

  function pickDefaultOpen(status) {
    var norm = S.normalizeStatus(status);
    var running = null;
    var passed = null;
    (norm.stages || []).forEach(function (st) {
      (st.cells || []).forEach(function (c) {
        var key = S.cellKey(st, c);
        var sc = S.statusClass(c.status);
        if (!running && sc === "running") running = key;
        if (!passed && sc === "passed") passed = key;
      });
    });
    return running || passed;
  }

  function section(label, text) {
    if (!text) return "";
    return (
      '<section class="doc-section">' +
      "<h3>" +
      esc(label) +
      "</h3>" +
      "<p>" +
      esc(text).replace(/\n/g, "<br />") +
      "</p>" +
      "</section>"
    );
  }

  function openCaseModal(id) {
    var modal = document.getElementById("case-doc-modal");
    if (!modal) return;
    var titleEl = modal.querySelector("[data-role='doc-title']");
    var bodyEl = modal.querySelector("[data-role='doc-body']");
    if (titleEl) titleEl.textContent = id;
    if (bodyEl) bodyEl.innerHTML = '<p class="doc-empty">Loading case doc…</p>';
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    loadCaseIndex().then(function (index) {
      var doc = lookupCaseDoc(index, id);
      var title = fieldText(doc, ["title", "name"]) || id;
      var tcid = fieldText(doc, ["tcid", "id"]) || id;
      var objective = fieldText(doc, ["objective", "Objective"]);
      var reqs = fieldText(doc, ["requirements", "hardware", "requirements_hardware", "Requirements"]);
      var proc = fieldText(doc, ["procedure", "Procedure"]);
      var pf = fieldText(doc, ["pass_fail", "pass/fail", "Pass/Fail"]);
      var comments = fieldText(doc, ["comments", "Comments"]);
      var configs = fieldText(doc, ["configurations", "config", "Configurations"]);
      var published = !!(doc && (objective || reqs || proc || pf || comments || configs || fieldText(doc, ["title"])));
      if (titleEl) titleEl.textContent = published ? title + " · " + tcid : id;
      if (!published) {
        bodyEl.innerHTML =
          '<p class="doc-empty">Doc not yet published for <code>' +
          esc(id) +
          "</code>. Waiting on <code>docs/test-cases/</code>.</p>";
        return;
      }
      bodyEl.innerHTML =
        section("Title + TCID", title + " (" + tcid + ")") +
        section("Objective", objective) +
        section("Requirements / hardware", reqs) +
        section("Procedure", proc) +
        section("Pass / Fail", pf) +
        section("Comments", comments) +
        section("Configurations", configs);
    });
  }

  function closeCaseModal() {
    var modal = document.getElementById("case-doc-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  function bind(status) {
    root.querySelectorAll(".matrix-cell.is-expandable .cell-head").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var art = btn.closest(".matrix-cell");
        var key = art && art.getAttribute("data-key");
        openKey = openKey === key ? null : key;
        paint(status);
      });
    });
    root.querySelectorAll(".case-open").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        openCaseModal(btn.getAttribute("data-case-id"));
      });
    });
  }

  function paint(status) {
    var norm = S.normalizeStatus(status);
    renderHeader(status);
    var stages = norm.stages || [];
    root.innerHTML =
      renderLegend() +
      (status.campaign
        ? '<p class="matrix-campaign">' + esc(status.campaign) + "</p>"
        : "") +
      stages.map(renderStage).join("");
    bind(status);
  }

  function fail(err) {
    if (metaEl) metaEl.textContent = "Status feed failed to load.";
    root.innerHTML =
      '<p class="matrix-error">Could not load campaign-status.json or the sample fixture.</p>';
    console.warn("matrix status load failed", err);
  }

  if (!S || !root) return;

  var modal = document.getElementById("case-doc-modal");
  if (modal) {
    var closer = modal.querySelector(".case-modal-close");
    if (closer) closer.addEventListener("click", closeCaseModal);
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeCaseModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) closeCaseModal();
    });
  }
  loadCaseIndex();

  var POLL_MS = 20000;
  var lastFingerprint = null;
  var currentStatus = null;
  var pollTimer = null;

  function fingerprint(status) {
    if (!status) return "";
    return (
      String(S.statusUpdatedAt(status) || "") +
      "|" +
      String(S.gitCommit(status) || "") +
      "|" +
      String(status._source_file || "")
    );
  }

  function applyStatus(status, isFirst) {
    currentStatus = status;
    var fp = fingerprint(status);
    if (!isFirst && fp === lastFingerprint) return;
    lastFingerprint = fp;
    if (isFirst || openKey == null) openKey = pickDefaultOpen(status);
    paint(status);
    // Keep footer in sync without a full reload.
    document.querySelectorAll(".viewer-stale").forEach(function (el) {
      if (typeof el._n5Refresh === "function") el._n5Refresh();
    });
  }

  function tick(isFirst) {
    if (document.hidden && !isFirst) return;
    S.loadCampaignStatus("../data")
      .then(function (status) {
        applyStatus(status, !!isFirst);
      })
      .catch(function (err) {
        if (isFirst || !currentStatus) fail(err);
        else console.warn("matrix status poll failed", err);
      });
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) tick(false);
  });

  tick(true);
  pollTimer = setInterval(function () {
    tick(false);
  }, POLL_MS);
})();
