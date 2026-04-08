import { Component, signal } from '@angular/core';

export interface ChangelogEntry {
  date: string;
  items: string[];
}

@Component({
  selector: 'app-changelog-footer',
  template: `
    <footer class="changelog-footer">
      <button class="changelog-toggle" (click)="isExpanded.set(!isExpanded())">
        <h4 class="changelog-title">
          Changelog
          <span class="changelog-arrow" [class.is-expanded]="isExpanded()">▸</span>
        </h4>
      </button>
      @if (isExpanded()) {
        <div class="changelog-entries">
          @for (entry of changelogEntries; track entry.date) {
            <div class="changelog-group">
              <span class="changelog-date">{{ entry.date }}</span>
              <ul class="changelog-list">
                @for (item of entry.items; track item) {
                  <li class="changelog-item">{{ item }}</li>
                }
              </ul>
            </div>
          }
        </div>
      }
    </footer>
  `,
  styles: [`
    @use '../../../../styles/variables' as *;

    .changelog-footer {
      margin-top: 3rem;
      padding: 1rem 1.2rem;
      border-top: 1px solid $color-gold-darker;
      text-align: center;
    }

    .changelog-toggle {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0;
      display: inline-flex;
      align-items: center;
    }

    .changelog-title {
      font-size: 0.68rem;
      color: $color-gold-dark;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 0;
    }

    .changelog-arrow {
      display: inline-block;
      margin-left: 0.3rem;
      font-size: 0.7rem;
      color: $color-gold-dark;
      transition: transform 0.2s ease;

      &.is-expanded {
        transform: rotate(90deg);
      }
    }

    .changelog-entries {
      margin-top: 0.5rem;
    }

    .changelog-group {
      margin-bottom: 0.4rem;
    }

    .changelog-date {
      color: $color-gold-dark;
      font-size: 0.7rem;
    }

    .changelog-list {
      list-style: none;
      padding: 0;
      margin: 0.2rem 0 0;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .changelog-item {
      font-size: 0.75rem;
      color: $color-text-muted;
    }
  `],
})
export class ChangelogFooterComponent {
  readonly isExpanded = signal(false);
  readonly changelogEntries: ChangelogEntry[] = [
    {
      date: '2026-04-08',
      items: [
        'Add shareable calculation links — click "Copy" to generate a URL that restores all mob, defense, and risk factor inputs for anyone who opens it',
      ],
    },
    {
      date: '2026-04-07',
      items: [
        'Fix "Min health to avoid stagger" showing incorrect value when guard break occurs — now correctly accounts for combined (block + armor) stagger on the hypothetical successful-block path',
        'Add Range damage view to Hit Analyzer result table',
        'Fix multiplicative scaling for star level, difficulty, and extra damage modifiers (it was wrongly additive)',
      ],
    },
  ];
}
