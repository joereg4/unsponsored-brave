# Unsponsored

A Manifest V3 extension that hides, dims, or outlines sponsored listings on Amazon and LinkedIn. It is an independent rebuild of the popup Jason Calacanis showed on October 31, 2026. He did not publish source. This folder is not his extension and it is not a fork of anyone else’s repo.

Nothing here phones home. Settings, counts, and the optional research log stay in `chrome.storage.local` on this browser. There is no analytics call and no remote code.

The prompt from the original post is not used.

## Install in Brave

This is not in the Chrome Web Store or any Brave store. Load it unpacked:

1. Unzip `unsponsored-brave.zip` if you are not already inside this folder. You need the directory that contains `manifest.json`.
2. Open `brave://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select this folder (`unsponsored-brave`), the one that contains `manifest.json`. Do not select the zip file itself.
6. Pin **Unsponsored** from the puzzle-piece menu if you want the button in the toolbar.
7. Refresh any Amazon tab that was already open. A content script does not attach to a tab until that tab loads again.

The same steps work in Chrome at `chrome://extensions`. Brave is Chromium, so this Manifest V3 package loads there the same way.

### Brave Shields

Brave Shields block a lot of third-party ads and trackers. Amazon sponsored products, brand videos, and sponsored carousels are part of Amazon’s own page, so Shields leave them on the page. Unsponsored filters that HTML after it renders.

If a search page never finishes loading or infinite scroll stalls, Shields may be set to an aggressive script-blocking mode for Amazon. Standard Shields plus this extension is the combination that still lets Amazon draw results and then strips the sponsored ones.

One reply on the original post said Brave already does this automatically. It does not, for these first-party placements.

## What it does

On Amazon search and product pages, including the country sites (`amazon.com`, `amazon.co.uk`, `amazon.de`, `amazon.co.jp`, and the other retail hosts listed in `manifest.json`):

- **Sponsored products** — individual sponsored result cards. On by default.
- **Brand banners and video** — Sponsored Brands video and banner units. On by default.
- **Sponsored carousels** — multi-product sponsored rows, such as a brand’s French-press carousel. On by default.
- **Display ads** — display placements and ad iframes. The 1×1 tracking pixel in the footer is ignored. On by default.
- **Amazon house-brand promos** — promotional modules headed Amazon Basics, Amazon Essentials, “our brands,” and similar. Off by default. An ordinary search result whose title is an Amazon Basics product is left alone.

On LinkedIn (`linkedin.com`), the popup switches to two rows:

- **Promoted posts** — feed cards labeled Promoted, Sponsored, or the same label in another language. On by default.
- **Right-rail ads** — promoted cards in the right column. On by default.

Job results, messages, search hits, LinkedIn News, and the puzzles block stay on the page. The card is hidden with CSS and left in the DOM.

A master switch turns filtering on (**Hiding**) or off (**Off**). Counts update as the page changes. The switch and the hide, dim, and outline choice apply to both sites. Category checkboxes are separate: Amazon rows do not change what LinkedIn removes.

**Removed listings are**

- **Hidden** — taken out of the layout. This is the default.
- **Dimmed** — left in place, grayscale and washed out. Hover or keyboard focus restores them. Organic results stay full color.
- **Outlined** — left in place with a red dashed border and a small red **Sponsored** tag.

**Outline removed listings for 5 seconds** puts a solid red outline on the units the extension is currently acting on, including ones that were hidden, so you can see what it caught.

A `MutationObserver` watches the page, with a slow rescan as backup, so infinite scroll and late carousels get filtered too. Amazon and LinkedIn change this markup often; a layout experiment can slip past until the selectors are updated.

## Research log

**Keep a research log** is off until you turn it on. When it is on, each row is one sponsored product or one ad unit, stored only in this browser. A product row keeps that card’s ASIN and product title. A LinkedIn row keeps the author or advertiser name and leaves the ASIN blank. Feedback controls, carousel headings such as “Customers also bought”, and blank titles are not rows. A page’s listing count is the number of rows stored for that page. The footer count (“N sponsored listings caught since …”) counts those same units. **Clear log** deletes the exportable rows and asks first. It does not reset that running total.

Exports: listings CSV, pages CSV, and JSON. Nothing is uploaded.

## Not included

This does not hide knockoff or no-name brands. That is a different product (the “deslopped Amazon” / Knockoff extension mentioned under the original post).

## Tests

From this folder, with [jsdom](https://github.com/jsdom/jsdom) installed:

```bash
npm install jsdom
node --test tests/engine.test.js tests/linkedin.test.js
```

The Amazon checks cover sponsored cards versus organic Amazon Basics results, brand video, sponsored carousels, display iframes versus the footer tracking pixel, house-brand modules, a German “Gesponsert” label, and a card inserted after the first scan. `tests/fixtures/sponsored-results.html` is a local page. The log check fails if a caught product is missing from the JSON or listings CSV, or if a feedback control, carousel heading, or blank title is stored. The LinkedIn checks cover a promoted feed post versus an organic post, a comment that only says Sponsored, a right-rail ad versus LinkedIn News and the puzzles block, a promoted job card, a search hit, a sponsored article flag, and a log row with a blank ASIN. They do not open Brave, amazon.com, or linkedin.com.
