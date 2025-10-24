import { Injectable, signal, computed, Signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ModifiersData, ModifierChain, Product, Category } from '../models/menu.model';
import { map, Observable, tap, of } from 'rxjs';

export interface MenuItem {
  name: string;
  price: number;
  category: string;
}

interface MenuData {
  imagepath: string;
  categories: Category[];
}

@Injectable({ providedIn: 'root' })
export class MenuService {
  private modifiersData = signal<ModifiersData | null>(null);
  private menuData = signal<MenuData>({ imagepath: '', categories: [] });
  
  readonly categories: Signal<Category[]> = computed(() => this.menuData().categories);
  
  readonly products: Signal<Product[]> = computed(() => 
    this.menuData().categories.flatMap((cat: Category) => cat.products)
  );
  
  readonly modifiers: Signal<ModifiersData | null> = this.modifiersData;
  readonly imagePath: Signal<string> = computed(() => this.menuData().imagepath);

  constructor(private http: HttpClient) {
    this.loadData();
  }

  private loadData(): void {
    this.http.get<MenuData>('assets/menu.json').pipe(
      tap(data => {
        console.log('Menu loaded');
        this.menuData.set(data);
      })
    ).subscribe();

    this.http.get<ModifiersData>('assets/modifiers.json').pipe(
      tap(() => console.log('Modifiers loaded'))
    ).subscribe(data => {
      this.modifiersData.set(data);
    });
  }

  getModifierChain(productId: string): Signal<ModifierChain | undefined> {
    return computed(() => {
      const modifiers = this.modifiersData();
      if (!modifiers) return undefined;
      
      const chainId = modifiers.product_modifier_mappings[productId] || modifiers.default_chain;
      return modifiers.modifier_chains[chainId];
    });
  }

  // NEW: Methods for POS screen
  getMenu(): Observable<MenuItem[]> {
    const menuItems: MenuItem[] = [
      // Seasonal Drinks
      { name: 'Seasonal Drinks', price: 5.99, category: 'Seasonal Drinks' },
      { name: 'Dulce de Leche', price: 5.99, category: 'Seasonal Drinks' },
      { name: 'Mochi Berry', price: 5.99, category: 'Seasonal Drinks' },
      
      // Iced Drinks
      { name: 'Iced Matcha Latte', price: 5.49, category: 'Iced Drinks' },
      { name: 'Iced Matcha Lemonade', price: 5.49, category: 'Iced Drinks' },
      { name: 'Iced Coffee', price: 4.49, category: 'Iced Drinks' },
      { name: 'Iced Dutch Faves', price: 5.99, category: 'Iced Drinks' },
      { name: 'Iced Protein Coffee', price: 6.49, category: 'Iced Drinks' },
      { name: 'Iced Latte', price: 5.49, category: 'Iced Drinks' },
      { name: 'Iced Mocha', price: 5.99, category: 'Iced Drinks' },
      { name: 'Cold Brew', price: 4.99, category: 'Iced Drinks' },
      { name: 'Iced Americano Black Coffee', price: 4.29, category: 'Iced Drinks' },
      
      // Blended
      { name: 'Iced Dutch Faves Zero Sugar Added', price: 5.99, category: 'Blended' },
      { name: 'Blended Freeze', price: 6.49, category: 'Blended' },
      { name: 'Blended Freeze', price: 6.49, category: 'Blended' },
      { name: 'Rebel Energy', price: 5.99, category: 'Blended' },
      { name: 'Blended Rebel', price: 6.49, category: 'Blended' },
      { name: 'Iced Rebel', price: 5.99, category: 'Blended' },
      
      // More items
      { name: 'Iced Rebel Zero Sugar', price: 5.99, category: 'Iced Drinks' },
      { name: 'Matcha', price: 5.49, category: 'Hot Drinks' },
      { name: 'Iced Matcha Latte', price: 5.49, category: 'Iced Drinks' },
      { name: 'Iced Matcha Lemonade', price: 5.49, category: 'Iced Drinks' },
      { name: 'Hot Matcha Latte', price: 5.49, category: 'Hot Drinks' },
      { name: 'Lemonade', price: 3.99, category: 'Cold Drinks' },
      { name: 'Iced Lemonade', price: 3.99, category: 'Iced Drinks' },
      { name: 'Blended Lemonade', price: 4.99, category: 'Blended' },
      { name: 'Iced Tea', price: 3.49, category: 'Iced Drinks' },
      { name: 'Iced Green Tea', price: 3.49, category: 'Iced Drinks' },
      { name: 'Iced Black Tea', price: 3.49, category: 'Iced Drinks' },
      { name: 'Chai Tea', price: 4.99, category: 'Hot Drinks' },
      { name: 'Iced Chai', price: 4.99, category: 'Iced Drinks' },
      { name: 'Hot Chai', price: 4.99, category: 'Hot Drinks' },
      { name: 'Hot Coffee', price: 3.99, category: 'Hot Drinks' },
      { name: 'Hot Dutch Faves', price: 5.99, category: 'Hot Drinks' },
      { name: 'Hot Protein Coffee', price: 6.49, category: 'Hot Drinks' },
      { name: 'Hot Latte', price: 5.49, category: 'Hot Drinks' },
      { name: 'Hot Mocha', price: 5.99, category: 'Hot Drinks' },
      { name: 'Toasted Cold Brew', price: 5.49, category: 'Iced Drinks' },
      { name: 'Hot Americano Black Coffee', price: 3.99, category: 'Hot Drinks' },
      { name: 'Hot Cocoa & Hot Tea', price: 3.99, category: 'Hot Drinks' },
      { name: 'Hot Cocoa', price: 3.99, category: 'Hot Drinks' },
      { name: 'Hot Tea', price: 2.99, category: 'Hot Drinks' },
      { name: 'Shakes', price: 6.99, category: 'Shakes' },
      { name: 'Smoothies', price: 6.49, category: 'Smoothies' },
      { name: 'Smoothies', price: 6.49, category: 'Smoothies' },
      { name: 'Sparkling Soda', price: 3.99, category: 'Cold Drinks' },
      { name: 'Sparkling Soda', price: 3.99, category: 'Cold Drinks' },
      { name: 'Dirty Soda', price: 4.49, category: 'Cold Drinks' },
      { name: 'Snacks', price: 2.99, category: 'Snacks' },
      { name: 'Snacks', price: 2.99, category: 'Snacks' }
    ];
    
    return of(menuItems);
  }

  getCategories(): string[] {
    return [
      'Seasonal Drinks',
      'Iced Drinks',
      'Hot Drinks',
      'Blended',
      'Cold Drinks',
      'Shakes',
      'Smoothies',
      'Snacks'
    ];
  }
}
