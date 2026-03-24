/**
 * mobile.js — Valheim Damage Calculator
 *
 * Mobile-specific JavaScript enhancements.
 * Keeps tooltips (.tip-wrap > .tip-text) within the horizontal bounds of
 * the viewport so they never slide off-screen on narrow devices.
 *
 * On mobile (≤ 620 px) tooltips are switched to position:fixed so they
 * escape any overflow:auto ancestor (e.g. the horizontal-scroll table
 * wrapper). On desktop only a small left/right nudge is applied.
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
 * Reposition a single tooltip so it stays inside the viewport.
 *
 * Mobile  → position:fixed, centred on the anchor, shown below it,
 *            clamped to viewport edges.  Escapes overflow containers.
 * Desktop → small left/right nudge via calc() keeping position:absolute.
 *
 * @param {Element} wrapEl  The .tip-wrap element whose tooltip to clamp.
 */
export function clampTooltip(wrapEl) {
    const tip = wrapEl.querySelector(':scope > .tip-text');
    if (!tip) return;

    // Always start from a clean slate so the measurement below reflects
    // the default CSS-driven position (important for the desktop branch).
    resetTipStyles(tip);

    requestAnimationFrame(() => {
        const vw  = window.innerWidth;
        const pad = 8; // min gap from each viewport edge (px)

        if (vw <= 620) {
            /* ── Mobile: position:fixed, centred on the anchor ── */
            const wrapRect = wrapEl.getBoundingClientRect();

            // Hard cap so the tooltip never exceeds the usable viewport.
            const maxW = Math.min(400, vw - pad * 2);

            // Place the tooltip with a placeholder left so we can force a
            // layout pass and read the *actual* content-driven width before
            // calculating the centred position.
            tip.style.position  = 'fixed';
            tip.style.left      = `${pad}px`; // placeholder
            tip.style.top       = `${Math.round(wrapRect.bottom + 6)}px`;
            tip.style.bottom    = 'auto';
            tip.style.transform = 'none';
            tip.style.width     = '';         // keep natural max-content width
            tip.style.maxWidth  = `${maxW}px`;
            tip.style.zIndex    = '200';

            // getBoundingClientRect() forces a synchronous layout, giving us
            // the real rendered width (content-sized, bounded by maxW).
            const actualW = tip.getBoundingClientRect().width;

            // Horizontally centre on the anchor then clamp to viewport.
            const anchorCentre = wrapRect.left + wrapRect.width / 2;
            const left = Math.max(pad, Math.min(anchorCentre - actualW / 2, vw - actualW - pad));
            tip.style.left = `${Math.round(left)}px`;
        } else {
            /* ── Desktop: nudge left/right to stay within the viewport ── */
            const rect = tip.getBoundingClientRect();
            if (!rect.width) return;

            const overflowRight = Math.max(0, rect.right  - (vw - pad));
            const newLeft       = rect.left - overflowRight;

            if (overflowRight > 0) {
                if (newLeft < pad) {
                    // Tooltip wider than usable viewport — pin to left edge.
                    const wrapLeft = wrapEl.getBoundingClientRect().left;
                    tip.style.left      = `${pad - wrapLeft}px`;
                    tip.style.transform = 'none';
                } else {
                    tip.style.left = `calc(50% - ${overflowRight}px)`;
                }
            } else if (rect.left < pad) {
                // Overflows left only — shift right.
                tip.style.left = `calc(50% + ${pad - rect.left}px)`;
            }
        }
    });
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

    function handleHide(e) {
        const wrap = e.target.closest('.tip-wrap');
        if (!wrap) return;
        const tip = wrap.querySelector(':scope > .tip-text');
        if (tip) resetTipStyles(tip);
    }

    // ── Show ──────────────────────────────────────────────────────────────
    // Capture phase so dynamically-injected .tip-wrap nodes are covered.
    document.addEventListener('mouseenter', handleShow, true);
    document.addEventListener('focusin',    handleShow, true);
    document.addEventListener('touchstart', handleShow, { capture: true, passive: true });

    // ── Hide ──────────────────────────────────────────────────────────────
    document.addEventListener('mouseleave', handleHide, true);
    document.addEventListener('focusout',   handleHide, true);

    // ── Layout changes ────────────────────────────────────────────────────
    // Clear inline styles on resize/rotation so the next interaction
    // recalculates from the correct base position.
    window.addEventListener('resize', () => {
        document.querySelectorAll('.tip-text').forEach(resetTipStyles);
    });
}
