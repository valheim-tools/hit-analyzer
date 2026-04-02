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
  templateUrl: './preset-dropdown.component.html',
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
            // If the mob name itself matches, show ALL its attacks — not just the items whose
            // label also contains the mob name.
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
}
