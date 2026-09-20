# Testing this extension

## History: why the original code couldn't be loaded at all

The extension was rewritten from Manifest V2 to V3 (background page →
service worker, `browser_action` → `action`, html2canvas/lodash dependencies
dropped for a live DOM-clone renderer). Confirmed via "Load unpacked" in
Chrome 153.x that the old MV2 manifest was a hard rejection at parse time
("Cannot install extension because it uses an unsupported manifest
version") — not a policy or sideloading issue. Keep the manifest at
`"manifest_version": 3` going forward.

## Non-interactive loading is restricted — plan for one manual step

Modern Chrome does not honor `--load-extension` on the command line
silently, even with Developer Mode already enabled in the profile's
`Preferences` — confirmed by testing a bare-bones MV3 control extension the
same way; it also failed to register. This is deliberate anti-malware
hardening (silent CLI sideloading used to be an attack vector), unrelated to
manifest version.

So the extension has to be loaded once through the real UI, via the native
OS file picker, which can't be scripted from inside the page. Once loaded,
it persists in that profile's `Preferences`/`Extensions` state — later
launches against the same `--user-data-dir` load it automatically, no repeat
manual step needed.

## 1. Use a scratch profile, never the real Chrome profile

Never load this into the user's everyday Chrome profile. Always use a
throwaway `--user-data-dir` so a broken/dev extension can't affect real
browsing, and so it can be wiped and redone freely.

```bash
SCRATCH=/tmp/claude-.../scratchpad   # use your session's scratchpad dir
mkdir -p "$SCRATCH/chrome-test-profile"
```

## 2. Launch Chrome with remote debugging enabled

```bash
setsid nohup google-chrome \
  --user-data-dir="$SCRATCH/chrome-test-profile" \
  --remote-debugging-port=9333 \
  --no-first-run --no-default-browser-check \
  "chrome://extensions/" \
  > "$SCRATCH/chrome.log" 2>&1 < /dev/null &
disown
```

Do not `pkill -f` on a string that also appears in your own launch command
(e.g. `remote-debugging-port=9333`) — it will match and kill the command
before Chrome starts. Match on `user-data-dir=$SCRATCH/...` instead, which is
unique to the running process.

## 3. First run only: load the extension manually

1. In the Chrome window that opens (it's on the real display, `DISPLAY=:0` /
   `WAYLAND_DISPLAY=wayland-1`), turn on "Developer mode" (top right) if not
   already on.
2. Click "Load unpacked".
3. In the native file picker, navigate to this repo's directory
   (`/home/brian/dev/Chrome-minimap`) and select it.

Ask the user to do this step if you're an agent without OS-level input
access — it's a one-time ~10 second action. After an edit to the source,
either click the reload icon on the extension's card in `chrome://extensions`
or navigate that tab there and reload via the DOM (see below) — no need to
repeat the file picker.

## 4. Drive everything else over the DevTools Protocol (CDP)

No `python3`/`node` are on `PATH` in this environment, but `nix-shell` can
pull in Python + `websockets` on demand (fast, already cached):

```bash
nix-shell -p "python3.withPackages(ps: [ps.websockets])" --run "python3 script.py"
```

Useful CDP recipes (see `/json` on the debug port for tab list and
`webSocketDebuggerUrl`s):

- **List tabs / find the extension's service worker:**
  `curl -s http://localhost:9333/json` — look for `type: "service_worker"`
  with a `chrome-extension://` URL.
- **Check whether the extension is registered / reload it after an edit:**
  navigate a tab to `chrome://extensions/` and walk the DOM (it uses shadow
  DOM — `<extensions-item>` elements — so query recursively through
  `.shadowRoot`, not a plain `querySelector`); the reload button inside each
  item's shadow root can be clicked the same way `#loadUnpacked` was clicked
  during setup.
- **Read console output / exceptions from the content script:** `Runtime.enable`
  + `Log.enable` on the test page's target, then reload (`Page.reload`) and
  collect `Runtime.consoleAPICalled` / `Runtime.exceptionThrown` /
  `Log.entryAdded` events.
- **Inspect the injected DOM:** `Runtime.evaluate` with `returnByValue: true`,
  e.g. check `document.getElementById('minimap-extension-root')` and
  `#minimap-extension-panel`/`#minimap-extension-viewport` inside it.
- **Screenshot:** `Page.captureScreenshot` (returns base64 PNG), decode and
  write to a file, then view it with the `Read` tool.

A minimal reusable test page (tall enough to scroll) can be generated with a
loop appending `<p>` tags; regenerate as needed in the scratchpad rather than
committing one to the repo.

## 5. Cleanup

```bash
pkill -f "user-data-dir=$SCRATCH/chrome-test-profile"
```

## MV3 service workers go idle — you'll need it awake for zoom testing

Chrome kills the service worker after ~30s of inactivity; it's absent from
`/json` when idle. Content-script code (toggle, geometry, rendering) doesn't
need it. Only zoom testing does, since `chrome.tabs.getZoom`/`setZoom` are
service-worker-only APIs. Cheapest way to wake it: `Page.reload` the test
tab — the content script's own startup `minimap:getZoom` request wakes the
worker as a side effect. Do this immediately before the zoom-dependent steps
in the same script run; it'll go idle again within ~30s if you pause to debug
between calls.

## Reloading the extension does NOT update already-open tabs

`chrome://extensions`'s reload button (or `reload_ext.py`-style automation)
reloads the extension's own code (service worker, manifest) but does
**not** retroactively touch content scripts already injected into open
tabs — those keep running whatever version they were injected with,
indefinitely, until that tab itself navigates or reloads. Root-caused a very
confusing debugging session: clicking a panel appeared to do nothing, with
no console output at all, because the tab under test was still running code
from several edits ago.

**Always reload the page (`Page.reload` or `Page.navigate`) immediately
after reloading the extension, in the same script, before testing anything.**
A `getEventListeners(panel)` check from the main world reporting zero
listeners is not reliable evidence either way — it can't see listeners
registered from the content script's isolated world.

## `behavior: 'smooth'` on `window.scrollTo` silently no-ops here

Observed in this environment: `window.scrollTo({top, behavior: 'smooth'})`
called from the content script (including from a real, non-synthetic-looking
click handler) never moved `scrollY` — not even after several seconds —
while `behavior: 'auto'` (instant) worked immediately and reliably. Root
cause unconfirmed (possibly this Chrome build/environment's animation
policy), but not worth chasing further: `minimap.js` now always scrolls
with `behavior: 'auto'`, which is also the more correct choice on the
merits — it matches how VSCode/Sublime's minimap jumps (instant, not
animated). If smooth scrolling is ever wanted back, verify it actually
moves `scrollY` over multiple reads before trusting it.

## `chrome.commands` / `suggested_key` doesn't reliably auto-bind on unpacked dev extensions

`manifest.json` declares `commands._execute_action` with a `suggested_key`
of Ctrl+Shift+M. In practice, across a normal reload-heavy dev loop, this
showed as **"Not set"** on `chrome://extensions/shortcuts` — Chrome seems to
only apply `suggested_key` on a genuinely fresh install, not on every
extension reload. Tried setting it by dispatching synthetic key events at
the shortcuts page's recorder `<input>` via CDP `Input.dispatchKeyEvent`;
that didn't take either (same class of restriction as the native file
picker — a `chrome://` WebUI recorder for a security-relevant setting isn't
something CDP-simulated input can drive).

Given that, don't rely on `chrome.commands` alone. `minimap.js` also
registers its own `document.addEventListener('keydown', ...)` matching
Ctrl/Cmd+Shift+M directly and toggles the same way the message-based path
does — this works regardless of whether Chrome ever binds the manifest
shortcut, and it's what's actually exercised in practice.

## Testing keyboard input over CDP needs the tab focused first

`Input.dispatchKeyEvent` on a tab that isn't the focused/active one is
silently swallowed — a `keydown` listener installed for debugging will show
zero events, easy to misread as "the listener isn't registered." Call
`Target.activateTarget` (on the *browser*-level websocket, from
`/json/version`'s `webSocketDebuggerUrl`) and/or `Page.bringToFront` on the
target tab immediately before dispatching key events.

## What to check when testing

- **Toggle**: click the toolbar icon, press Ctrl+Shift+M (see above — this
  is handled by a content-script `keydown` listener, not by
  `chrome.commands` actually being bound), or from the *service worker's*
  CDP target — not the page's — call
  `chrome.tabs.sendMessage(tabId, {type:'minimap:toggle'})`, since
  `chrome.tabs`/`chrome.runtime.sendMessage`-to-a-tab aren't available from a
  plain page's JS context. Confirm `#minimap-extension-root` gains/loses the
  `show` class.
- **Geometry**: panel width is fixed at 110px and always exactly matches the
  canvas's width (no horizontal padding — the panel and the map are the same
  width by design). Panel height is capped at `window.innerHeight * 0.35`
  minus vertical padding; verify `panel.getBoundingClientRect().height`
  against that on a tall page.
- **Drag 1:1 tracking**: on a page tall enough that the map is panning
  internally (`maxOffset > 0` — most real long pages under the 35% cap),
  drag the indicator via `pointerdown`/`pointermove` in fixed screen-px
  increments and confirm `viewportIndicator.getBoundingClientRect().top`
  moves by exactly that many px each step. A naive `mouseDelta / scale`
  conversion looks right but under-moves the indicator once panning starts
  (verified: on an 80,000px-tall page it was moving at a visibly reduced
  fraction of the cursor's actual travel) — the fix divides by
  `scale - maxOffset / maxScroll` instead, derived from how much of a given
  scroll delta actually reaches the indicator's on-screen position once
  panning is absorbing part of it.
- **Hide when not scrollable**: on a page where
  `document.documentElement.scrollHeight <= window.innerHeight`, confirm
  `#minimap-extension-root` never gets the `show` class at all.
- **Rendering**: `#minimap-extension-stage` is a `<canvas>` now (not a DOM
  clone) — you can't inspect drawn content via the DOM; use
  `Page.captureScreenshot` to verify it visually. Expect bright bars for
  headings, short skeleton-style line bars for text, solid blocks for
  media, accent bars for form controls.
- Scrolling the real page updates `#minimap-extension-viewport`'s
  `top`/`height`; dragging it scrolls the real page; clicking elsewhere in
  the panel jump-scrolls.
- On a page much taller than the window, confirm the panel caps its own
  height and the canvas content pans (`stageOffset` in `minimap.js`) as you
  scroll or drag — this was a real regression once already (drag updated the
  page's scroll but not the panel's internal offset; fixed by removing a
  stale `if (dragging) return` guard on the scroll listener).
- **Zoom**: from the service worker, `chrome.tabs.setZoom(tabId, 1.5)`, then
  check `#minimap-extension-root`'s inline `transform` became
  `scale(0.666...)` (i.e. `1/zoomFactor`) and that `window.devicePixelRatio`
  changed by the same factor — confirms the panel's physical on-screen size
  stayed constant. Reset with `setZoom(tabId, 1.0)`.
- Resize the window and mutate the DOM (e.g. `document.body.appendChild(...)`
  via `Runtime.evaluate`) and confirm the minimap re-renders within ~400ms.
- Check for JS errors in the console on each test page after a reload.
