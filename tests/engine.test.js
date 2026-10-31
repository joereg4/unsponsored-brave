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
