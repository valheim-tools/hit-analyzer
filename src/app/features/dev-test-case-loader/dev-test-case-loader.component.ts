import { Component, inject, isDevMode, signal, computed, ElementRef, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormStateService } from '../../core/form-state.service';
import { DamageTypeName, DifficultyKey } from '../../core/models';

interface TestCaseMob {
  damageTypes: Record<string, number>;
  starLevel: number;
  extraDamagePercent?: number;
}

interface TestCasePlayer {
  maxHealth: number;
  blockingSkill: number;
  blockArmor: number;
  armor: number;
  parryMultiplier: number;
  resistanceModifiers?: Record<string, number>;
}

interface TestCase {
  name: string;
  mob: TestCaseMob;
  player: TestCasePlayer;
  difficulty: string;
  useShield: boolean;
  isParry: boolean;
}

@Component({
  selector: 'app-dev-test-case-loader',
  template: `
    @if (isVisible) {
      <div class="dev-test-loader">
        <label class="dev-test-label">🧪 Load Test Case</label>
        <div class="dev-test-search-wrap">
          <input
            class="dev-test-input"
            type="text"
            placeholder="Search test cases…"
            [value]="searchQuery()"
            (input)="onSearchInput($event)"
            (focus)="onInputFocus()"
            autocomplete="off"
          >
          @if (isDropdownOpen()) {
            <ul class="dev-test-dropdown">
              @for (item of filteredTestCases(); track item.originalIndex) {
                <li
                  class="dev-test-option"
                  (mousedown)="onOptionSelected(item.originalIndex)"
                >{{ item.testCase.name }}</li>
              } @empty {
                <li class="dev-test-option dev-test-option-empty">No matches</li>
              }
            </ul>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .dev-test-loader {
      background: #1a2a1a;
      border: 1px dashed #4a8a4a;
      border-radius: 4px;
      padding: 0.5rem 0.8rem;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .dev-test-label {
      font-size: 0.75rem;
      color: #6aba6a;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .dev-test-search-wrap {
      flex: 1;
      min-width: 0;
      position: relative;
    }
    .dev-test-input {
      width: 100%;
      background: #1a1712;
      border: 1px solid #4a8a4a;
      color: #e0d0b0;
      padding: 0.35rem 0.5rem;
      border-radius: 4px;
      font-family: inherit;
      font-size: 0.78rem;
    }
    .dev-test-input:focus { outline: none; border-color: #6aba6a; }
    .dev-test-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      max-height: 260px;
      overflow-y: auto;
      background: #1a1712;
      border: 1px solid #4a8a4a;
      border-top: none;
      border-radius: 0 0 4px 4px;
      list-style: none;
      margin: 0;
      padding: 0;
      z-index: 100;
    }
    .dev-test-option {
      padding: 0.35rem 0.5rem;
      font-size: 0.76rem;
      color: #e0d0b0;
      cursor: pointer;
    }
    .dev-test-option:hover { background: #2a3a2a; }
    .dev-test-option-empty {
      color: #a89872;
      font-style: italic;
      cursor: default;
    }
    .dev-test-option-empty:hover { background: transparent; }
  `],
})
export class DevTestCaseLoaderComponent {
  private readonly formStateService = inject(FormStateService);
  private readonly httpClient = inject(HttpClient);
  private readonly elementRef = inject(ElementRef);

  readonly isVisible = isDevMode();
  readonly testCases = signal<TestCase[]>([]);
  readonly searchQuery = signal('');
  readonly isDropdownOpen = signal(false);

  readonly filteredTestCases = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const allCases = this.testCases();
    const indexed = allCases.map((testCase, originalIndex) => ({ testCase, originalIndex }));
    if (!query) return indexed;
    return indexed.filter(item => item.testCase.name.toLowerCase().includes(query));
  });

  constructor() {
    if (!this.isVisible) return;

    this.httpClient.get<TestCase[]>('data/test-cases.json').subscribe({
      next: (cases) => this.testCases.set(cases),
      error: (error) => console.error('[DevTestCaseLoader] Failed to load test-cases.json', error),
    });
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
    this.isDropdownOpen.set(true);
  }

  onInputFocus(): void {
    this.searchQuery.set('');
    this.isDropdownOpen.set(true);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isDropdownOpen.set(false);
    }
  }

  onOptionSelected(index: number): void {
    const testCase = this.testCases()[index];
    if (!testCase) return;

    this.searchQuery.set(testCase.name);
    this.isDropdownOpen.set(false);
    this.loadTestCase(testCase);
  }

  private loadTestCase(testCase: TestCase): void {
    const damageTypes = Object.entries(testCase.mob.damageTypes).map(
      ([type, value]) => ({ type: type as DamageTypeName, value })
    );

    const resistanceModifiers = testCase.player.resistanceModifiers
      ? Object.entries(testCase.player.resistanceModifiers).map(
          ([type, multiplier]) => ({
            type: type as DamageTypeName,
            percent: Math.round(multiplier * 100),
          })
        )
      : [];

    const parryMultiplier = testCase.player.parryMultiplier;
    const isPresetParryMultiplier = [1, 1.5, 2, 2.5, 4, 6].some(
      preset => Math.abs(preset - parryMultiplier) < 1e-9
    );

    this.formStateService.load({
      mobPreset: '',
      damageTypes,
      starLevel: testCase.mob.starLevel,
      difficulty: testCase.difficulty as DifficultyKey,
      extraDamagePercent: testCase.mob.extraDamagePercent ?? 0,
      maxHealth: testCase.player.maxHealth,
      blockingSkill: testCase.player.blockingSkill,
      blockArmor: testCase.player.blockArmor,
      armor: testCase.player.armor,
      parryMultiplier,
      parryMultiplierMode: isPresetParryMultiplier ? 'preset' : 'custom',
      resistanceModifiers,
      shieldPreset: '',
      shieldQuality: 3,
    });
  }
}
