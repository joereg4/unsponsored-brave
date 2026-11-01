/* Applies Unsponsored on Amazon and LinkedIn pages. Local storage only. */
(function () {
  const engine = globalThis.UnsponsoredEngine;
  const site = engine && engine.siteFor(location.hostname);
  if (!engine || !site) return;

  const DEFAULTS = {
    enabled: true,
    mode: "hidden",
    categories: {
      products: true,
      banners: true,
      carousels: true,
      display: true,
      house: false,
      feed: true,
      rail: true,
    },
    logEnabled: false,
    since: null,
    lifetime: 0,
    seen: [],
    listings: [],
    pages: [],
  };

  let settings = null;
  let current = [];
  let flashing = false;
  let flashTimer = 0;
  let saveTimer = 0;
  let scanTimer = 0;
  let skipKeys = [];
  let skipUrl = "";

  function loadSettings() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(null, function (data) {
        const stored = data || {};
        const patch = {};
        if (stored.enabled === undefined) patch.enabled = DEFAULTS.enabled;
        if (!stored.mode) patch.mode = DEFAULTS.mode;
        const mergedCategories = Object.assign({}, DEFAULTS.categories, stored.categories);
        if (!stored.categories || JSON.stringify(mergedCategories) !== JSON.stringify(stored.categories)) {
          patch.categories = mergedCategories;
        }
        if (stored.logEnabled === undefined) patch.logEnabled = DEFAULTS.logEnabled;
        if (!stored.since) patch.since = new Date().toISOString();
        if (typeof stored.lifetime !== "number") patch.lifetime = 0;
        if (!Array.isArray(stored.seen)) patch.seen = [];
        if (!Array.isArray(stored.listings)) patch.listings = [];
        if (!Array.isArray(stored.pages)) patch.pages = [];
        const apply = function (next) {
          settings = {
            enabled: next.enabled,
            mode: next.mode,
            categories: Object.assign({}, DEFAULTS.categories, next.categories),
            logEnabled: !!next.logEnabled,
            since: next.since,
            lifetime: next.lifetime || 0,
            seen: next.seen || [],
            listings: next.listings || [],
            pages: next.pages || [],
          };
          resolve(settings);
        };
        if (Object.keys(patch).length) {
          chrome.storage.local.set(patch, function () {
            apply(Object.assign({}, stored, patch));
          });
        } else {
          apply(stored);
        }
      });
    });
  }

  function persistSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (!settings) return;
      chrome.storage.local.set(engine.logSnapshot(settings));
    }, 400);
  }

  function clearElement(el) {
    el.classList.remove(
      "unsponsored-hidden",
      "unsponsored-dimmed",
      "unsponsored-outlined",
      "unsponsored-flash",
      "unsponsored-pos"
    );
    const tag = el.querySelector(":scope > .unsponsored-tag");
    if (tag) tag.remove();
  }

  function ensureTag(el, show) {
    let tag = null;
    for (let i = 0; i < el.children.length; i++) {
      if (el.children[i].classList && el.children[i].classList.contains("unsponsored-tag")) {
        tag = el.children[i];
        break;
      }
    }
    if (!show) {
      if (tag) tag.remove();
      return;
    }
    if (getComputedStyle(el).position === "static") el.classList.add("unsponsored-pos");
    if (!tag) {
      tag = document.createElement("span");
      tag.className = "unsponsored-tag";
      tag.textContent = "Sponsored";
      el.appendChild(tag);
    }
  }

  function acted(unit) {
    return !!(settings && settings.enabled && settings.categories[unit.category]);
  }

  function apply() {
    if (!settings || flashing) return;
    const next = new Set();
    current.forEach(function (unit) {
      const el = unit.el;
      if (!el || !el.isConnected) return;
      next.add(el);
      const on = acted(unit);
      el.classList.toggle("unsponsored-hidden", on && settings.mode === "hidden");
      el.classList.toggle("unsponsored-dimmed", on && settings.mode === "dimmed");
      el.classList.toggle("unsponsored-outlined", on && settings.mode === "outlined");
      el.classList.remove("unsponsored-flash");
      ensureTag(el, on && settings.mode === "outlined");
    });
    document.querySelectorAll("[data-unsponsored-unit]").forEach(function (el) {
      if (!next.has(el)) {
        clearElement(el);
        el.removeAttribute("data-unsponsored-unit");
      }
    });
    next.forEach(function (el) {
      el.setAttribute("data-unsponsored-unit", "1");
    });
  }

  function remember() {
    if (!settings) return;
    const pageUrl = location.href.split("#")[0];
    if (skipUrl && skipUrl !== pageUrl) {
      skipKeys = [];
      skipUrl = "";
    }
    const result = engine.recordCaught(settings, current, {
      pageUrl: pageUrl,
      pageTitle: document.title,
      now: new Date().toISOString(),
      skipKeys: skipKeys,
    });
    if (!result.changed) return;
    settings.lifetime = result.log.lifetime;
    settings.seen = result.log.seen;
    settings.listings = result.log.listings;
    settings.pages = result.log.pages;
    persistSoon();
  }

  function publish() {
    const counts = engine.countUnits(current);
    try {
      chrome.runtime.sendMessage({
        type: "unsponsored:status",
        host: engine.pageHost(location.hostname),
        url: location.href.split("#")[0],
        counts: counts,
        removed: engine.removedTotal(counts, settings),
      });
    } catch (err) {
      /* popup may be closed */
    }
  }

  function scan() {
    if (!settings) return;
    current = engine.findUnits(document, site).filter(function (unit) {
      return unit.el && unit.el.isConnected !== false;
    });
    apply();
    remember();
    publish();
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 80);
  }

  function flash() {
    if (!settings) return;
    const targets = current.filter(acted);
    flashing = true;
    targets.forEach(function (unit) {
      unit.el.classList.remove("unsponsored-hidden", "unsponsored-dimmed");
      unit.el.classList.add("unsponsored-flash");
    });
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      flashing = false;
      targets.forEach(function (unit) {
        if (unit.el) unit.el.classList.remove("unsponsored-flash");
      });
      apply();
    }, 5000);
  }

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (!message || !settings) return;
    if (message.type === "unsponsored:getStatus") {
      const counts = engine.countUnits(current);
      sendResponse({
        host: engine.pageHost(location.hostname),
        url: location.href.split("#")[0],
        counts: counts,
        removed: engine.removedTotal(counts, settings),
      });
      return true;
    }
    if (message.type === "unsponsored:flash") {
      flash();
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === "unsponsored:rescan") {
      scan();
      sendResponse({ ok: true });
      return true;
    }
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local" || !settings) return;
    ["enabled", "mode", "categories", "logEnabled", "since"].forEach(function (key) {
      if (changes[key]) settings[key] = changes[key].newValue;
    });
    if (
      changes.logEnabled &&
      changes.logEnabled.newValue &&
      !changes.logEnabled.oldValue
    ) {
      skipKeys = [];
      skipUrl = "";
    }
    const clearing =
      changes.listings &&
      Array.isArray(changes.listings.newValue) &&
      changes.listings.newValue.length === 0 &&
      changes.pages &&
      Array.isArray(changes.pages.newValue) &&
      changes.pages.newValue.length === 0 &&
      !changes.lifetime &&
      !changes.seen;
    if (clearing) {
      skipUrl = location.href.split("#")[0];
      skipKeys = (settings.listings || []).map(function (row) {
        return engine.listingKey(row);
      });
      settings.listings = [];
      settings.pages = [];
    }
    if (settings.categories) {
      settings.categories = Object.assign({}, DEFAULTS.categories, settings.categories);
    }
    scheduleScan();
  });

  const observer = new MutationObserver(function (records) {
    const interesting = records.some(function (record) {
      const nodes = [];
      record.addedNodes.forEach(function (node) {
        nodes.push(node);
      });
      record.removedNodes.forEach(function (node) {
        nodes.push(node);
      });
      if (!nodes.length) return false;
      return nodes.some(function (node) {
        if (node.nodeType !== 1) return true;
        if (node.classList && node.classList.contains("unsponsored-tag")) return false;
        return true;
      });
    });
    if (interesting) scheduleScan();
  });

  loadSettings().then(function () {
    scan();
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(scheduleScan, 2000);
  });
})();
