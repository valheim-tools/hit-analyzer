import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./app').then(module => module.App),
  },
  {
    path: 'armor-builder',
    loadComponent: () =>
      import('./features/armor-builder/armor-builder.component').then(
        module => module.ArmorBuilderComponent,
      ),
  },
];

