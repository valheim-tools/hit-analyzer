import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, inject } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { AnalyticsService } from './core/analytics.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(),
    provideRouter(
      routes,
      withViewTransitions({
        onViewTransitionCreated: ({ transition, to }) => {
          const targetUrl = to.firstChild?.url.map(segment => segment.path).join('/') ?? '';
          const isNavigatingForward = targetUrl.includes('armor-builder');
          const directionClass = isNavigatingForward ? 'navigating-forward' : 'navigating-back';
          document.documentElement.classList.add(directionClass);
          transition.finished.then(() => {
            document.documentElement.classList.remove('navigating-forward', 'navigating-back');
          });

          // Track page view for each route transition
          const analyticsService = inject(AnalyticsService);
          const pagePath = '/' + targetUrl;
          const pageTitle = pagePath.includes('armor-builder') ? 'Armor Builder' : 'Hit Analyzer';
          analyticsService.trackPageView({ pagePath, pageTitle });
        },
      }),
    ),
  ],
};
