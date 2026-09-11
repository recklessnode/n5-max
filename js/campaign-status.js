/* Shared campaign-status + build-info loader (status/timestamps only). */
(function (global) {
  "use strict";

  var DEFAULT_STALE_S = 900;

  function firstString(obj, keys) {
    if (!obj) return "";
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var cur = obj;
      var parts = k.split(".");
      for (var j = 0; j < parts.length && cur != null; j++) cur = cur[parts[j]];
      if (typeof cur === "string" && cur) return cur;
    }
    return "";
  }

  function redactHost(status) {
    if (!status || typeof status !== "object") return status;
    var clone = JSON.parse(JSON.stringify(status));
    var hostKeys = ["host", "hostname", "sut", "sut_host", "node", "ip", "address"];
    function strip(o) {
      if (!o || typeof o !== "object") return;
      hostKeys.forEach(function (k) {
        if (k in o) delete o[k];
      });
    }
    strip(clone);
    strip(clone.campaign);
    strip(clone.meta);
    return clone;
  }

  function resolveDataRoot() {
    var el = document.querySelector("[data-data-root]");
    if (el && el.getAttribute("data-data-root")) {
      return el.getAttribute("data-data-root").replace(/\/$/, "");
    }
    return "data";
  }

  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
      return res.json();
    });
  }

  function loadCampaignStatus(dataRoot) {
    var root = (dataRoot || resolveDataRoot()).replace(/\/$/, "");
    return fetchJson(root + "/campaign-status.json")
      .then(function (j) {
        j = redactHost(j);
        j._source_file = "campaign-status.json";
        return j;
      })
      .catch(function () {
        return fetchJson(root + "/campaign-status.sample.json").then(function (j) {
          j = redactHost(j);
          j._source_file = "campaign-status.sample.json";
          return j;
        });
      });
  }

  function loadBuildInfo(dataRoot) {
    var root = (dataRoot || resolveDataRoot()).replace(/\/$/, "");
    return fetchJson(root + "/build-info.json").catch(function () {
      return { git_commit: "unknown", built_at: "", repo: "" };
    });
  }

  function statusUpdatedAt(status) {
    return firstString(status, [
      "status_updated_at",
      "updated_at",
      "updatedAt",
      "timestamp",
    ]);
  }

  function staleAfterS(status) {
    var n = status && (status.stale_after_s || status.stale_after_seconds || status.staleAfterS);
    n = Number(n);
    return isFinite(n) && n > 0 ? n : DEFAULT_STALE_S;
  }

  function parseIso(s) {
    if (!s) return null;
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatIso(s) {
    var d = parseIso(s);
    if (!d) return s || "—";
    return d.toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  function formatAge(fromIso, now) {
    var d = parseIso(fromIso);
    if (!d) return "";
    var sec = Math.max(0, Math.round(((now || Date.now()) - d.getTime()) / 1000));
    if (sec < 60) return sec + "s ago";
    if (sec < 3600) return Math.round(sec / 60) + " min ago";
    if (sec < 86400) {
      var h = sec / 3600;
      return (h >= 10 ? Math.round(h) : h.toFixed(1).replace(/\.0$/, "")) + " h ago";
    }
    return Math.round(sec / 86400) + " d ago";
  }

  function formatDuration(s) {
    s = Number(s) || 0;
    if (s < 60) return s + " seconds";
    if (s < 3600) return Math.round(s / 60) + " minutes";
    if (s < 86400) {
      var h = s / 3600;
      return (h >= 10 ? Math.round(h) : h.toFixed(1).replace(/\.0$/, "")) + " hours";
    }
    return Math.round(s / 86400) + " days";
  }

  function formatClock(s) {
    var d = parseIso(s);
    if (!d) return "—";
    var iso = d.toISOString().replace(/\.\d{3}Z$/, "Z");
    return iso.replace("T", " ").replace("Z", " UTC");
  }

  function isStale(status, now) {
    var d = parseIso(statusUpdatedAt(status));
    if (!d) return false;
    return ((now || Date.now()) - d.getTime()) / 1000 > staleAfterS(status);
  }

  function normalizeStatus(status) {
    if (!status) return { stages: [] };
    if (Array.isArray(status.stages)) return status;
    if (status.matrix && Array.isArray(status.matrix.stages)) {
      return Object.assign({}, status, { stages: status.matrix.stages });
    }
    if (Array.isArray(status.cells)) {
      var stageMeta = status.stage && typeof status.stage === "object" ? status.stage : {};
      var defaultSid = stageMeta.id != null ? stageMeta.id : 1;
      var defaultName = stageMeta.name || ("Stage " + defaultSid);
      var hasPerCell = status.cells.some(function (c) { return c.stage != null; });
      if (!hasPerCell) {
        return Object.assign({}, status, {
          stages: [{
            id: defaultSid,
            name: defaultName,
            cells: status.cells,
          }],
        });
      }
      var by = {};
      status.cells.forEach(function (c) {
        var sid = c.stage != null ? String(c.stage) : String(defaultSid);
        if (!by[sid]) {
          by[sid] = {
            id: c.stage != null ? c.stage : defaultSid,
            name: c.stage_name || defaultName || ("Stage " + sid),
            cells: [],
          };
        }
        by[sid].cells.push(c);
      });
      return Object.assign({}, status, {
        stages: Object.keys(by)
          .sort()
          .map(function (k) {
            return by[k];
          }),
      });
    }
    return Object.assign({}, status, { stages: [] });
  }

  function cellKey(stage, cell) {
    var sid = stage && (stage.id != null ? stage.id : stage.name);
    var n = cell && (cell.n != null ? cell.n : cell.id);
    return String(sid) + "." + String(n);
  }

  function statusClass(s) {
    s = String(s || "pending").toLowerCase();
    if (s === "skip" || s === "skipped") return "skipped";
    if (s === "blocked") return "blocked";
    if (s === "passed" || s === "ok" || s === "success") return "passed";
    if (s === "failed" || s === "fail" || s === "error") return "failed";
    if (s === "running" || s === "in_progress" || s === "active") return "running";
    return "pending";
  }

  function caseList(cell) {
    if (!cell) return [];
    if (Array.isArray(cell.cases)) return cell.cases;
    if (cell.tests && typeof cell.tests === "object" && !Array.isArray(cell.tests)) {
      return Object.keys(cell.tests).map(function (id) {
        var t = cell.tests[id] || {};
        return Object.assign({ id: id }, t);
      });
    }
    return [];
  }

  function caseId(c) {
    return firstString(c, ["id", "name", "tag", "case"]) || "case";
  }

  function caseStarted(c) {
    return firstString(c, ["started_at", "started", "t0", "begin"]);
  }

  function caseFinished(c) {
    return firstString(c, ["finished_at", "finished", "t1", "end"]);
  }

  function harnessCommit(status) {
    return firstString(status, [
      "harness_commit",
      "harness.commit",
      "commits.harness",
      "git.harness",
    ]);
  }

  function gitCommit(status) {
    return firstString(status, [
      "git_commit",
      "git.commit",
      "commits.git",
      "commit",
    ]);
  }

  global.N5Status = {
    DEFAULT_STALE_S: DEFAULT_STALE_S,
    resolveDataRoot: resolveDataRoot,
    loadCampaignStatus: loadCampaignStatus,
    loadBuildInfo: loadBuildInfo,
    redactHost: redactHost,
    firstString: firstString,
    statusUpdatedAt: statusUpdatedAt,
    staleAfterS: staleAfterS,
    parseIso: parseIso,
    formatIso: formatIso,
    formatAge: formatAge,
    formatDuration: formatDuration,
    formatClock: formatClock,
    isStale: isStale,
    normalizeStatus: normalizeStatus,
    cellKey: cellKey,
    statusClass: statusClass,
    caseList: caseList,
    caseId: caseId,
    caseStarted: caseStarted,
    caseFinished: caseFinished,
    harnessCommit: harnessCommit,
    gitCommit: gitCommit,
  };
})(window);
