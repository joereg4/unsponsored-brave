/* Applies Unsponsored on Amazon retail pages. Local storage only. */
(function () {
  const engine = globalThis.UnsponsoredEngine;
  if (!engine || !engine.retailHost(location.hostname)) return;

  const DEFAULTS = {
    enabled: true,
    mode: "hidden",
    categories: {
      products: true,
      banners: true,
      carousels: true,
      display: true,
      house: false,
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
      chrome.storage.local.set({
        lifetime: settings.lifetime,
        seen: settings.seen.slice(-4000),
        listings: settings.listings.slice(-2000),
        pages: settings.pages.slice(-500),
      });
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

  function isShoppingUrl(url) {
    return /\/s([/?]|$)/.test(url) || /\/dp\/|\/gp\/product\/|\/gp\/aw\/d\//.test(url);
  }

  function remember() {
    if (!settings) return;
    const pageUrl = location.href.split("#")[0];
    const seen = new Set(settings.seen);
    let changed = false;
    current.forEach(function (unit) {
      if (!acted(unit)) return;
      const sig = engine.signature(unit, pageUrl);
      if (seen.has(sig)) return;
      seen.add(sig);
      settings.lifetime += 1;
      changed = true;
      if (settings.logEnabled) {
        settings.listings.push({
          loggedAt: new Date().toISOString(),
          pageUrl: pageUrl,
          pageTitle: document.title,
          category: unit.category,
          asin: unit.asin || "",
          title: unit.title || "",
          mode: settings.mode,
        });
      }
    });
    if (settings.logEnabled && (changed || isShoppingUrl(pageUrl) || current.some(acted))) {
      let page = settings.pages.find(function (entry) {
        return entry.url === pageUrl;
      });
      const listingCount = settings.listings.filter(function (entry) {
        return entry.pageUrl === pageUrl;
      }).length;
      if (!page && (changed || isShoppingUrl(pageUrl) || listingCount > 0)) {
        page = {
          url: pageUrl,
          title: document.title,
          loggedAt: new Date().toISOString(),
          listingCount: listingCount,
        };
        settings.pages.push(page);
        changed = true;
      } else if (page && (page.listingCount !== listingCount || page.title !== document.title)) {
        page.listingCount = listingCount;
        page.title = document.title;
        changed = true;
      }
    }
    if (changed) {
      settings.seen = Array.from(seen).slice(-4000);
      if (settings.listings.length > 2000) {
        settings.listings = settings.listings.slice(-2000);
      }
      persistSoon();
    }
  }

  function publish() {
    const counts = engine.countUnits(current);
    try {
      chrome.runtime.sendMessage({
        type: "unsponsored:status",
        host: engine.retailHost(location.hostname),
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
    current = engine.findUnits(document).filter(function (unit) {
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
        host: engine.retailHost(location.hostname),
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
    ["enabled", "mode", "categories", "logEnabled", "since", "lifetime", "seen", "listings", "pages"].forEach(
      function (key) {
        if (changes[key]) settings[key] = changes[key].newValue;
      }
    );
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
