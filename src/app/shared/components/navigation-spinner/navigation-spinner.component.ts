import { Component } from '@angular/core';

@Component({
  selector: 'app-navigation-spinner',
  template: `
    <div class="spinner-overlay">
      <div class="spinner"></div>
    </div>
  `,
  styles: [`
    .spinner-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(33, 30, 20, 0.7);
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(204, 175, 94, 0.2);
      border-top-color: #ccaf5e;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
})
export class NavigationSpinnerComponent {}

