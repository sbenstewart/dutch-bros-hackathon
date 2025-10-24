import { Component, OnInit, signal, Signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common'; // Replaces NgFor/NgIf
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MenuService } from '../../services/menu.service';
import { Product, ModifierChain, OrderItem, Category } from '../../models/menu.model';
import { ModifierSelectorComponent } from '../modifier-selector/modifier-selector.component';
import { TranscriptionComponent } from '../transcription/transcription.component';
import { FilterProductsPipe } from './filter-products.pipe';

@Component({
  selector: 'app-pos-screen',
  templateUrl: './pos-screen.component.html',
  styleUrls: ['./pos-screen.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, ModifierSelectorComponent, TranscriptionComponent, FilterProductsPipe]
})
export class PosScreenComponent implements OnInit {
  products: Signal<Product[]>;
  // --- STATE FOR SEARCH ---
  searchTerm = signal<string>('');

  
  // --- STATE FOR TABS ---
  activeTab = signal<'menu' | 'cart' | 'transcription'>('menu');

  // --- TIME SLIDER STATE ---
  currentMinutes = signal<number>(540); // 9:00 AM default
  displayTime = signal<string>('09:00');
  
  // --- STATE FOR MENU ---
  categories: Signal<Category[]>;
  imagePath: Signal<string>;
  selectedCategory = signal<Category | undefined>(undefined);
  
  // --- STATE FOR CUSTOMIZATION MODAL ---
  selectedProduct = signal<Product | undefined>(undefined);
  modalQuantity = signal<number>(1);
  selectedProductModifiers: Signal<ModifierChain | undefined> = computed(() => {
    const product = this.selectedProduct();
    if (product) {
      return this.menuService.getModifierChain(product.chainproductid.toString())();
    }
    return undefined;
  });

  // --- STATE FOR ORDER (CART) ---
  currentOrder = signal<OrderItem[]>([]);
  customerName: string = '';
  orderNotes: string = '';

    // --- STATE FOR CART ITEM EDITING ---
  cartItemSelections: { [key: string]: string | string[] } | undefined;
  editingCartItemId: string | undefined;
  
  orderSubtotal = computed(() => {
    return this.currentOrder().reduce((total, item) => {
      const price = item.unit_price || 0;
      const quantity = item.quantity || 1;
      return total + (price * quantity);
    }, 0);
  });
  
  orderTax = computed(() => {
    return this.orderSubtotal() * 0.08;
  });

  orderTotal = computed(() => {
    return this.orderSubtotal() + this.orderTax();
  });

  constructor(private menuService: MenuService, private http: HttpClient) {
  this.categories = this.menuService.categories;
  this.imagePath = this.menuService.imagePath;
  this.products = this.menuService.products;
  }

  ngOnInit(): void {
    const firstCategory = computed(() => this.categories()[0]);
    if (firstCategory()) {
      this.selectCategory(firstCategory());
    }
    
    // Initialize time
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    this.currentMinutes.set(minutes);
    this.displayTime.set(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
  }
  
  // --- TIME SLIDER METHODS ---
  onTimeSliderChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const minutes = parseInt(input.value);
    this.currentMinutes.set(minutes);
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const timeString = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    this.displayTime.set(timeString);
    
    // Debounce the API call
    this.setTimeDebounced(timeString);
  }

  private timeoutId: any;
  private setTimeDebounced(time: string): void {
    clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => {
      this.setTime(time);
    }, 500); // Wait 500ms after user stops sliding
  }

  setTime(time: string): void {
    fetch('http://localhost:8000/api/time/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time })
    })
    .then(res => res.json())
    .then(data => console.log('✅ Time set:', data))
    .catch(err => console.error('❌ Error setting time:', err));
  }

  resetTime(): void {
    fetch('http://localhost:8000/api/time/reset', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      console.log('✅ Time reset:', data);
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      this.currentMinutes.set(minutes);
      this.displayTime.set(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
    })
    .catch(err => console.error('❌ Error resetting time:', err));
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

  selectProduct(product: Product): void {
    this.selectedProduct.set(product);
    this.modalQuantity.set(1);
    this.editingCartItemId = undefined;
    this.cartItemSelections = undefined;
  }

  clearSelection(): void {
    this.selectedProduct.set(undefined);
    this.cartItemSelections = undefined;
    this.editingCartItemId = undefined;
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

  formatModifiers(item: OrderItem): string {
    const mods = item.child_items.map(mod => mod.name);
    return [...mods].join(', ');
  }

  // Get the image URL for a cart item
  getCartItemImage(item: OrderItem): string {
    // Find the product by chainproductid (stored as product_id in cart)
    const product = this.products().find(p => p.chainproductid.toString() === item.product_id);
    if (product && product.imagefilename) {
      return this.imagePath() + product.imagefilename;
    }
    // Return a placeholder if image not found
    return this.imagePath() + 'placeholder.png';
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
        this.modalQuantity.set(item.quantity || 1);
      }
    }

    // Submit order to backend
    submitOrder(): void {
      if (!this.customerName.trim()) {
        alert('Please enter a customer name');
        return;
      }

      if (this.currentOrder().length === 0) {
        alert('Cart is empty');
        return;
      }

      const payload = {
        customer_name: this.customerName.trim(),
        items: this.currentOrder(),
        notes: this.orderNotes.trim() || undefined
      };

      this.http.post('http://localhost:8000/submit-order', payload)
        .subscribe({
          next: (response: any) => {
            alert(`Order submitted successfully!\nOrder ID: ${response.order_id}\nCustomer: ${response.message}`);
            // Clear cart, customer name, and notes after successful submission
            this.currentOrder.set([]);
            this.customerName = '';
            this.orderNotes = '';
            // Switch to menu tab
            this.setActiveTab('menu');
          },
          error: (error) => {
            console.error('Error submitting order:', error);
            alert(`Failed to submit order: ${error.error?.detail || error.message}`);
          }
        });
    }
}
