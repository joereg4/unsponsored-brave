/* LinkedIn feed posts and right-rail ads. Registers a finder on UnsponsoredEngine. */
(function (root) {
  const AD_LABELS = [
    "promoted",
    "sponsored",
    "ad",
    "anzeige",
    "gesponsert",
    "dipromosikan",
    "propagováno",
    "promoveret",
    "promocionado",
    "patrocinado",
    "促銷內容",
    "广告",
    "post sponsorisé",
    "프로모션",
    "post sponsorizzato",
    "プロモーション",
    "treść promowana",
    "promovat",
    "продвигается",
    "marknadsfört",
    "nai-promote",
    "ได้รับการโปรโมท",
    "öne çıkarılan içerik",
    "gepromoot",
    "الترويج",
  ];

  const labelSet = {};
  AD_LABELS.forEach(function (label) {
    labelSet[label] = true;
  });

  const SKIP =
    "[data-job-id], .job-card-container, .jobs-search-results__list, .jobs-search-results-list, " +
    "#msg-overlay, .msg-overlay-list-bubble, .msg-convo-wrapper, " +
    ".comments-comment-item, .comments-comments-list, " +
    ".update-components-text, .feed-shared-text, " +
    "[data-test-id='main-feed-activity-card__commentary']";

  function clean(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function isAdLabel(text) {
    const value = clean(text);
    if (!value || value.length > 80) return false;
    if (labelSet[value.toLowerCase()]) return true;
    return /^promoted by\b/i.test(value);
  }

  function pagePath(root) {
    const doc = root && root.nodeType === 9 ? root : root && root.ownerDocument;
    const view = doc && doc.defaultView;
    const href = view && view.location && view.location.href;
    try {
      return new URL(href).pathname || "";
    } catch (err) {
      return "";
    }
  }

  function blocksFeed(root) {
    return /^\/(search|jobs|messaging)(\/|$)/.test(pagePath(root));
  }

  function inHeader(label, card) {
    if (!label.getBoundingClientRect || !card.getBoundingClientRect) return true;
    const labelBox = label.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    if (!labelBox.height || !cardBox.height) return true;
    if (labelBox.height > 48) return false;
    return labelBox.top - cardBox.top <= 130;
  }

  function hasNewsHeading(el) {
    if (!el || !el.querySelectorAll) return false;
    const headings = el.querySelectorAll("h1, h2, h3");
    for (let i = 0; i < headings.length; i++) {
      if (clean(headings[i].textContent) === "LinkedIn News") return true;
    }
    return false;
  }

  function feedCard(label) {
    if (label.closest("aside")) return null;
    const mainFeed = label.closest("[data-testid='mainFeed'], [data-test-id='mainFeed']");
    if (mainFeed) {
      const item = label.closest("[role='listitem']");
      if (item && mainFeed.contains(item)) return item;
    }
    const listed = label.closest("li.feed-item");
    if (listed) return listed;
    return label.closest("article.main-feed-activity-card");
  }

  function railCard(label) {
    const aside = label.closest("aside");
    if (!aside) return null;
    if (label.closest("#feedRightNavGamesComponentRef")) return null;
    let el = label;
    while (el.parentElement && el.parentElement !== aside && aside.contains(el.parentElement)) {
      const parent = el.parentElement;
      if (parent.id === "feedRightNavGamesComponentRef") return null;
      if (parent.querySelector("#feedRightNavGamesComponentRef")) break;
      if (hasNewsHeading(parent)) break;
      el = parent;
    }
    if (!el || el === aside || el.id === "feedRightNavGamesComponentRef") return null;
    if (hasNewsHeading(el)) return null;
    return el;
  }

  function profileTitle(card) {
    if (!card || !card.querySelectorAll) return "";
    const links = card.querySelectorAll("a[href]");
    for (let i = 0; i < links.length; i++) {
      const href = links[i].getAttribute("href") || "";
      if (!/\/(in|company|showcase)\//.test(href)) continue;
      const text = clean(links[i].textContent);
      if (!text || isAdLabel(text) || text.length > 180) continue;
      return text.slice(0, 180);
    }
    const nodes = card.querySelectorAll("h1, h2, h3, p");
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].closest(".update-components-text, .feed-shared-text, .comments-comment-item")) continue;
      const text = clean(nodes[i].textContent);
      if (!text || isAdLabel(text) || text.length > 180) continue;
      return text.slice(0, 180);
    }
    return "";
  }

  function findUnits(root) {
    const scope = root && root.nodeType === 9 ? root.body : root;
    if (!scope || !scope.querySelectorAll) return [];
    const doc = root.nodeType === 9 ? root : root.ownerDocument;
    const allowFeed = !blocksFeed(doc || root);
    const map = new Map();

    function add(el, category) {
      if (!el || map.has(el)) return;
      if (category === "feed") {
        if (el.closest(SKIP)) return;
        if (!allowFeed) return;
      }
      map.set(el, {
        el: el,
        category: category,
        title: profileTitle(el),
        asin: "",
      });
    }

    scope.querySelectorAll("span, a, p, div, button, label, h2, h3").forEach(function (el) {
      if (el.closest("script, style, noscript, .unsponsored-tag")) return;
      if (!isAdLabel(el.textContent)) return;
      const nested = el.querySelectorAll("span, a, p, div, button, label, h2, h3");
      for (let i = 0; i < nested.length; i++) {
        if (nested[i] !== el && isAdLabel(nested[i].textContent)) return;
      }
      if (el.closest(SKIP)) return;
      const rail = railCard(el);
      if (rail) {
        if (!inHeader(el, rail)) return;
        add(rail, "rail");
        return;
      }
      if (!allowFeed) return;
      const card = feedCard(el);
      if (!card || !inHeader(el, card)) return;
      add(card, "feed");
    });

    if (allowFeed) {
      scope.querySelectorAll("[data-is-sponsored]").forEach(function (el) {
        if (el.closest("aside") || el.closest(SKIP)) return;
        const card = el.closest("li.feed-item, article.main-feed-activity-card, [role='listitem']") || el;
        if (card.closest("aside") || card.closest(SKIP)) return;
        const mainFeed = card.closest("[data-testid='mainFeed'], [data-test-id='mainFeed']");
        const known =
          card.matches("li.feed-item, article.main-feed-activity-card") ||
          (mainFeed && card.getAttribute("role") === "listitem");
        if (!known) return;
        add(card, "feed");
      });
    }

    const list = Array.from(map.values());
    return list.filter(function (unit) {
      return !list.some(function (other) {
        return other !== unit && other.el.contains(unit.el);
      });
    });
  }

  const engine = root.UnsponsoredEngine;
  if (engine && engine.registerFinder) engine.registerFinder("linkedin", findUnits);
})(typeof globalThis !== "undefined" ? globalThis : this);
