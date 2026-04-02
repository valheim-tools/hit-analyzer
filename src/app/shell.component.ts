import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet],
  template: `
    <div class="container">
      <router-outlet />
    </div>
  `,
  styles: [],
})
export class ShellComponent {}

