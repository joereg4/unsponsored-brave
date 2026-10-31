/* Unsponsored detection. No network, no chrome.* APIs. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.UnsponsoredEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CATEGORIES = ["products", "banners", "carousels", "display", "house"];

  const AMAZON_HOSTS = new Set([
    "amazon.com",
    "amazon.ca",
    "amazon.com.mx",
    "amazon.com.br",
    "amazon.co.uk",
    "amazon.de",
    "amazon.fr",
    "amazon.it",
    "amazon.es",
    "amazon.nl",
    "amazon.se",
    "amazon.pl",
    "amazon.com.be",
    "amazon.co.jp",
    "amazon.com.au",
    "amazon.in",
    "amazon.sg",
    "amazon.ae",
    "amazon.sa",
    "amazon.com.tr",
    "amazon.eg",
    "amazon.cn",
  ]);

  // Short visible labels. Product titles are excluded by length and by
  // only trusting this when the element is a label, not a result heading.
  const LABEL_RE =
    /^(sponsored|gesponsert|sponsorisé|sponsorise|commandité|commandite|patrocinado|sponsorizzato|gesponsord|sponsrad|sponsorowane|sponzorováno|sponzorovano|spnsorowane|スポンサー|赞助|贊助|스폰서)$/i;

  const HOUSE_RE =
    /\b(amazon basics|amazon essentials|amazon elements|amazon commercial|amazon aware|our brands|from our brands|featured from our brands|explore amazon brands|amazon brand shops|shop amazon basics)\b/i;

  const MARKER_SELECTOR = [
    ".puis-sponsored-label-text",
    ".s-sponsored-label-text",
    ".s-widget-sponsored-label-text",
    ".sp_desktop_sponsored_label",
    ".sponsored-brand-label-info-desktop",
    "[data-component-type='sp-sponsored-result']",
    "[data-component-type='sbv-video-single-product']",
    "[data-video-type='sponsored']",
    ".sbv-video-single-product",
    ".sb-video-creative",
    ".AdHolder",
    "[cel_widget_id*='VIDEO_SINGLE_PRODUCT']",
    "[cel_widget_id*='sb-themed']",
    "[cel_widget_id*='sbv']",
    "[cel_widget_id*='multi-brand']",
    "[data-card-metrics-id*='sb-themed']",
    "[data-card-metrics-id*='sbv']",
    "[data-card-metrics-id*='multi-brand']",
    "a[href*='sponsored-ads.amazon.com/clk']",
    "iframe[id^='ape_']",
    "[id^='ape_Detail']",
    "[id^='sponsoredProducts']",
    "[data-feature-name*='sponsoredProducts']",
    "[data-feature-name*='ad-placements']",
    "[data-feature-name*='adplacements']",
    "[data-cel-widget*='adplacements']",
    "iframe[src*='amazon-adsystem.com']",
  ].join(",");

  function retailHost(hostname) {
    if (!hostname) return null;
    const host = String(hostname)
      .toLowerCase()
      .replace(/^(www|smile)\./, "");
    return AMAZON_HOSTS.has(host) ? host : null;
  }

  function textOf(el) {
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }

function idBlob(el) {
  return [
    el.id || "",
    el.getAttribute("cel_widget_id") || "",
    el.getAttribute("data-card-metrics-id") || "",
    el.getAttribute("data-feature-name") || "",
    el.getAttribute("data-component-type") || "",
    el.getAttribute("class") || "",
  ].join(" ");
}

function widgetBlob(el) {
  let blob = idBlob(el);
  el.querySelectorAll("[cel_widget_id], [data-card-metrics-id]").forEach(function (node) {
    blob += " " + (node.getAttribute("cel_widget_id") || "");
    blob += " " + (node.getAttribute("data-card-metrics-id") || "");
  });
  return blob;
}

  function tooBig(el) {
    if (!el || el.nodeType !== 1) return true;
    const id = el.id || "";
    if (
      id === "a-page" ||
      id === "dp" ||
      id === "dp-container" ||
      id === "ppd" ||
      id === "search" ||
      id === "navFooter" ||
      id === "navbar" ||
      id === "centerCol"
    ) {
      return true;
    }
    if (
      el.matches(
        "body, html, .s-main-slot, [data-component-type='s-search-results'], #nav-main, header, footer"
      )
    ) {
      return true;
    }
    if (!el.classList.contains("s-result-item")) {
      if (el.querySelectorAll(".s-result-item").length > 2) return true;
    }
    return false;
  }

  function isPixel(el) {
    const iframe = el.matches("iframe") ? el : null;
    const node = iframe;
    if (!node) return false;
    const src = node.getAttribute("src") || "";
    const id = node.id || "";
    const w = node.getAttribute("width");
    const h = node.getAttribute("height");
    if (id === "DAsis" || /sis_pixel|slot=navFooter/.test(src)) return true;
    if ((w === "1" || w === "0") && (h === "1" || h === "0")) return true;
    return false;
  }

  function containerFor(node) {
    if (!node || node.nodeType !== 1) return null;
    if (isPixel(node)) return null;
    const widget = node.closest(
      ".s-result-item.s-widget, .s-result-item.AdHolder, .AdHolder"
    );
    if (widget && !tooBig(widget)) return widget;
    const card = node.closest("[data-component-type='s-search-result']");
    if (card && !tooBig(card)) return card;
    const feature = node.closest(
      "[id^='sponsoredProducts'], [id^='ape_'], [data-feature-name*='sponsored'], [data-feature-name*='ad-placement'], [data-feature-name*='adplacement'], .a-carousel-container"
    );
    if (feature && !tooBig(feature)) return feature;
    const result = node.closest(".s-result-item");
    if (result && !tooBig(result)) return result;
    const cel = node.closest(".celwidget, [data-card-metrics-id]");
    if (cel && !tooBig(cel)) return cel;
    return null;
  }

  function asinCount(el) {
    const found = new Set();
    if (el.getAttribute) {
      const own = el.getAttribute("data-asin") || "";
      if (/^[A-Z0-9]{10}$/.test(own)) found.add(own);
    }
    el.querySelectorAll("[data-asin]").forEach(function (node) {
      const value = node.getAttribute("data-asin") || "";
      if (/^[A-Z0-9]{10}$/.test(value)) found.add(value);
    });
    return found.size;
  }

function isVideo(el) {
  const blob = widgetBlob(el);
  if (/VIDEO_SINGLE_PRODUCT|sbv-video|sb-video-creative/i.test(blob)) return true;
  return !!el.querySelector(
    "[data-component-type='sbv-video-single-product'], [data-video-type='sponsored'], .sbv-video-single-product, .sb-video-creative"
  );
}

function isCarousel(el) {
  const blob = widgetBlob(el);
  if (
    /themed-collection|multi-brand|searchgrid-carousel|sponsored-products|sp_detail/i.test(
      blob
    )
  ) {
    return true;
  }
    if (el.id && /^sponsoredProducts/i.test(el.id)) return true;
    const many = asinCount(el) >= 2;
    const widget =
      el.classList.contains("s-widget") ||
      el.classList.contains("AdHolder") ||
      el.matches(".celwidget, .a-carousel-container, [data-card-metrics-id]");
    if (many && widget) return true;
    if (
      many &&
      el.querySelector(".a-carousel, .a-carousel-container, [class*='a-carousel']")
    ) {
      return true;
    }
    return false;
  }

  function isDisplay(el) {
    if (isPixel(el)) return false;
    const blob = idBlob(el);
    if (asinCount(el) >= 1 && !/ape_|ad-placement|adplacement|ilm/i.test(blob)) {
      return false;
    }
    if (el.matches("iframe[id^='ape_'], [id^='ape_']")) return true;
    if (/ape_|ad-placements|adplacements|desktop-detail-ilm|image-ads/i.test(blob)) {
      return true;
    }
    const frame = el.matches("iframe") ? el : el.querySelector("iframe[src*='amazon-adsystem.com'], iframe[id^='ape_']");
    if (frame && !isPixel(frame) && asinCount(el) === 0) return true;
    return false;
  }

  function isSingleProduct(el) {
    const asin = el.getAttribute("data-asin") || "";
    if (el.getAttribute("data-component-type") === "s-search-result" && asin.length >= 10) {
      return true;
    }
    if (/^[A-Z0-9]{10}$/.test(asin) && !el.classList.contains("s-widget")) return true;
    return false;
  }

  function classify(el) {
    if (isVideo(el)) return "banners";
    if (isCarousel(el)) return "carousels";
    if (isDisplay(el)) return "display";
    if (isSingleProduct(el)) return "products";
    if (el.classList.contains("AdHolder") || el.querySelector(".puis-sponsored-label-text, .sponsored-brand-label-info-desktop")) {
      return asinCount(el) >= 2 ? "carousels" : "banners";
    }
    return "products";
  }

  function isLabelCandidate(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest("script, style, noscript, textarea, .unsponsored-tag")) return false;
    const text = textOf(el);
    if (text.length > 0 && text.length <= 24 && LABEL_RE.test(text)) {
      // A product heading that is exactly "Sponsored" is vanishingly rare.
      // Reject long product titles that merely contain the word.
      if (el.matches("h2, h3") && el.closest("[data-component-type='s-search-result']")) {
        return false;
      }
      return true;
    }
    const aria = el.getAttribute("aria-label") || "";
    if (
      aria.length > 0 &&
      aria.length < 220 &&
      /sponsored ad|feedback on sponsored|mute sponsored|play sponsored|pause sponsored|sponsored video/i.test(
        aria
      )
    ) {
      return true;
    }
    return false;
  }

  function collectMarkers(root) {
    const found = new Set();
    const scope = root.nodeType === 9 ? root : root;
    if (!scope.querySelectorAll) return found;
    scope.querySelectorAll(MARKER_SELECTOR).forEach(function (el) {
      if (el.closest(".unsponsored-tag")) return;
      if (isPixel(el)) return;
      found.add(el);
    });
    const scanRoot = scope.nodeType === 9 ? scope.body : scope;
    if (!scanRoot) return found;
    scanRoot.querySelectorAll("span, a, div, button, label").forEach(function (el) {
      if (isLabelCandidate(el)) found.add(el);
    });
    return found;
  }

  function sectionHeading(el) {
    const headings = el.querySelectorAll("h1, h2, h3, .a-carousel-heading");
    for (let i = 0; i < headings.length && i < 4; i++) {
      const heading = headings[i];
      if (heading.closest("[data-component-type='s-search-result'], [data-asin]")) continue;
      const text = textOf(heading);
      if (text.length > 0 && text.length < 90 && HOUSE_RE.test(text)) return heading;
    }
    return null;
  }

  function findHouse(root) {
    const units = [];
    const scope = root.nodeType === 9 ? root.body : root;
    if (!scope || !scope.querySelectorAll) return units;
    scope.querySelectorAll("h1, h2, h3, .a-carousel-heading").forEach(function (heading) {
      const text = textOf(heading);
      if (!text || text.length > 90 || !HOUSE_RE.test(text)) return;
      if (heading.closest("[data-component-type='s-search-result']")) return;
      const box = heading.closest(
        ".s-result-item, .celwidget, .a-carousel-container, [data-cel-widget], section"
      );
      if (!box || tooBig(box)) return;
      if (isSingleProduct(box)) return;
      units.push(box);
    });
    return units;
  }

function visibleText(el) {
  if (!el) return "";
  let value = "";
  function walk(node) {
    if (node.nodeType === 3) {
      value += node.nodeValue || "";
      return;
    }
    if (node.nodeType !== 1) return;
    if (/^(script|style|noscript)$/i.test(node.tagName)) return;
    for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
  }
  walk(el);
  return value.replace(/\s+/g, " ").trim();
}

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function junkTitle(text) {
  const value = cleanText(text);
  if (!value) return true;
  if (LABEL_RE.test(value)) return true;
  if (/^sponsored video\b/i.test(value)) return true;
  if (/leave feedback|feedback on sponsored/i.test(value)) return true;
  if (
    /^(products related to this item|related products with free delivery|customers also bought|more from frequently bought brands|frequently bought together)[.…\s]*$/i.test(
      value
    )
  ) {
    return true;
  }
  return false;
}

function brandTitle(el) {
  if (!el || !el.querySelectorAll) return "";
  const nodes = el.querySelectorAll("[aria-label]");
  for (let i = 0; i < nodes.length; i++) {
    const aria = cleanText(nodes[i].getAttribute("aria-label"));
    if (/^sponsored ad from\b/i.test(aria) && !junkTitle(aria)) return aria.slice(0, 180);
  }
  return "";
}

function cardTitle(el) {
  if (!el || !el.querySelectorAll) return "";
  const selectors = [
    "h2 a span",
    "h2 span",
    "h2",
    "h3 a span",
    "h3",
    ".a-size-medium",
    ".a-size-base-plus",
    ".a-truncate-full",
    ".p13n-sc-truncate",
    ".p13n-sc-truncated",
    "a.a-link-normal span",
    "a.a-link-normal",
  ];
  for (let s = 0; s < selectors.length; s++) {
    const nodes = el.querySelectorAll(selectors[s]);
    for (let i = 0; i < nodes.length; i++) {
      const text = cleanText(visibleText(nodes[i]));
      if (text.length < 2 || text.length > 180 || junkTitle(text)) continue;
      return text.slice(0, 180);
    }
  }
  const brand = brandTitle(el);
  if (brand) return brand;
  return "";
}

function unitTitle(el) {
  return cardTitle(el);
}

  function unitAsin(el) {
    const own = el.getAttribute("data-asin") || "";
    if (/^[A-Z0-9]{10}$/.test(own)) return own;
    if (asinCount(el) !== 1) return "";
    const child = el.querySelector("[data-asin]");
    const value = child ? child.getAttribute("data-asin") || "" : "";
    return /^[A-Z0-9]{10}$/.test(value) ? value : "";
  }

  function findUnits(root) {
    const map = new Map();
    collectMarkers(root).forEach(function (marker) {
      const el = containerFor(marker);
      if (!el || tooBig(el) || map.has(el)) return;
      const category = classify(el);
      if (!category || category === "house") return;
      map.set(el, {
        el: el,
        category: category,
        title: unitTitle(el),
        asin: unitAsin(el),
      });
    });

    findHouse(root).forEach(function (el) {
      const overlaps = Array.from(map.keys()).some(function (other) {
        return other === el || other.contains(el) || el.contains(other);
      });
      if (overlaps || map.has(el)) return;
      map.set(el, {
        el: el,
        category: "house",
        title: unitTitle(el),
        asin: "",
      });
    });

    const list = Array.from(map.values());
    return list.filter(function (unit) {
      return !list.some(function (other) {
        return other !== unit && other.el.contains(unit.el);
      });
    });
  }

  function countUnits(units) {
    const counts = { products: 0, banners: 0, carousels: 0, display: 0, house: 0 };
    units.forEach(function (unit) {
      if (counts[unit.category] != null) counts[unit.category] += 1;
    });
    return counts;
  }

  function removedTotal(counts, settings) {
    if (!settings || !settings.enabled) return 0;
    const cats = settings.categories || {};
    return CATEGORIES.reduce(function (sum, key) {
      return sum + (cats[key] ? counts[key] || 0 : 0);
    }, 0);
  }

  function signature(unit, pageUrl) {
    const url = String(pageUrl || "").split("#")[0];
    return [url, unit.category, unit.asin || "", (unit.title || "").slice(0, 80)].join("|");
  }

  function isShoppingUrl(url) {
    return /\/s([/?]|$)/.test(url) || /\/dp\/|\/gp\/product\/|\/gp\/aw\/d\//.test(url);
  }

  function isCaught(unit, settings) {
    if (!settings || !settings.enabled || !unit) return false;
    const cats = settings.categories || {};
    return !!cats[unit.category];
  }

  function productCards(container) {
    if (!container || !container.getAttribute) return [];
    const own = container.getAttribute("data-asin") || "";
    if (/^[A-Z0-9]{10}$/.test(own) && asinCount(container) === 1) return [container];
    const cards = [];
    if (!container.querySelectorAll) return cards;
    container.querySelectorAll("[data-asin]").forEach(function (node) {
      const asin = node.getAttribute("data-asin") || "";
      if (!/^[A-Z0-9]{10}$/.test(asin)) return;
      if (asinCount(node) !== 1) return;
      cards.push(node);
    });
    return cards.filter(function (node) {
      return !cards.some(function (other) {
        return other !== node && other.contains(node);
      });
    });
  }

  function loggableRows(unit) {
    const el = unit && unit.el;
    if (!el) return [];
    const cards = productCards(el);
    const brand = brandTitle(el);
    if (brand && cards.length >= 2) {
      return [
        {
          category: unit.category === "products" ? "carousels" : unit.category,
          title: brand,
          asin: "",
        },
      ];
    }
    if (cards.length >= 1) {
      return cards
        .map(function (card) {
          return {
            category: "products",
            title: cardTitle(card),
            asin: card.getAttribute("data-asin") || "",
          };
        })
        .filter(function (row) {
          return row.asin && !junkTitle(row.title);
        });
    }
    const title = cardTitle(el);
    if (!junkTitle(title)) {
      return [{ category: unit.category, title: title, asin: unit.asin || "" }];
    }
    return [];
  }

  function rowKey(row, pageUrl) {
    const url = String(pageUrl || row.pageUrl || "").split("#")[0];
    if (row && row.asin) return url + "|asin|" + row.asin;
    return [url, (row && row.category) || "", "", cleanText(row && row.title).slice(0, 80)].join("|");
  }

  function listingKey(entry) {
    return rowKey(entry, entry && entry.pageUrl);
  }

  function legacyKey(row, pageUrl) {
    const url = String(pageUrl || "").split("#")[0];
    return [url, (row && row.category) || "", (row && row.asin) || "", cleanText(row && row.title).slice(0, 80)].join(
      "|"
    );
  }

  function usableListing(entry) {
    return !!(entry && entry.title && !junkTitle(entry.title));
  }

  function copyListing(entry) {
    return {
      loggedAt: entry.loggedAt,
      pageUrl: entry.pageUrl,
      pageTitle: entry.pageTitle || "",
      category: entry.category,
      asin: entry.asin || "",
      title: entry.title,
      mode: entry.mode || "",
    };
  }

  function copyPage(page) {
    return {
      url: page.url,
      title: page.title || "",
      loggedAt: page.loggedAt,
      listingCount: page.listingCount || 0,
    };
  }

  function parseSeen(sig) {
    const parts = String(sig || "").split("|");
    for (let i = 0; i < parts.length - 2; i++) {
      if (CATEGORIES.indexOf(parts[i]) === -1) continue;
      return {
        category: parts[i],
        asin: parts[i + 1] || "",
        title: parts.slice(i + 2).join("|"),
      };
    }
    return null;
  }

  function csvCell(value) {
    const text = value == null ? "" : String(value);
    if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function toCsv(rows) {
    return (
      rows
        .map(function (row) {
          return row.map(csvCell).join(",");
        })
        .join("\n") + "\n"
    );
  }

  function logSnapshot(state) {
    return {
      lifetime: (state && state.lifetime) || 0,
      seen: ((state && state.seen) || []).slice(-4000),
      listings: ((state && state.listings) || []).slice(-2000).map(copyListing),
      pages: ((state && state.pages) || []).slice(-500).map(copyPage),
    };
  }

  function listingCountFor(listings, pageUrl) {
    return listings.filter(function (entry) {
      return entry.pageUrl === pageUrl;
    }).length;
  }

  function alignPage(entry, listings, now) {
    const rows = listings.filter(function (row) {
      return row.pageUrl === entry.url;
    });
    let newest = "";
    rows.forEach(function (row) {
      if (row.loggedAt && row.loggedAt > newest) newest = row.loggedAt;
    });
    return {
      url: entry.url,
      title: entry.title || "",
      loggedAt: rows.length && newest ? newest : entry.loggedAt || now,
      listingCount: rows.length,
    };
  }

  function recordCaught(state, units, page) {
    const source = state || {};
    const info = page || {};
    const pageUrl = String(info.pageUrl || "").split("#")[0];
    const pageTitle = info.pageTitle || "";
    const now = info.now || new Date().toISOString();
    const logEnabled = !!source.logEnabled;
    const skip = new Set(info.skipKeys || []);
    const seen = new Set(source.seen || []);
    let lifetime = source.lifetime || 0;
    let removed = 0;
    Array.from(seen).forEach(function (sig) {
      const parsed = parseSeen(sig);
      if (!parsed || parsed.asin || !junkTitle(parsed.title)) return;
      seen.delete(sig);
      removed += 1;
    });
    lifetime = Math.max(0, lifetime - removed);

    let listings = (source.listings || []).filter(usableListing).map(copyListing);
    const pages = (source.pages || []).map(copyPage);

    function rememberRow(row) {
      const key = rowKey(row, pageUrl);
      if (skip.has(key)) return;
      const already =
        seen.has(key) || seen.has(legacyKey(row, pageUrl)) || (row.asin && seen.has(pageUrl + "|asin|" + row.asin));
      if (!already) lifetime += 1;
      seen.add(key);
      if (!logEnabled) return;
      const inList = listings.some(function (entry) {
        return listingKey(entry) === key;
      });
      if (inList) return;
      listings.push({
        loggedAt: now,
        pageUrl: pageUrl,
        pageTitle: pageTitle,
        category: row.category,
        asin: row.asin || "",
        title: row.title,
        mode: source.mode || "",
      });
    }

    (units || []).forEach(function (unit) {
      if (!isCaught(unit, source)) return;
      loggableRows(unit).forEach(rememberRow);
    });

    if (listings.length > 2000) listings = listings.slice(-2000);

    for (let i = 0; i < pages.length; i++) {
      const aligned = alignPage(pages[i], listings, now);
      if (pages[i].url === pageUrl && pageTitle) aligned.title = pageTitle;
      pages[i] = aligned;
    }

    if (logEnabled && pageUrl) {
      let pageEntry = null;
      for (let i = 0; i < pages.length; i++) {
        if (pages[i].url === pageUrl) pageEntry = pages[i];
      }
      const count = listingCountFor(listings, pageUrl);
      if (!pageEntry && (count > 0 || isShoppingUrl(pageUrl))) {
        pages.push(
          alignPage(
            {
              url: pageUrl,
              title: pageTitle,
              loggedAt: now,
              listingCount: 0,
            },
            listings,
            now
          )
        );
        if (pageTitle) pages[pages.length - 1].title = pageTitle;
      }
    }

    const next = {
      enabled: !!source.enabled,
      mode: source.mode || "hidden",
      categories: source.categories,
      logEnabled: logEnabled,
      since: source.since || null,
      lifetime: lifetime,
      seen: Array.from(seen).slice(-4000),
      listings: listings,
      pages: pages.slice(-500),
    };
    const prevSnap = JSON.stringify(
      logSnapshot({
        lifetime: source.lifetime || 0,
        seen: source.seen || [],
        listings: source.listings || [],
        pages: source.pages || [],
      })
    );
    return {
      changed: JSON.stringify(logSnapshot(next)) !== prevSnap,
      log: next,
    };
  }

  function exportLog(state, exportedAt) {
    const listings = ((state && state.listings) || []).filter(usableListing).map(copyListing);
    const pages = ((state && state.pages) || []).map(function (page) {
      return alignPage(page, listings, page.loggedAt);
    });
    return {
      exportedAt: exportedAt,
      since: (state && state.since) || null,
      lifetime: (state && state.lifetime) || 0,
      listings: listings,
      pages: pages,
    };
  }

  function listingsCsv(listings) {
    const rows = [["loggedAt", "pageUrl", "pageTitle", "category", "asin", "title", "mode"]];
    (listings || []).filter(usableListing).forEach(function (item) {
      rows.push([item.loggedAt, item.pageUrl, item.pageTitle, item.category, item.asin, item.title, item.mode]);
    });
    return toCsv(rows);
  }

  function pagesCsv(state) {
    const exported = exportLog(state, "");
    const rows = [["loggedAt", "url", "title", "listingCount"]];
    exported.pages.forEach(function (item) {
      rows.push([item.loggedAt, item.url, item.title, item.listingCount]);
    });
    return toCsv(rows);
  }

  function logSummary(state) {
    const exported = exportLog(state, "");
    return {
      listings: exported.listings.length,
      pages: exported.pages.length,
    };
  }

  return {
    CATEGORIES: CATEGORIES,
    AMAZON_HOSTS: AMAZON_HOSTS,
    retailHost: retailHost,
    findUnits: findUnits,
    countUnits: countUnits,
    removedTotal: removedTotal,
    signature: signature,
    classify: classify,
    isLabelCandidate: isLabelCandidate,
    recordCaught: recordCaught,
    exportLog: exportLog,
    listingsCsv: listingsCsv,
    pagesCsv: pagesCsv,
    logSummary: logSummary,
    logSnapshot: logSnapshot,
    listingKey: listingKey,
  };
});
