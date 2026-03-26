/**
 * mobile.js — Valheim Damage Calculator
 *
 * Tooltip viewport clamping + mobile touch toggle.
 *
 * All tooltips are switched to position:fixed so they can never be clipped
 * by an overflow:auto ancestor (e.g. the horizontal-scroll table wrapper).
 *
 * On touch devices the CSS :hover trigger is unreliable, so this module
 * adds a JS-driven `.tip-active` class that mirrors :hover visibility.
 * Tapping a .tip-wrap toggles it open; tapping anywhere else closes it.
 *
 * Desktop → tooltip shown above the anchor  (mirrors the CSS default)
 * Mobile  → tooltip shown below the anchor
 *
 * Imported and initialised by index.js → initialize().
 */

/** Reset every inline style set by this module. */
function resetTipStyles(tip) {
    tip.style.position   = '';
    tip.style.left       = '';
    tip.style.top        = '';
    tip.style.bottom     = '';
    tip.style.transform  = '';
    tip.style.width      = '';
    tip.style.maxWidth   = '';
    tip.style.zIndex     = '';
    tip.style.visibility = '';
    tip.style.opacity    = '';
}

/** Close every open tooltip. */
function closeAllTips() {
    document.querySelectorAll('.tip-wrap.tip-active').forEach(element => {
        element.classList.remove('tip-active');
        const tip = element.querySelector(':scope > .tip-text');
        if (tip) resetTipStyles(tip);
    });
}

/**
 * Reposition a single tooltip so it stays fully inside the viewport.
 *
 * Uses position:fixed so the result is always in viewport coordinates and
 * is immune to overflow clipping from any ancestor container.
 *
 * @param {Element} wrapEl  The .tip-wrap element whose tooltip to clamp.
 */
function clampTooltip(wrapEl) {
    const tip = wrapEl.querySelector(':scope > .tip-text');
    if (!tip) return;

    // Start from a clean slate so the layout flush below reflects the
    // default CSS positioning (needed to calculate anchor coordinates).
    resetTipStyles(tip);

    const viewportWidth  = document.documentElement.clientWidth;   // excludes scrollbar
    const viewportHeight = document.documentElement.clientHeight;
    const padding = 8; // min gap from each viewport edge (px)

    // Snapshot the anchor's viewport rect while position:absolute is still
    // in effect (i.e. before we switch to fixed).
    const wrapRect = wrapEl.getBoundingClientRect();

    // Apply position:fixed with placeholder coordinates.
    // Force visibility so getBoundingClientRect returns real dimensions
    // even when CSS :hover hasn't kicked in yet (important on touch).
    const maxWidth = Math.min(400, viewportWidth - padding * 2);
    tip.style.position   = 'fixed';
    tip.style.visibility = 'hidden';    // hidden but laid out — allows measurement
    tip.style.opacity    = '0';
    tip.style.left       = `${padding}px`;  // placeholder — overwritten below
    tip.style.top        = `${padding}px`;  // placeholder — overwritten below
    tip.style.bottom     = 'auto';
    tip.style.transform  = 'none';
    tip.style.width      = '';          // natural max-content width
    tip.style.maxWidth   = `${maxWidth}px`;
    tip.style.zIndex     = '200';

    // Forced layout flush — gives the actual rendered dimensions.
    const { width: actualWidth, height: actualHeight } = tip.getBoundingClientRect();

    // ── Horizontal: centre on anchor, clamp to viewport ─────────────────
    const anchorCentre = wrapRect.left + wrapRect.width / 2;
    const left = Math.max(padding, Math.min(anchorCentre - actualWidth / 2, viewportWidth - actualWidth - padding));

    // ── Vertical: prefer above on desktop, below on mobile ───────────────
    const aboveTop = wrapRect.top  - actualHeight - 8;
    const belowTop = wrapRect.bottom + 6;

    let top;
    if (viewportWidth > 620) {
        top = aboveTop >= padding ? aboveTop : belowTop;
    } else {
        top = belowTop + actualHeight <= viewportHeight - padding ? belowTop : aboveTop;
    }

    tip.style.left       = `${Math.round(left)}px`;
    tip.style.top        = `${Math.round(top)}px`;
    // Now make it visible — the correct position is already in place
    // before the browser paints, so there's no flash.
    tip.style.visibility = 'visible';
    tip.style.opacity    = '1';
}

/**
 * Attach viewport-clamping behaviour to every .tip-wrap on the page,
 * including ones created dynamically after this call (event delegation).
 */
export function initTooltipClamping() {
    // ── Desktop: mouse / keyboard ────────────────────────────────────────
    document.addEventListener('mouseover', event => {
        const wrap = event.target.closest('.tip-wrap');
        if (wrap) clampTooltip(wrap);
    });
    document.addEventListener('mouseout', event => {
        const wrap = event.target.closest('.tip-wrap');
        if (wrap) {
            const tip = wrap.querySelector(':scope > .tip-text');
            if (tip) resetTipStyles(tip);
        }
    });
    document.addEventListener('focusin', event => {
        const wrap = event.target.closest('.tip-wrap');
        if (wrap) clampTooltip(wrap);
    }, true);
    document.addEventListener('focusout', event => {
        const wrap = event.target.closest('.tip-wrap');
        if (wrap) {
            const tip = wrap.querySelector(':scope > .tip-text');
            if (tip) resetTipStyles(tip);
        }
    }, true);

    // ── Scroll: hide any tooltip that was clamped with position:fixed ────
    window.addEventListener('scroll', () => {
        document.querySelectorAll('.tip-text').forEach(resetTipStyles);
    }, { passive: true });

    // ── Mobile: tap to toggle ────────────────────────────────────────────
    // We track whether the device uses touch so hover-only users are not
    // affected by the toggle logic.
    let isTouchDevice = false;
    document.addEventListener('touchstart', () => { isTouchDevice = true; }, { once: true, passive: true });

    document.addEventListener('click', event => {
        if (!isTouchDevice) return;

        const wrap = event.target.closest('.tip-wrap');
        if (wrap) {
            event.preventDefault();
            const wasActive = wrap.classList.contains('tip-active');
            closeAllTips();           // close every other tooltip first
            if (!wasActive) {
                wrap.classList.add('tip-active');
                clampTooltip(wrap);
            }
        } else {
            // Tapped outside any tooltip — close all.
            closeAllTips();
        }
    });

    // ── Layout changes ───────────────────────────────────────────────────
    window.addEventListener('resize', () => {
        closeAllTips();
        document.querySelectorAll('.tip-text').forEach(resetTipStyles);
    });
}
