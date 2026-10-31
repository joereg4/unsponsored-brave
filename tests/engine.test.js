const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const engine = require("../engine.js");

function unitsFrom(html) {
  const dom = new JSDOM("<!doctype html><body>" + html + "</body>");
  return engine.findUnits(dom.window.document);
}

function counts(html) {
  return engine.countUnits(unitsFrom(html));
}

test("manifest covers every retail host at the apex and www", function () {
  const manifest = require("../manifest.json");
  const matches = manifest.content_scripts[0].matches;
  for (const host of engine.AMAZON_HOSTS) {
    assert.ok(matches.includes("*://" + host + "/*"), host);
    assert.ok(matches.includes("*://www." + host + "/*"), "www." + host);
  }
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), ["activeTab", "storage"]);
});

test("retail hosts cover country sites and skip aws", function () {
  assert.equal(engine.retailHost("www.amazon.co.uk"), "amazon.co.uk");
  assert.equal(engine.retailHost("smile.amazon.de"), "amazon.de");
  assert.equal(engine.retailHost("amazon.com.mx"), "amazon.com.mx");
  assert.equal(engine.retailHost("aws.amazon.com"), null);
  assert.equal(engine.retailHost("advertising.amazon.com"), null);
});

test("sponsored product card is a product, organic Amazon Basics is not", function () {
  const html = `
    <div class="s-main-slot">
      <div class="s-result-item" data-component-type="s-search-result" data-asin="B00ORGAN01">
        <h2>Amazon Basics French Coffee Press</h2>
        <span>$24.99</span>
      </div>
      <div class="s-result-item" data-component-type="s-search-result" data-asin="B00SPONSR1">
        <span class="puis-sponsored-label-text"><span>Sponsored</span></span>
        <h2>Veken 34oz French Press</h2>
      </div>
      <div data-component-type="s-messaging-widget-results-header" class="s-result-item">
        <h2>More results</h2>
      </div>
    </div>`;
  const found = unitsFrom(html);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, "products");
  assert.equal(found[0].asin, "B00SPONSR1");
  assert.match(found[0].title, /Veken/);
});

test("brand video is a banner and a multi-product sponsored row is a carousel", function () {
  const html = `
    <div class="s-result-item s-widget AdHolder" data-asin="" cel_widget_id="MAIN-VIDEO_SINGLE_PRODUCT-17">
      <span data-component-type="sbv-video-single-product" data-video-type="sponsored" class="sbv-video-single-product">
        <span>Sponsored</span>
      </span>
    </div>
    <div class="s-result-item s-widget AdHolder" data-asin="" cel_widget_id="sb-themed-collection-desktop_loom-desktop-top-slot_0">
      <a aria-label="Sponsored ad from Veken. French press coffee makers. Shop Veken.">Veken French press coffee makers</a>
      <div data-asin="B00VEKEN01"></div>
      <div data-asin="B00VEKEN02"></div>
      <div data-asin="B00VEKEN03"></div>
      <span class="puis-sponsored-label-text">Sponsored</span>
    </div>`;
  const found = unitsFrom(html);
  const countsBy = engine.countUnits(found);
  assert.equal(countsBy.banners, 1);
  assert.equal(countsBy.carousels, 1);
  assert.equal(countsBy.products, 0);
});

test("display iframe is a display ad and the tracking pixel is ignored", function () {
  const html = `
    <div id="ape_Detail_desktop-detail-ilm" data-feature-name="desktop-dp-ilm">
      <iframe id="ape_Detail_desktop-detail-ilm_iframe" src="https://aax-us-east.amazon-adsystem.com/x" width="300" height="250"></iframe>
    </div>
    <iframe id="DAsis" src="//s.amazon-adsystem.com/iu3?d=amazon.com&slot=navFooter" width="1" height="1"></iframe>`;
  const found = unitsFrom(html);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, "display");
});

test("house-brand promo is separate from an organic Amazon Basics result", function () {
  const html = `
    <div class="s-result-item s-widget" cel_widget_id="amazon-brands-carousel">
      <h2>Featured from our brands</h2>
      <div class="a-carousel-container">
        <div data-asin="B00BASIC01"></div>
        <div data-asin="B00BASIC02"></div>
      </div>
    </div>
    <div class="s-result-item" data-component-type="s-search-result" data-asin="B00BASIC09">
      <h2>Amazon Basics French Coffee Press</h2>
    </div>`;
  const found = unitsFrom(html);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, "house");
});

test("german sponsored label still counts as a product", function () {
  const html = `
    <div class="s-result-item" data-component-type="s-search-result" data-asin="B00GERMAN1">
      <span class="s-sponsored-label-text">Gesponsert</span>
      <h2>Kaffeepresse</h2>
    </div>`;
  const found = unitsFrom(html);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, "products");
});

test("removed total skips house brand unless that category is on", function () {
  const counts = { products: 2, banners: 0, carousels: 7, display: 1, house: 3 };
  const settings = {
    enabled: true,
    categories: { products: true, banners: true, carousels: true, display: true, house: false },
  };
  assert.equal(engine.removedTotal(counts, settings), 10);
  settings.enabled = false;
  assert.equal(engine.removedTotal(counts, settings), 0);
});

test("mutation-style rescan picks up a card added later", function () {
  const dom = new JSDOM('<!doctype html><div id="slot" class="s-main-slot"></div>');
  const doc = dom.window.document;
  assert.equal(engine.findUnits(doc).length, 0);
  doc.getElementById("slot").insertAdjacentHTML(
    "beforeend",
    '<div class="s-result-item" data-component-type="s-search-result" data-asin="B00NEWITM1"><span class="puis-sponsored-label-text">Sponsored</span><h2>Added later</h2></div>'
  );
  const found = engine.findUnits(doc);
  assert.equal(found.length, 1);
  assert.equal(found[0].asin, "B00NEWITM1");
});

test("local fixture log keeps caught products and drops carousel chrome", function () {
  const fs = require("node:fs");
  const path = require("node:path");
  const fixturePath = path.join(__dirname, "fixtures", "sponsored-results.html");
  const html = fs.readFileSync(fixturePath, "utf8");
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const productUnits = engine.findUnits(doc.getElementById("product"));
  const searchUnits = engine.findUnits(doc.getElementById("search"));
  const productUrl = "https://shop.example/dp/B0YETIEXAMPLE";
  const searchUrl = "https://shop.example/s?k=french+press";
  const now = "2026-10-31T23:26:00.000Z";
  const stale = "2026-10-31T23:21:00.000Z";
  const banned = [
    "Leave feedback on Sponsored ad",
    "Products related to this item",
    "Related products with free delivery",
    "Customers also bought",
    "More from frequently bought brands",
    "Sponsored video…",
    "Sponsored video",
  ];
  const productAsins = ["B0YETI1001", "B0YETI1002", "B0YETI3001", "B0YETI2001", "B0YETI2002", "B0YETI4001"];
  const searchAsins = ["B0F5PJX7GD", "B0DFF4224M", "B0HCZ1QWNH"];
  const chromeTitles = banned.concat([""]);

  function fresh(extra) {
    return Object.assign(
      {
        enabled: true,
        mode: "hidden",
        categories: { products: true, banners: true, carousels: true, display: true, house: false },
        logEnabled: true,
        since: "2026-10-31T00:00:00.000Z",
        lifetime: 0,
        seen: [],
        listings: [],
        pages: [],
      },
      extra || {}
    );
  }

  assert.ok(productUnits.length > productAsins.length);

  let log = fresh({
    lifetime: chromeTitles.length,
    seen: chromeTitles.map(function (title) {
      return [productUrl, "carousels", "", title].join("|");
    }),
    listings: chromeTitles.map(function (title) {
      return {
        loggedAt: stale,
        pageUrl: productUrl,
        pageTitle: "YETI",
        category: "carousels",
        asin: "",
        title: title,
        mode: "hidden",
      };
    }),
    pages: [
      { url: productUrl, title: "YETI", loggedAt: stale, listingCount: 7 },
      { url: searchUrl, title: "French press", loggedAt: stale, listingCount: 4 },
    ],
  });

  log = engine.recordCaught(log, productUnits, {
    pageUrl: productUrl,
    pageTitle: "YETI Rambler",
    now: now,
  }).log;
  log = engine.recordCaught(log, searchUnits, {
    pageUrl: searchUrl,
    pageTitle: "French press",
    now: now,
  }).log;

  const again = engine.recordCaught(log, productUnits, {
    pageUrl: productUrl,
    pageTitle: "YETI Rambler",
    now: now,
  });
  assert.equal(again.changed, false);
  assert.equal(again.log.listings.length, log.listings.length);
  assert.equal(again.log.lifetime, log.lifetime);

  const exported = engine.exportLog(log, "2026-10-31T23:27:25.000Z");
  const csv = engine.listingsCsv(exported.listings);
  const summary = engine.logSummary(log);

  exported.listings.forEach(function (row) {
    assert.notEqual(String(row.title || "").trim(), "");
  });
  banned.forEach(function (title) {
    assert.equal(
      exported.listings.some(function (row) {
        return row.title === title || row.title.indexOf(title) === 0;
      }),
      false,
      title
    );
    assert.equal(csv.includes(title), false, title);
  });

  productAsins.concat(searchAsins).forEach(function (asin) {
    const row = exported.listings.find(function (item) {
      return item.asin === asin;
    });
    assert.ok(row, "missing " + asin);
    assert.equal(row.category, "products");
    assert.match(row.title, /\S/);
    assert.equal(csv.includes(asin), true, asin);
  });
  exported.listings.forEach(function (row) {
    if (/^sponsored ad from /i.test(row.title)) return;
    assert.match(row.asin, /^[A-Z0-9]{10}$/, row.title);
  });

  const carousel = exported.listings.filter(function (row) {
    return /sponsored ad from aarke/i.test(row.title);
  });
  assert.equal(carousel.length, 1);
  assert.equal(
    exported.listings.some(function (row) {
      return row.asin === "B00AARKE01" || row.asin === "B00ORGAN01" || row.asin === "B00HOUSE01";
    }),
    false
  );

  exported.pages.forEach(function (page) {
    const rows = exported.listings.filter(function (row) {
      return row.pageUrl === page.url;
    });
    assert.equal(page.listingCount, rows.length, page.url);
    rows.forEach(function (row) {
      assert.equal(row.loggedAt, page.loggedAt, page.url);
    });
  });

  const productPage = exported.pages.find(function (page) {
    return page.url === productUrl;
  });
  const searchPage = exported.pages.find(function (page) {
    return page.url === searchUrl;
  });
  assert.equal(productPage.listingCount, productAsins.length);
  assert.equal(productPage.loggedAt, now);
  assert.notEqual(productPage.listingCount, 7);
  assert.equal(searchPage.listingCount, searchAsins.length + 1);
  assert.equal(searchPage.loggedAt, now);
  assert.notEqual(searchPage.loggedAt, stale);
  assert.equal(exported.listings.length, productAsins.length + searchAsins.length + 1);
  assert.equal(exported.lifetime, exported.listings.length);
  assert.equal(summary.listings, exported.listings.length);
  assert.equal(summary.pages, exported.pages.length);

  let off = fresh({ logEnabled: false });
  off = engine.recordCaught(off, productUnits, {
    pageUrl: productUrl,
    pageTitle: "YETI Rambler",
    now: now,
  }).log;
  off = engine.recordCaught(off, searchUnits, {
    pageUrl: searchUrl,
    pageTitle: "French press",
    now: now,
  }).log;
  assert.equal(off.listings.length, 0);
  assert.equal(off.lifetime, productAsins.length + searchAsins.length + 1);
  off.logEnabled = true;
  let on = engine.recordCaught(off, productUnits, {
    pageUrl: productUrl,
    pageTitle: "YETI Rambler",
    now: now,
  }).log;
  on = engine.recordCaught(on, searchUnits, {
    pageUrl: searchUrl,
    pageTitle: "French press",
    now: now,
  }).log;
  const repaired = engine.exportLog(on, "2026-10-31T23:27:25.000Z");
  assert.equal(repaired.lifetime, repaired.listings.length);
  productAsins.concat(searchAsins).forEach(function (asin) {
    assert.ok(
      repaired.listings.some(function (row) {
        return row.asin === asin;
      }),
      "missing " + asin
    );
  });
  banned.forEach(function (title) {
    assert.equal(
      repaired.listings.some(function (row) {
        return row.title.indexOf(title) === 0;
      }),
      false,
      title
    );
  });
  repaired.pages.forEach(function (page) {
    const rows = repaired.listings.filter(function (row) {
      return row.pageUrl === page.url;
    });
    assert.equal(page.listingCount, rows.length, page.url);
  });
});

test("product page sponsored carousel is not the main buy box", function () {
  const html = `
    <div id="ppd">
      <div id="centerCol"><h1>Organic kettle</h1></div>
    </div>
    <div id="sponsoredProducts2_feature_div" data-feature-name="sponsoredProducts2">
      <span class="sp_desktop_sponsored_label">Sponsored</span>
      <div class="a-carousel-container">
        <div data-asin="B00CAROUS1"></div>
        <div data-asin="B00CAROUS2"></div>
      </div>
    </div>`;
  const found = unitsFrom(html);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, "carousels");
  assert.equal(found[0].el.id, "sponsoredProducts2_feature_div");
});
