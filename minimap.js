(() => {
  if (window.__minimapExtensionInjected || !document.body) return;
  window.__minimapExtensionInjected = true;

  const PANEL_WIDTH = 110;
  const PANEL_PADDING_Y = 4;
  const MAX_HEIGHT_RATIO = 0.35;
  const MAX_BLOCKS = 800;
  const BLOCK_SELECTOR =
    'h1,h2,h3,h4,h5,h6,p,li,blockquote,dt,dd,td,th,figcaption,' +
    'img,picture,video,canvas,svg,button,input,select,textarea';

  const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  const MEDIA_TAGS = new Set(['IMG', 'PICTURE', 'VIDEO', 'CANVAS', 'SVG']);
  const CONTROL_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);

  const COLORS = {
    heading: 'rgba(235, 240, 250, 0.7)',
    text: 'rgba(200, 208, 220, 0.4)',
    media: 'rgba(90, 140, 230, 0.7)',
    control: 'rgba(230, 170, 90, 0.55)',
  };

  const root = document.createElement('div');
  root.id = 'minimap-extension-root';

  const panel = document.createElement('div');
  panel.id = 'minimap-extension-panel';

  const canvas = document.createElement('canvas');
  canvas.id = 'minimap-extension-stage';
  const ctx = canvas.getContext('2d');

  const viewportIndicator = document.createElement('div');
  viewportIndicator.id = 'minimap-extension-viewport';

  panel.appendChild(canvas);
  panel.appendChild(viewportIndicator);
  root.appendChild(panel);
  document.documentElement.appendChild(root);

  let scale = 1;
  let pageHeight = 0;
  let contentWidth = 0;
  let contentHeight = 0;
  let stageOffset = 0;
  let dragging = false;
  let blocks = [];
  let visible = true;
  let scrollable = false;

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function applyVisibility() {
    const shown = visible && scrollable;
    root.classList.toggle('show', shown);
    chrome.runtime.sendMessage({ type: 'minimap:state', shown }).catch(() => {});
  }

  function applyZoom(zoomFactor) {
    const factor = zoomFactor > 0 ? zoomFactor : 1;
    root.style.transform = `scale(${1 / factor})`;
  }

  function classify(tag) {
    if (HEADING_TAGS.has(tag)) return 'heading';
    if (MEDIA_TAGS.has(tag)) return 'media';
    if (CONTROL_TAGS.has(tag)) return 'control';
    return 'text';
  }

  function computeBlocks() {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const elements = document.body.querySelectorAll(BLOCK_SELECTOR);
    const result = [];

    for (let i = 0; i < elements.length && result.length < MAX_BLOCKS; i++) {
      const el = elements[i];
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;

      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) === 0) {
        continue;
      }

      const kind = classify(el.tagName);
      const block = {
        kind,
        x: rect.left + scrollX,
        y: rect.top + scrollY,
        width: rect.width,
        height: rect.height,
      };

      if (kind === 'text') {
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 16;
        block.lines = Math.max(1, Math.min(4, Math.round(rect.height / lineHeight)));
      }

      result.push(block);
    }
    return result;
  }

  function computeGeometry() {
    const pageWidth = document.documentElement.scrollWidth;
    pageHeight = document.documentElement.scrollHeight;
    contentWidth = PANEL_WIDTH;
    scale = pageWidth > 0 ? contentWidth / pageWidth : 1;

    const scaledPageHeight = pageHeight * scale;
    const maxContentHeight = window.innerHeight * MAX_HEIGHT_RATIO - PANEL_PADDING_Y * 2;
    contentHeight = Math.min(scaledPageHeight, maxContentHeight);

    panel.style.height = contentHeight + PANEL_PADDING_Y * 2 + 'px';

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(contentWidth * dpr);
    canvas.height = Math.round(contentHeight * dpr);
    canvas.style.width = contentWidth + 'px';
    canvas.style.height = contentHeight + 'px';
  }

  function paint() {
    if (!contentHeight) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, contentWidth, contentHeight);

    for (const block of blocks) {
      const x = block.x * scale;
      const y = block.y * scale - stageOffset;
      const w = block.width * scale;
      const h = block.height * scale;
      if (y + h < 0 || y > contentHeight) continue;

      if (block.kind === 'heading') {
        ctx.fillStyle = COLORS.heading;
        ctx.fillRect(x, y, Math.max(w * 0.8, 2), Math.max(h * 0.6, 2));
      } else if (block.kind === 'media') {
        ctx.fillStyle = COLORS.media;
        ctx.fillRect(x, y, w, h);
      } else if (block.kind === 'control') {
        ctx.fillStyle = COLORS.control;
        ctx.fillRect(x, y, w, Math.max(h * 0.7, 2));
      } else {
        ctx.fillStyle = COLORS.text;
        const lines = block.lines || 1;
        const rowH = h / lines;
        const lineH = Math.max(rowH * 0.45, 1);
        for (let li = 0; li < lines; li++) {
          const ly = y + rowH * li + (rowH - lineH) / 2;
          const lw = li === lines - 1 && lines > 1 ? w * 0.6 : w * 0.92;
          ctx.fillRect(x, ly, Math.max(lw, 2), lineH);
        }
      }
    }
  }

  function updateViewport() {
    if (!scrollable || !pageHeight) return;
    const scaledPageHeight = pageHeight * scale;
    const viewportHeightVisual = Math.min(window.innerHeight * scale, contentHeight);
    const viewportTopVisual = window.scrollY * scale;

    const maxOffset = Math.max(scaledPageHeight - contentHeight, 0);
    const maxScroll = Math.max(pageHeight - window.innerHeight, 0);
    const scrollProgress = maxScroll > 0 ? window.scrollY / maxScroll : 0;
    const offset = maxOffset * scrollProgress;
    stageOffset = offset;

    viewportIndicator.style.height = viewportHeightVisual + 'px';
    viewportIndicator.style.top = PANEL_PADDING_Y + viewportTopVisual - offset + 'px';

    paint();
  }

  function render() {
    computeGeometry();
    scrollable = pageHeight > window.innerHeight + 1;
    applyVisibility();
    if (!scrollable) return;
    blocks = computeBlocks();
    updateViewport();
  }

  function scrollToVisualY(visualY) {
    const targetPageY = (visualY + stageOffset) / scale - window.innerHeight / 2;
    const maxScroll = Math.max(pageHeight - window.innerHeight, 0);
    const top = Math.min(Math.max(targetPageY, 0), maxScroll);
    window.scrollTo({ top, behavior: 'auto' });
  }

  function contentY(clientY) {
    const rect = panel.getBoundingClientRect();
    return clientY - rect.top - PANEL_PADDING_Y;
  }

  panel.addEventListener('click', (event) => {
    if (event.target === viewportIndicator) return;
    scrollToVisualY(contentY(event.clientY));
  });

  let dragStartClientY = 0;
  let dragStartScrollY = 0;

  viewportIndicator.addEventListener('pointerdown', (event) => {
    dragging = true;
    dragStartClientY = event.clientY;
    dragStartScrollY = window.scrollY;
    viewportIndicator.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  viewportIndicator.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    // Indicator's content-relative top is scrollY * (scale - maxOffset / maxScroll) -- panning
    // (maxOffset > 0) eats into how much the indicator itself moves per pixel of scroll. Solve
    // for the scrollY delta that makes the indicator track the pointer 1:1 in screen space.
    // On a page long enough that panning dominates, that rate can be tiny -- e.g. a 425px-tall
    // panel standing in for an 80,000px page means ~425px of drag has to span the whole
    // scrollable range, so 1 clientY px outside that range would otherwise fling the page
    // wildly. Clamp the effective input to the panel's own bounds first, exactly like a native
    // scrollbar thumb: dragging past the track's edge pins at min/max instead of amplifying.
    const panelRect = panel.getBoundingClientRect();
    const clampedClientY = Math.min(Math.max(event.clientY, panelRect.top), panelRect.bottom);

    const scaledPageHeight = pageHeight * scale;
    const maxOffset = Math.max(scaledPageHeight - contentHeight, 0);
    const maxScroll = Math.max(pageHeight - window.innerHeight, 0);
    const indicatorRate = maxScroll > 0 ? scale - maxOffset / maxScroll : scale;
    const rate = Math.abs(indicatorRate) > 1e-6 ? indicatorRate : scale;
    const deltaPageY = (clampedClientY - dragStartClientY) / rate;
    const top = Math.min(Math.max(dragStartScrollY + deltaPageY, 0), maxScroll);
    window.scrollTo({ top, behavior: 'auto' });
    updateViewport();
  });

  function stopDrag(event) {
    if (!dragging) return;
    dragging = false;
    try {
      viewportIndicator.releasePointerCapture(event.pointerId);
    } catch (e) {
      // pointer capture already released
    }
    updateViewport();
  }
  viewportIndicator.addEventListener('pointerup', stopDrag);
  viewportIndicator.addEventListener('pointercancel', stopDrag);

  window.addEventListener('scroll', updateViewport, { passive: true });
  window.addEventListener('resize', debounce(render, 200));

  const observer = new MutationObserver(debounce(render, 400));
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) render();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message) return;
    if (message.type === 'minimap:toggle') {
      visible = !visible;
      applyVisibility();
    } else if (message.type === 'minimap:zoom') {
      applyZoom(message.zoomFactor);
    }
  });

  document.addEventListener('keydown', (event) => {
    const isToggleCombo =
      event.key.toLowerCase() === 'm' &&
      event.shiftKey &&
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey;
    if (!isToggleCombo) return;
    visible = !visible;
    applyVisibility();
  });

  chrome.runtime.sendMessage({ type: 'minimap:getZoom' }).then(applyZoom).catch(() => {});

  render();
})();
