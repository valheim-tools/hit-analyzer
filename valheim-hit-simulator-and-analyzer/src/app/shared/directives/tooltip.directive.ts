import {
  Directive, ElementRef, HostListener, inject, NgZone, OnDestroy, Renderer2,
} from '@angular/core';

/**
 * Tooltip viewport-clamping directive.
 *
 * Apply to any element that contains a child with class `tip-text`.
 * On hover (desktop) or touch (mobile) it positions the tooltip using
 * position:fixed so it is never clipped by an overflow:auto ancestor.
 *
 * Mirrors the logic from the original mobile.js module.
 */
@Directive({
  selector: '[appTooltip]',
  standalone: true,
  host: { class: 'tip-wrap' },
})
export class TooltipDirective implements OnDestroy {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private readonly ngZone = inject(NgZone);

  private isOpen = false;

  @HostListener('mouseenter')
  onMouseEnter(): void {
    this.ngZone.runOutsideAngular(() => this.clampAndShow());
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    this.ngZone.runOutsideAngular(() => this.resetTipStyles());
  }

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent): void {
    event.stopPropagation();
    this.ngZone.runOutsideAngular(() => {
      if (this.isOpen) {
        this.resetTipStyles();
        this.isOpen = false;
      } else {
        this.closeAllTips();
        this.clampAndShow();
        this.isOpen = true;
      }
    });
  }

  @HostListener('document:touchstart', ['$event'])
  onDocumentTouchStart(event: TouchEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.ngZone.runOutsideAngular(() => {
        this.resetTipStyles();
        this.isOpen = false;
      });
    }
  }

  ngOnDestroy(): void {
    this.resetTipStyles();
  }

  private getTipElement(): HTMLElement | null {
    return this.elementRef.nativeElement.querySelector(':scope > .tip-text');
  }

  private resetTipStyles(): void {
    const tip = this.getTipElement();
    if (!tip) return;
    const properties = ['position', 'left', 'top', 'bottom', 'transform', 'width', 'maxWidth', 'zIndex', 'visibility', 'opacity'];
    properties.forEach(property => this.renderer.removeStyle(tip, property));
    this.elementRef.nativeElement.classList.remove('tip-active');
  }

  private clampAndShow(): void {
    const tip = this.getTipElement();
    if (!tip) return;

    this.resetTipStyles();

    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const padding = 8;
    const wrapRect = this.elementRef.nativeElement.getBoundingClientRect();
    const maxWidth = Math.min(400, viewportWidth - padding * 2);

    this.renderer.setStyle(tip, 'position', 'fixed');
    this.renderer.setStyle(tip, 'visibility', 'hidden');
    this.renderer.setStyle(tip, 'opacity', '0');
    this.renderer.setStyle(tip, 'left', `${padding}px`);
    this.renderer.setStyle(tip, 'top', `${padding}px`);
    this.renderer.setStyle(tip, 'bottom', 'auto');
    this.renderer.setStyle(tip, 'transform', 'none');
    this.renderer.setStyle(tip, 'maxWidth', `${maxWidth}px`);
    this.renderer.setStyle(tip, 'zIndex', '200');

    const { width: actualWidth, height: actualHeight } = tip.getBoundingClientRect();

    const anchorCentre = wrapRect.left + wrapRect.width / 2;
    const left = Math.max(padding, Math.min(
      anchorCentre - actualWidth / 2,
      viewportWidth - actualWidth - padding,
    ));

    const aboveTop = wrapRect.top - actualHeight - 8;
    const belowTop = wrapRect.bottom + 6;

    let top: number;
    if (viewportWidth > 620) {
      top = aboveTop >= padding ? aboveTop : belowTop;
    } else {
      top = belowTop + actualHeight <= viewportHeight - padding ? belowTop : aboveTop;
    }

    this.renderer.setStyle(tip, 'left', `${Math.round(left)}px`);
    this.renderer.setStyle(tip, 'top', `${Math.round(top)}px`);
    this.renderer.removeStyle(tip, 'visibility');
    this.renderer.removeStyle(tip, 'opacity');
    this.elementRef.nativeElement.classList.add('tip-active');
  }

  private closeAllTips(): void {
    document.querySelectorAll<HTMLElement>('.tip-wrap.tip-active').forEach(element => {
      element.classList.remove('tip-active');
      const tip = element.querySelector<HTMLElement>(':scope > .tip-text');
      if (tip) {
        const properties = ['position', 'left', 'top', 'bottom', 'transform', 'width', 'maxWidth', 'zIndex', 'visibility', 'opacity'];
        properties.forEach(property => { tip.style.removeProperty(property); });
      }
    });
  }
}

