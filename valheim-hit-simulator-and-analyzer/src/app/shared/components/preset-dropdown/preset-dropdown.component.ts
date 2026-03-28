import {
  Component, input, output, signal, computed, ElementRef, inject, HostListener,
} from '@angular/core';

export interface PresetItem {
  id: string;
  label: string;
  iconSrc?: string;
}

export interface PresetGroup {
  groupLabel: string;
  items: PresetItem[];
}

@Component({
  selector: 'app-preset-dropdown',
  standalone: true,
  imports: [],
  template: `
    <div class="preset-dropdown" [class.open]="isOpen()">
      <button
        type="button"
        class="preset-dropdown-trigger"
        (click)="toggleDropdown()"
        [attr.aria-expanded]="isOpen()"
      >
        @if (selectedItem()?.iconSrc) {
          <img class="preset-dropdown-trigger-icon" [src]="selectedItem()!.iconSrc" alt="">
        }
        <span class="preset-dropdown-trigger-text">
          {{ selectedItem()?.label ?? placeholder() }}
        </span>
        <span class="preset-dropdown-trigger-arrow">▾</span>
      </button>

      @if (isOpen()) {
        <div class="preset-dropdown-panel">
          @if (isSearchable()) {
            <input
              #searchInput
              type="text"
              class="preset-dropdown-search"
              [placeholder]="searchPlaceholder()"
              autocomplete="off"
              [value]="searchQuery()"
              (input)="onSearchInput($event)"
              (keydown.escape)="closeDropdown()"
            >
          }
          <div class="preset-dropdown-list">
            @if (showCustomOption()) {
              <div
                class="preset-dropdown-option preset-dropdown-custom-option"
                (click)="selectItem('')"
              >
                <span class="preset-dropdown-option-text">Custom</span>
              </div>
            }
            @for (group of filteredGroups(); track group.groupLabel) {
              <div class="preset-dropdown-group-header">{{ group.groupLabel }}</div>
              @for (item of group.items; track item.id) {
                <div
                  class="preset-dropdown-option"
                  [class.selected]="item.id === selectedId()"
                  (click)="selectItem(item.id)"
                >
                  @if (item.iconSrc) {
                    <img class="preset-dropdown-option-icon" [src]="item.iconSrc" [alt]="item.label" loading="lazy">
                  }
                  <span class="preset-dropdown-option-text">{{ item.label }}</span>
                </div>
              }
            }
          </div>
        </div>
      }
    </div>
  `,
  styleUrl: './preset-dropdown.component.scss',
})
export class PresetDropdownComponent {
  private readonly elementRef = inject(ElementRef);

  readonly groups = input<PresetGroup[]>([]);
  readonly selectedId = input<string>('');
  readonly placeholder = input('Custom');
  readonly isSearchable = input(true);
  readonly searchPlaceholder = input('Search…');
  readonly showCustomOption = input(true);

  readonly selectedChange = output<string>();

  readonly isOpen = signal(false);
  readonly searchQuery = signal('');

  readonly selectedItem = computed<PresetItem | undefined>(() => {
    if (!this.selectedId()) return undefined;
    for (const group of this.groups()) {
      const found = group.items.find(item => item.id === this.selectedId());
      if (found) return found;
    }
    return undefined;
  });

  readonly filteredGroups = computed<PresetGroup[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.groups();
    return this.groups()
      .map(group => ({
        groupLabel: group.groupLabel,
        items: group.items.filter(item => item.label.toLowerCase().includes(query)),
      }))
      .filter(group => group.items.length > 0);
  });

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.closeDropdown();
    }
  }

  toggleDropdown(): void {
    if (this.isOpen()) {
      this.closeDropdown();
    } else {
      this.isOpen.set(true);
      this.searchQuery.set('');
    }
  }

  closeDropdown(): void {
    this.isOpen.set(false);
  }

  selectItem(id: string): void {
    this.selectedChange.emit(id);
    this.closeDropdown();
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }
}

