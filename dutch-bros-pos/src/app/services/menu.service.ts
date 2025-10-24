import { Injectable, signal, computed, Signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ModifiersData, ModifierChain, Product, Category } from '../models/menu.model';
import { map, Observable, tap } from 'rxjs';

// --- ADD THIS INTERFACE ---
// Defines the structure of menu.json
interface MenuData {
  imagepath: string;
  categories: Category[];
}

@Injectable({ providedIn: 'root' })
export class MenuService {
  private modifiersData = signal<ModifiersData | null>(null);
  
  // --- UPDATE THIS SIGNAL ---
  // Use the MenuData interface
  private menuData = signal<MenuData>({ imagepath: '', categories: [] });

  // Expose data signals
  readonly categories: Signal<Category[]> = computed(() => this.menuData().categories);
  
  readonly products: Signal<Product[]> = computed(() => 
    this.menuData().categories.flatMap((cat: Category) => cat.products)
  );
  
  readonly modifiers: Signal<ModifiersData | null> = this.modifiersData;

  // --- ADD THIS SIGNAL ---
  // This provides the image CDN path to all components
  readonly imagePath: Signal<string> = computed(() => this.menuData().imagepath);

  constructor(private http: HttpClient) {
    this.loadData();
  }

  private loadData(): void {
    // Load menu data
    // --- UPDATE THIS HTTP CALL ---
    this.http.get<MenuData>('assets/menu.json').pipe(
        tap(data => {
            console.log('Menu loaded');
            this.menuData.set(data); // Set the entire object
        })
    ).subscribe();

    // Load modifiers data
    this.http.get<ModifiersData>('assets/modifiers.json').pipe(
      tap(() => console.log('Modifiers loaded'))
    ).subscribe(data => {
        this.modifiersData.set(data);
    });
  }

  // Reactive getter function for modifier chain
  getModifierChain(productId: string): Signal<ModifierChain | undefined> {
    return computed(() => {
        const modifiers = this.modifiersData();
        if (!modifiers) return undefined;
        
        // Use product_modifier_mappings, falling back to default_chain
        const chainId = modifiers.product_modifier_mappings[productId] || modifiers.default_chain;
        return modifiers.modifier_chains[chainId];
    });
  }
}
