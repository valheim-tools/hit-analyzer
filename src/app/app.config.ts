import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(),
    provideRouter(
      routes,
      withViewTransitions({
        onViewTransitionCreated: ({ transition, from, to }) => {
          const targetUrl = to.firstChild?.url.map(segment => segment.path).join('/') ?? '';
          const isNavigatingForward = targetUrl.includes('armor-builder');
          const directionClass = isNavigatingForward ? 'navigating-forward' : 'navigating-back';
          document.documentElement.classList.add(directionClass);
          transition.finished.then(() => {
            document.documentElement.classList.remove('navigating-forward', 'navigating-back');
          });
        },
      }),
    ),
  ],
};
