import {
  Component, input, output, signal, computed, ElementRef, inject, HostListener, viewChild, afterRenderEffect,
} from '@angular/core';

export interface PresetItem {
  id: string;
  label: string;
  triggerLabel?: string;  // shown in the trigger button when selected; falls back to label
  iconSrc?: string;
}

export interface PresetSubGroup {
  subGroupLabel: string;
  iconSrc?: string;
  items: PresetItem[];
}

export interface PresetGroup {
  groupLabel: string;
  items?: PresetItem[];
  subGroups?: PresetSubGroup[];
}

@Component({
  selector: 'app-preset-dropdown',
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
          {{ (selectedItem()?.triggerLabel ?? selectedItem()?.label) ?? placeholder() }}
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
            @for (group of filteredGroups(); track group.groupLabel; let groupIndex = $index) {
              <div class="preset-dropdown-group-header">{{ group.groupLabel }}</div>
              @if (group.subGroups) {
                @for (subGroup of group.subGroups; track subGroup.subGroupLabel) {
                  <div class="preset-dropdown-subgroup-header">
                    @if (subGroup.iconSrc) {
                      <img class="preset-dropdown-subgroup-icon"
                           [src]="subGroup.iconSrc"
                           [alt]="subGroup.subGroupLabel"
                           [attr.loading]="getSubgroupImageLoading(groupIndex)">
                    }
                    {{ subGroup.subGroupLabel }}
                  </div>
                  @for (item of subGroup.items; track item.id) {
                    <div
                      class="preset-dropdown-option preset-dropdown-option-indented"
                      [class.selected]="item.id === selectedId()"
                      (click)="selectItem(item.id)"
                    >
                      <span class="preset-dropdown-option-text">{{ item.label }}</span>
                    </div>
                  }
                }
              } @else {
                @for (item of (group.items ?? []); track item.id; let itemIndex = $index) {
                  <div
                    class="preset-dropdown-option"
                    [class.selected]="item.id === selectedId()"
                    (click)="selectItem(item.id)"
                  >
                    @if (item.iconSrc) {
                      <img class="preset-dropdown-option-icon"
                           [src]="item.iconSrc"
                           [alt]="item.label"
                           [attr.loading]="getOptionImageLoading(groupIndex, itemIndex)">
                    }
                    <span class="preset-dropdown-option-text">{{ item.label }}</span>
                  </div>
                }
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

  readonly searchInputElement = viewChild<ElementRef>('searchInput');

  readonly groups = input<PresetGroup[]>([]);
  readonly selectedId = input<string>('');
  readonly placeholder = input('Custom');
  readonly isSearchable = input(true);
  readonly searchPlaceholder = input('Search…');
  readonly showCustomOption = input(true);

  readonly selectedChange = output<string>();

  readonly isOpen = signal(false);
  readonly searchQuery = signal('');

  constructor() {

    // Auto-focus the search input when the dropdown opens — matches vanilla JS behaviour.
    // afterRenderEffect write phase runs after Angular has finished updating the DOM,
    // so the @if-rendered input is guaranteed to exist before focus() is called.
    afterRenderEffect({
      write: () => {
        const searchElement = this.searchInputElement();
        if (this.isOpen() && this.isSearchable() && searchElement) {
          searchElement.nativeElement.focus();
        }
      },
    });
  }

  readonly selectedItem = computed<PresetItem | undefined>(() => {
    if (!this.selectedId()) return undefined;
    for (const group of this.groups()) {
      if (group.items) {
        const found = group.items.find(item => item.id === this.selectedId());
        if (found) return found;
      }
      if (group.subGroups) {
        for (const subGroup of group.subGroups) {
          const found = subGroup.items.find(item => item.id === this.selectedId());
          if (found) return { ...found, iconSrc: found.iconSrc ?? subGroup.iconSrc };
        }
      }
    }
    return undefined;
  });

  readonly filteredGroups = computed<PresetGroup[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.groups();

    const results: PresetGroup[] = [];
    for (const group of this.groups()) {
      if (group.subGroups) {
        const matchingSubGroups = group.subGroups
          .map(subGroup => {
            const subGroupNameMatches = subGroup.subGroupLabel.toLowerCase().includes(query);
            const matchingItems = subGroup.items.filter(item => item.label.toLowerCase().includes(query));
            // If the mob name itself matches, show ALL its attacks — not just the (zero) items whose
            // label also contains the mob name (attack labels never embed the mob name).
            return {
              ...subGroup,
              items: subGroupNameMatches ? subGroup.items : matchingItems,
            };
          })
          .filter(subGroup => subGroup.items.length > 0);
        if (matchingSubGroups.length > 0) {
          results.push({ groupLabel: group.groupLabel, subGroups: matchingSubGroups });
        }
      } else {
        const matchingItems = (group.items ?? []).filter(item => item.label.toLowerCase().includes(query));
        if (matchingItems.length > 0) {
          results.push({ groupLabel: group.groupLabel, items: matchingItems });
        }
      }
    }
    return results;
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

  /**
   * Always eagerly load subgroup (mob header) icons so all images are
   * pre-fetched as soon as the component mounts — no flash-of-missing-image
   * when the dropdown opens.
   */
  getSubgroupImageLoading(_groupIndex: number): 'eager' | 'lazy' {
    return 'eager';
  }

  /**
   * Always eagerly load flat option icons (e.g. shield preset options) so
   * all images are pre-fetched on mount.
   */
  getOptionImageLoading(_groupIndex: number, _itemIndex: number): 'eager' | 'lazy' {
    return 'eager';
  }
}

