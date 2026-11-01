const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const engine = require("../engine.js");
require("../linkedin.js");

function unitsFrom(html, url) {
  const dom = new JSDOM("<!doctype html><body>" + html + "</body>", {
    url: url || "https://www.linkedin.com/feed/",
  });
  return engine.findUnits(dom.window.document, "linkedin");
}

test("linkedin host is its own site and amazon hosts stay amazon", function () {
  assert.equal(engine.siteFor("www.linkedin.com"), "linkedin");
  assert.equal(engine.siteFor("linkedin.com"), "linkedin");
  assert.equal(engine.pageHost("www.linkedin.com"), "linkedin.com");
  assert.equal(engine.siteFor("news.linkedin.com"), null);
  assert.equal(engine.siteFor("www.amazon.co.uk"), "amazon");
  assert.equal(engine.pageHost("smile.amazon.de"), "amazon.de");
  assert.equal(engine.siteFor("aws.amazon.com"), null);
});

test("manifest runs on linkedin.com and www.linkedin.com", function () {
  const manifest = require("../manifest.json");
  const script = manifest.content_scripts[0];
  assert.ok(script.matches.includes("*://linkedin.com/*"));
  assert.ok(script.matches.includes("*://www.linkedin.com/*"));
  assert.deepEqual(script.js.slice(0, 3), ["engine.js", "linkedin.js", "content.js"]);
});

test("promoted feed post is a feed unit and an organic post is not", function () {
  const html = `
    <div data-testid="mainFeed" role="list">
      <div role="listitem">
        <a href="/in/ada">Ada Lovelace</a>
        <span>Promoted</span>
        <p class="update-components-text">Buy widgets today</p>
      </div>
      <div role="listitem">
        <a href="/in/alan">Alan Turing</a>
        <span>3rd+</span>
        <p class="update-components-text">I got promoted last year</p>
      </div>
    </div>`;
  const found = unitsFrom(html);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, "feed");
  assert.equal(found[0].title, "Ada Lovelace");
  assert.equal(found[0].asin, "");
});

test("a comment that only says Sponsored is not a unit", function () {
  const html = `
    <div data-testid="mainFeed" role="list">
      <div role="listitem">
        <a href="/in/alan">Alan Turing</a>
        <span>3rd+</span>
        <div class="comments-comment-item"><span>Sponsored</span></div>
      </div>
    </div>`;
  assert.equal(unitsFrom(html).length, 0);
});

test("right-rail ad is a rail unit and news and puzzles stay", function () {
  const html = `
    <aside>
      <div id="feedRightNavGamesComponentRef"><span>Promoted</span>Today's puzzles</div>
      <section>
        <h2>LinkedIn News</h2>
        <a href="/news/story">A real story</a>
      </section>
      <div class="rail-ad">
        <span>Promoted</span>
        <a href="/company/acme">Acme Payroll</a>
      </div>
    </aside>`;
  const found = unitsFrom(html);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, "rail");
  assert.equal(found[0].title, "Acme Payroll");
  assert.equal(found[0].el.className, "rail-ad");
});

test("promoted job card is not a unit", function () {
  const html = `
    <div data-testid="mainFeed" role="list">
      <div role="listitem" data-job-id="99">
        <span>Promoted</span>
        <a href="/jobs/view/99">Engineer</a>
      </div>
    </div>`;
  assert.equal(unitsFrom(html, "https://www.linkedin.com/feed/").length, 0);
});

test("search hits stay up and a rail ad on that page is still a rail unit", function () {
  const html = `
    <div data-testid="mainFeed" role="list">
      <div role="listitem">
        <a href="/in/ada">Ada Lovelace</a>
        <span>Promoted</span>
      </div>
    </div>
    <aside>
      <div class="rail-ad">
        <span>Promoted</span>
        <a href="/company/acme">Acme Payroll</a>
      </div>
    </aside>`;
  const found = unitsFrom(html, "https://www.linkedin.com/search/results/content/");
  assert.equal(found.length, 1);
  assert.equal(found[0].category, "rail");
});

test("sponsored article flag counts as a feed post", function () {
  const html = `
    <div data-testid="mainFeed" role="list">
      <article class="main-feed-activity-card" data-is-sponsored="true">
        <a href="/in/grace">Grace Hopper</a>
        <p>Compilers for everyone</p>
      </article>
    </div>`;
  const found = unitsFrom(html);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, "feed");
  assert.equal(found[0].title, "Grace Hopper");
});

test("Promoted by prefix and a German label still count", function () {
  const html = `
    <div data-testid="mainFeed" role="list">
      <div role="listitem">
        <span>Promoted by Initech</span>
        <a href="/company/initech">Initech</a>
      </div>
      <div role="listitem">
        <span>Gesponsert</span>
        <a href="/in/ada">Ada Lovelace</a>
      </div>
    </div>`;
  const found = unitsFrom(html);
  assert.equal(found.length, 2);
  assert.equal(found[0].category, "feed");
  assert.equal(found[0].title, "Initech");
  assert.equal(found[1].title, "Ada Lovelace");
});

test("linkedin log row keeps the author and leaves asin empty", function () {
  const html = `
    <div data-testid="mainFeed" role="list">
      <div role="listitem">
        <a href="/in/ada">Ada Lovelace</a>
        <span>Promoted</span>
        <p class="update-components-text">Buy widgets today</p>
      </div>
    </div>`;
  const units = unitsFrom(html);
  const result = engine.recordCaught(
    {
      enabled: true,
      mode: "hidden",
      categories: { feed: true, rail: true },
      logEnabled: true,
      lifetime: 0,
      seen: [],
      listings: [],
      pages: [],
    },
    units,
    {
      pageUrl: "https://www.linkedin.com/feed/",
      pageTitle: "Feed",
      now: "2026-10-31T23:26:00.000Z",
    }
  );
  assert.equal(result.log.listings.length, 1);
  assert.equal(result.log.listings[0].title, "Ada Lovelace");
  assert.equal(result.log.listings[0].asin, "");
  assert.equal(result.log.listings[0].category, "feed");
  const counts = engine.countUnits(units);
  assert.equal(counts.feed, 1);
  assert.equal(counts.rail, 0);
  assert.equal(engine.removedTotal(counts, { enabled: true, categories: { feed: true, rail: false } }), 1);
});
