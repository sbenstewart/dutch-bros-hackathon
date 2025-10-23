import { Component, OnInit, signal, Signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common'; // Replaces NgFor/NgIf
import { MenuService } from '../../services/menu.service';
import { Product, ModifierChain, OrderItem, Category } from '../../models/menu.model';
import { ModifierSelectorComponent } from '../modifier-selector/modifier-selector.component';
import { TranscriptionComponent } from '../transcription/transcription.component';
import { FilterProductsPipe } from './filter-products.pipe';

@Component({
  selector: 'app-pos-screen',
  templateUrl: './pos-screen.component.html',
  styleUrls: ['./pos-screen.component.css'], // We will add this CSS file
  standalone: true,
  imports: [CommonModule, ModifierSelectorComponent, TranscriptionComponent, FilterProductsPipe]
})
export class PosScreenComponent implements OnInit {
  products: Signal<Product[]>;
  // --- STATE FOR SEARCH ---
  searchTerm = signal<string>('');

  
  // --- STATE FOR TABS ---
  activeTab = signal<'menu' | 'cart' | 'transcription'>('menu');

  // --- STATE FOR MENU ---
  categories: Signal<Category[]>;
  imagePath: Signal<string>;
  selectedCategory = signal<Category | undefined>(undefined);
  
  // --- STATE FOR CUSTOMIZATION MODAL ---
  selectedProduct = signal<Product | undefined>(undefined);
  selectedProductModifiers: Signal<ModifierChain | undefined> = computed(() => {
    const product = this.selectedProduct();
    if (product) {
      return this.menuService.getModifierChain(product.chainproductid.toString())();
    }
    return undefined;
  });

  // --- STATE FOR ORDER (CART) ---
  currentOrder = signal<OrderItem[]>([]);

    // --- STATE FOR CART ITEM EDITING ---
  cartItemSelections: { [key: string]: string | string[] } | undefined;
  editingCartItemId: string | undefined;
  
  // Computed totals based on the cart (like in the screenshot)
  orderSubtotal = computed(() => {
    return this.currentOrder().reduce((total, item) => {
      const price = item.unit_price || 0;
      const quantity = item.quantity || 1;
      return total + (price * quantity);
    }, 0);
  });
  
  orderTax = computed(() => {
    return this.orderSubtotal() * 0.08; // Example 8% tax rate
  });

  orderTotal = computed(() => {
    return this.orderSubtotal() + this.orderTax();
  });

  constructor(private menuService: MenuService) {
  this.categories = this.menuService.categories;
  this.imagePath = this.menuService.imagePath;
  this.products = this.menuService.products;
  }

  ngOnInit(): void {
    // Select the first category by default when data is ready
    const firstCategory = computed(() => this.categories()[0]);
    if (firstCategory()) {
      this.selectCategory(firstCategory());
    }
  }

  // --- TAB NAVIGATION ---
  setActiveTab(tab: 'menu' | 'cart' | 'transcription'): void {
    this.activeTab.set(tab);
  }
  
  // --- MENU PANEL METHODS ---
  // --- SEARCH BAR HANDLER ---
  setSearchTerm(term: string): void {
    this.searchTerm.set(term);
  }

  selectCategory(category: Category): void {
    this.selectedCategory.set(category);
    this.clearSelection(); 
  }

  // Click on a product card now *sets* the product, which opens the modal
  selectProduct(product: Product): void {
    this.selectedProduct.set(product);
  }

  // Called from modal to close it
  clearSelection(): void {
    this.selectedProduct.set(undefined);
  }

  // --- ORDER PANEL (CART) METHODS ---
  
    addToOrder(item: OrderItem): void {
      // If editing an existing item, treat as new unless modifyExisting is used
      const newItem: OrderItem = {
        ...item,
        id: `item-${Date.now()}-${Math.random()}`,
      };
      this.currentOrder.update(items => [...items, newItem]);
      this.editingCartItemId = undefined;
      this.clearSelection();
    }

    modifyExistingItem(item: OrderItem): void {
      if (!this.editingCartItemId) return;
      this.currentOrder.update(items => items.map(i => i.id === this.editingCartItemId ? { ...item, id: i.id } : i));
      this.editingCartItemId = undefined;
      this.clearSelection();
    }

  incrementQuantity(itemId: string): void {
    this.currentOrder.update(items =>
      items.map(item =>
        item.id === itemId
          ? { ...item, quantity: (item.quantity || 1) + 1 } 
          : item
      )
    );
  }

  decrementQuantity(itemId: string): void {
    this.currentOrder.update(items =>
      items.map(item =>
        item.id === itemId && (item.quantity || 1) > 1
          ? { ...item, quantity: (item.quantity || 1) - 1 }
          : item
      )
    );
  }

  removeFromOrder(itemId: string): void {
    this.currentOrder.update(items =>
      items.filter(item => item.id !== itemId)
    );
  }

  // Helper function to display modifiers cleanly in the cart
  formatModifiers(item: OrderItem): string {
    const mods = item.child_items.map(mod => mod.name);
    return [...mods].join(', ');
  }

    // Called when clicking a cart item to edit
    editCartItem(item: OrderItem): void {
      // Track which cart item is being edited
      this.editingCartItemId = item.id;
      // Map child_items to selections object using option IDs
      const selections: { [key: string]: string | string[] } = {};
      // Find the product and its modifier chain
      const prod = this.products().find(p => p.chainproductid.toString() === item.product_id);
      const modifierChain = prod ? this.menuService.getModifierChain(prod.chainproductid.toString())() : undefined;
      if (modifierChain) {
        item.child_items.forEach(mod => {
          // Find the group and option by name
          const group = modifierChain.groups.find(g => g.id === mod.modifier_group);
          const option = group?.options?.find(o => o.name === mod.name);
          if (!option) return;
          // If multi-select, accumulate as array
          if (group?.multi_select) {
            if (selections[mod.modifier_group]) {
              (selections[mod.modifier_group] as string[]).push(option.id);
            } else {
              selections[mod.modifier_group] = [option.id];
            }
          } else {
            selections[mod.modifier_group] = option.id;
          }
        });
        this.cartItemSelections = selections;
      } else {
        this.cartItemSelections = undefined;
      }
      // Set selected product and open modal
      if (prod) {
        this.selectedProduct.set(prod);
      }
    }
}
