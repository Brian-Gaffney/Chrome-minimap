# Minimap

A Chrome extension that shows a schematic "skeleton" map of the current page
in the corner of the window, with a draggable viewport indicator — not a
literal miniature screenshot, an indicative one, closer to a code minimap or
a content-loading skeleton than a photo of the page.

Click the toolbar icon, or press **Alt+Shift+M** (same on Mac), to toggle
it. (Originally Ctrl+Shift+M — changed because that's Chrome's own built-in
"Switch profile" shortcut and collided with it at the browser level, no
matter what the extension did.) The hotkey is handled directly by a
`keydown` listener in `minimap.js`, not `chrome.commands`/manifest
`suggested_key` — that only auto-binds on a genuinely fresh install and was
unreliable across the reload-heavy dev loop (showed as "Not set" in
`chrome://extensions/shortcuts` despite being declared, and couldn't be set
by automation either — same class of restriction as the native file
picker). The manifest entry is still there so it's rebindable from that
page, but nothing depends on it actually being bound.

It only appears on pages that actually scroll, and it's capped at 35% of the
window's height — like VSCode/Sublime, once the page is taller than that,
the map pans internally (tracked by `stageOffset` in `minimap.js`) to keep
the current viewport in view, rather than trying to show the whole page at
once. Dragging the indicator tracks the cursor 1:1 in screen space even
while panning — see the comment above the drag math in `minimap.js` if
touching it; the naive `mouseDelta / scale` conversion looks right but
under-moves the indicator once panning starts absorbing part of the scroll
delta. The drag input is also clamped to the panel's own bounds (like a
native scrollbar thumb) — without that, on pages long enough that panning
dominates, the indicator-tracking math amplifies mouse movement so heavily
that letting the cursor drift outside the panel caused runaway scroll and a
large dead zone when trying to correct it.

## How it works

The content script walks the DOM for structurally significant elements
(headings, paragraphs/list items/table cells, images/video/canvas/svg, form
controls), reads each one's real position/size via `getBoundingClientRect`,
and paints flat shapes for them on a single `<canvas>`:

- headings → a bold light bar
- text-bearing elements → a few short skeleton-style line bars
- media (`img`, `video`, `canvas`, `svg`, ...) → a solid colored block
- controls (`button`, `input`, `select`, `textarea`) → an accent bar

No screenshotting, no cloning real content — just geometry in, flat shapes
out. That keeps it cheap even on huge pages (capped at 800 blocks) and avoids
the fidelity/isolation headaches of rendering real page content in miniature
(inherited CSS, resource loading, tainted canvases, etc.).

Re-renders on DOM mutation (debounced) and resize. The viewport indicator and
the minimap's own internal scroll position update on every real scroll event
and during a drag.

The panel counter-scales against the page's browser zoom level (relayed from
`background.js` via `chrome.tabs.getZoom`/`onZoomChange`, since only the
service worker can read it) so it stays a constant on-screen size regardless
of zoom.

## Status

All the original TODOs are implemented: toggle on icon click, click-and-drag
the viewport indicator, click elsewhere on the minimap to jump-scroll, the
minimap re-renders on DOM changes, and it scrolls internally when the page is
taller than the available panel height.

See `AGENTS.md` for how to load and test this locally.

Styling is a dark, blue-tinted panel with a visible border (`style.css`) and
matching block colors in `minimap.js`'s `COLORS` — chosen by rendering 5
palette options side by side in the test browser and picking one; an
earlier, much more transparent/grey version turned out too subtle to read
against arbitrary page backgrounds. Small vertical inner padding; the map's
width always exactly matches the panel's outer width (no horizontal
padding, so there's no gap between the panel edge and the map content).

Clicking/dragging jumps instantly (`behavior: 'auto'`), not animated —
matches how editor minimaps behave, and sidesteps an environment where
`window.scrollTo({behavior: 'smooth'})` triggered from a content script was
observed to silently no-op (see AGENTS.md).

## Known limitations

- Classification is tag-based and simple (e.g. a `<div>` full of text won't
  be detected as a text block unless it matches the selector list in
  `minimap.js`). Good enough for an "indicative" map, not exhaustive.
- Only the first 800 matched elements are drawn on extremely large pages.
