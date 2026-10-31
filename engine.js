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

function unitTitle(el) {
  const labelled = el.querySelector(
    "[aria-label*='Sponsored ad from'], a[aria-label*='Sponsored'], [aria-label*='Sponsored video']"
  );
  if (labelled) {
    const aria = (labelled.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    if (aria) return aria.slice(0, 180);
  }
  const heading = sectionHeading(el) || el.querySelector("h2, h3, .a-carousel-heading");
  return (visibleText(heading) || visibleText(el)).slice(0, 180);
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
  };
});
