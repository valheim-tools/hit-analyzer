import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { NavigationSpinnerComponent } from './shared/components/navigation-spinner/navigation-spinner.component';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, NavigationSpinnerComponent],
  template: `
    <div class="container">
      <router-outlet />
    </div>
    @if (isNavigating()) {
      <app-navigation-spinner />
    }
  `,
  styles: [],
})
export class ShellComponent {
  private readonly router = inject(Router);
  readonly isNavigating = signal(false);

  constructor() {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.isNavigating.set(true);
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.isNavigating.set(false);
      }
    });
  }
}
