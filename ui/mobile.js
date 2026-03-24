/**
 * mobile.js — Valheim Damage Calculator
 *
 * Tooltip viewport clamping — works on every screen size.
 *
 * All tooltips are switched to position:fixed so they can never be clipped
 * by an overflow:auto ancestor (e.g. the horizontal-scroll table wrapper).
 * One synchronous getBoundingClientRect() call forces a layout flush and
 * returns the real content-sized rect, which is then used to calculate the
 * final clamped position — all before the first paint.
 *
 * Desktop → tooltip shown above the anchor  (mirrors the CSS default)
 * Mobile  → tooltip shown below the anchor
 *
 * Imported and initialised by index.js → initialize().
 */

/** Reset every inline style set by this module. */
function resetTipStyles(tip) {
    tip.style.position  = '';
    tip.style.left      = '';
    tip.style.top       = '';
    tip.style.bottom    = '';
    tip.style.transform = '';
    tip.style.width     = '';
    tip.style.maxWidth  = '';
    tip.style.zIndex    = '';
}

/**
 * Reposition a single tooltip so it stays fully inside the viewport.
 *
 * Uses position:fixed so the result is always in viewport coordinates and
 * is immune to overflow clipping from any ancestor container.
 *
 * @param {Element} wrapEl  The .tip-wrap element whose tooltip to clamp.
 */
export function clampTooltip(wrapEl) {
    const tip = wrapEl.querySelector(':scope > .tip-text');
    if (!tip) return;

    // Start from a clean slate so the layout flush below reflects the
    // default CSS positioning (needed to calculate anchor coordinates).
    resetTipStyles(tip);

    const vw  = window.innerWidth;
    const vh  = window.innerHeight;
    const pad = 8; // min gap from each viewport edge (px)

    // Snapshot the anchor's viewport rect while position:absolute is still
    // in effect (i.e. before we switch to fixed).
    const wrapRect = wrapEl.getBoundingClientRect();

    // Apply position:fixed with placeholder coordinates so that the
    // subsequent getBoundingClientRect() flush returns the real rendered
    // size (content-driven width, bounded by maxWidth).
    const maxW = Math.min(400, vw - pad * 2);
    tip.style.position  = 'fixed';
    tip.style.left      = `${pad}px`;  // placeholder — overwritten below
    tip.style.top       = `${pad}px`;  // placeholder — overwritten below
    tip.style.bottom    = 'auto';
    tip.style.transform = 'none';
    tip.style.width     = '';          // natural max-content width
    tip.style.maxWidth  = `${maxW}px`;
    tip.style.zIndex    = '200';

    // Forced layout flush — gives the actual rendered dimensions.
    const { width: actualW, height: actualH } = tip.getBoundingClientRect();

    // ── Horizontal: centre on anchor, clamp to viewport ─────────────────
    const anchorCentre = wrapRect.left + wrapRect.width / 2;
    const left = Math.max(pad, Math.min(anchorCentre - actualW / 2, vw - actualW - pad));

    // ── Vertical: prefer above on desktop, below on mobile ───────────────
    const aboveTop = wrapRect.top  - actualH - 8;
    const belowTop = wrapRect.bottom + 6;

    let top;
    if (vw > 620) {
        // Desktop: show above (same side as CSS bottom:140%).
        // Fall back to below if it would clip the top of the viewport.
        top = aboveTop >= pad ? aboveTop : belowTop;
    } else {
        // Mobile: show below.
        // Fall back to above if it would clip the bottom of the viewport.
        top = belowTop + actualH <= vh - pad ? belowTop : aboveTop;
    }

    tip.style.left = `${Math.round(left)}px`;
    tip.style.top  = `${Math.round(top)}px`;
}

/**
 * Attach viewport-clamping behaviour to every .tip-wrap on the page,
 * including ones created dynamically after this call (event delegation).
 */
export function initTooltipClamping() {
    function handleShow(e) {
        const wrap = e.target.closest('.tip-wrap');
        if (wrap) clampTooltip(wrap);
    }

    // mouseover bubbles — reliable for delegation on dynamically-created nodes.
    // touchstart handles mobile tap-to-show.
    // focusin handles keyboard navigation.
    document.addEventListener('mouseover',  handleShow);
    document.addEventListener('focusin',    handleShow, true);
    document.addEventListener('touchstart', handleShow, { capture: true, passive: true });

    // On resize / orientation change, clear inline styles so the next
    // interaction recalculates from a clean base position.
    window.addEventListener('resize', () => {
        document.querySelectorAll('.tip-text').forEach(resetTipStyles);
    });
}
