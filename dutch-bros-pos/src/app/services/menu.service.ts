import { Injectable, signal, computed, Signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ModifiersData, ModifierChain, Product, Category } from '../models/menu.model';
import { map, Observable, tap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MenuService {
  private modifiersData = signal<ModifiersData | null>(null);
  private menuCategories = signal<Category[]>([]);
  private allProducts = signal<Product[]>([]);

  // Expose data signals
  readonly categories: Signal<Category[]> = this.menuCategories;
  readonly products: Signal<Product[]> = this.allProducts;
  readonly modifiers: Signal<ModifiersData | null> = this.modifiersData;

  constructor(private http: HttpClient) {
    this.loadData();
  }

  private loadData(): void {
    // Load menu data
    this.http.get<any>('assets/menu.json').pipe(
        tap(data => {
            this.menuCategories.set(data.categories);
            const allProducts = data.categories.flatMap((cat: Category) => cat.products);
            this.allProducts.set(allProducts);
        })
    ).subscribe();

    // Load modifiers data
    this.http.get<ModifiersData>('assets/modifiers.json').subscribe(data => {
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