const engine = globalThis.UnsponsoredEngine;

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
  listings: [],
  pages: [],
};

const enabledInput = document.querySelector("#enabled");
const stateLabel = document.querySelector("#stateLabel");
const hostEl = document.querySelector("#host");
const removedEl = document.querySelector("#removed");
const sinceEl = document.querySelector("#since");
const logInput = document.querySelector("#logEnabled");
const logCopy = document.querySelector("#logCopy");
const noteEl = document.querySelector("#note");
const catInputs = Array.from(document.querySelectorAll("[data-cat]"));
const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));

let settings = {
  enabled: DEFAULTS.enabled,
  mode: DEFAULTS.mode,
  categories: Object.assign({}, DEFAULTS.categories),
  logEnabled: DEFAULTS.logEnabled,
  since: new Date().toISOString(),
  lifetime: 0,
  listings: [],
  pages: [],
};
let tabId = null;
let pageStatus = { counts: emptyCounts(), removed: 0 };

function emptyCounts() {
  return { products: 0, banners: 0, carousels: 0, display: 0, house: 0 };
}

function formatSince(iso) {
  const date = iso ? new Date(iso) : new Date();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function plural(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}

function download(filename, text, type) {
  const blob = new Blob([text], { type: type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1500);
}

function render() {
  if (!settings) return;
  enabledInput.checked = !!settings.enabled;
  stateLabel.textContent = settings.enabled ? "Hiding" : "Off";
  logInput.checked = !!settings.logEnabled;
  catInputs.forEach(function (input) {
    input.checked = !!settings.categories[input.dataset.cat];
  });
  modeButtons.forEach(function (button) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === settings.mode));
  });
  engine.CATEGORIES.forEach(function (key) {
    const node = document.querySelector('[data-count="' + key + '"]');
    if (node) node.textContent = String(pageStatus.counts[key] || 0);
  });
  removedEl.textContent = String(pageStatus.removed || 0);
  const caught = settings.lifetime || 0;
  sinceEl.textContent =
    plural(caught, "sponsored listing") + " caught since " + formatSince(settings.since);
  const summary = engine.logSummary(settings);
  logCopy.textContent =
    plural(summary.listings, "listing") +
    " and " +
    plural(summary.pages, "page") +
    " logged. Stored only in this browser.";
}

function save(patch) {
  settings = Object.assign({}, settings, patch);
  if (patch.categories) settings.categories = patch.categories;
  chrome.storage.local.set(patch, render);
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

function hostFromUrl(url) {
  try {
    return engine.retailHost(new URL(url).hostname);
  } catch (err) {
    return null;
  }
}

async function refreshPage() {
  const tab = await activeTab();
  tabId = tab && tab.id;
  const host = tab && hostFromUrl(tab.url);
  hostEl.textContent = host || "Not on Amazon";
  if (!host || tabId == null) {
    pageStatus = { counts: emptyCounts(), removed: 0 };
    noteEl.hidden = !tab || !tab.url || !/^https?:/i.test(tab.url);
    noteEl.textContent = host ? "" : "Open an Amazon search or product page.";
    render();
    return;
  }
  noteEl.hidden = true;
  try {
    const status = await chrome.tabs.sendMessage(tabId, { type: "unsponsored:getStatus" });
    if (status && status.counts) {
      pageStatus = status;
    }
  } catch (err) {
    pageStatus = { counts: emptyCounts(), removed: 0 };
    noteEl.hidden = false;
    noteEl.textContent = "Refresh this Amazon tab so Unsponsored can attach.";
  }
  render();
}

document.querySelector("#enabled").addEventListener("change", function () {
  save({ enabled: enabledInput.checked });
});

logInput.addEventListener("change", function () {
  save({ logEnabled: logInput.checked });
});

catInputs.forEach(function (input) {
  input.addEventListener("change", function () {
    const categories = Object.assign({}, settings.categories);
    categories[input.dataset.cat] = input.checked;
    save({ categories: categories });
  });
});

modeButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    save({ mode: button.dataset.mode });
  });
});

document.querySelector("#flash").addEventListener("click", async function () {
  if (tabId == null) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "unsponsored:flash" });
  } catch (err) {
    noteEl.hidden = false;
    noteEl.textContent = "Refresh this Amazon tab, then try the outline again.";
  }
});

document.querySelector("#csvListings").addEventListener("click", function () {
  download("unsponsored-listings.csv", engine.listingsCsv(settings.listings), "text/csv");
});

document.querySelector("#csvPages").addEventListener("click", function () {
  download("unsponsored-pages.csv", engine.pagesCsv(settings), "text/csv");
});

document.querySelector("#exportJson").addEventListener("click", function () {
  const payload = engine.exportLog(settings, new Date().toISOString());
  download("unsponsored-log.json", JSON.stringify(payload, null, 2), "application/json");
});

document.querySelector("#clearLog").addEventListener("click", function () {
  const listings = (settings.listings || []).length;
  const pages = (settings.pages || []).length;
  if (!listings && !pages) return;
  if (!window.confirm("Clear the research log stored in this browser?")) return;
  save({ listings: [], pages: [] });
});

if (!globalThis.chrome || !chrome.storage || !chrome.runtime || !chrome.tabs) {
  render();
} else {
chrome.runtime.onMessage.addListener(function (message) {
  if (!message || message.type !== "unsponsored:status") return;
  pageStatus = message;
  if (message.host) hostEl.textContent = message.host;
  render();
});

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== "local" || !settings) return;
  Object.keys(changes).forEach(function (key) {
    settings[key] = changes[key].newValue;
  });
  if (settings.categories) {
    settings.categories = Object.assign({}, DEFAULTS.categories, settings.categories);
  }
  render();
  refreshPage();
});

chrome.storage.local.get(null, function (stored) {
  const data = stored || {};
  settings = {
    enabled: data.enabled !== undefined ? data.enabled : DEFAULTS.enabled,
    mode: data.mode || DEFAULTS.mode,
    categories: Object.assign({}, DEFAULTS.categories, data.categories),
    logEnabled: !!data.logEnabled,
    since: data.since || new Date().toISOString(),
    lifetime: data.lifetime || 0,
    listings: data.listings || [],
    pages: data.pages || [],
  };
  const patch = {};
  if (data.since == null) patch.since = settings.since;
  if (data.mode == null) patch.mode = settings.mode;
  if (data.enabled == null) patch.enabled = settings.enabled;
  if (data.categories == null) patch.categories = settings.categories;
  if (data.logEnabled == null) patch.logEnabled = settings.logEnabled;
  if (Object.keys(patch).length) chrome.storage.local.set(patch);
  render();
  refreshPage();
});
}
