import { Component, OnInit, signal, Signal, computed, ViewChild, ElementRef } from '@angular/core';
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
  styleUrls: ['./pos-screen.component.css'], // We will add this CSS file
  standalone: true,
  imports: [CommonModule, FormsModule, ModifierSelectorComponent, TranscriptionComponent, FilterProductsPipe]
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

  // --- UI EFFECTS & SCROLL ---
  @ViewChild('orderScroll') orderScroll?: ElementRef<HTMLDivElement>;
  lastAddedItemId = signal<string | undefined>(undefined);

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

  constructor(private menuService: MenuService, private http: HttpClient) {
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
    this.modalQuantity.set(1);
    this.editingCartItemId = undefined;
    this.cartItemSelections = undefined;
  }

  // Called from modal to close it
  clearSelection(): void {
    this.selectedProduct.set(undefined);
    this.cartItemSelections = undefined;
    this.editingCartItemId = undefined;
  }

  // --- ORDER PANEL (CART) METHODS ---
  
    addToOrder(item: OrderItem): void {
      // Delegate to unified add/merge logic
      this.addOrMergeItem(item);
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

  // --- SCROLL & HIGHLIGHT HELPERS ---
  private scrollToBottom(): void {
    const el = this.orderScroll?.nativeElement;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  // Build a canonical signature for an item ignoring quantity and id
  private itemSignature(i: OrderItem): string {
    const base = `${i.product_id}|${(i.size || '').toLowerCase()}`;
    const mods = [...(i.child_items || [])]
      .map(m => `${m.modifier_group}:${m.name}`.toLowerCase())
      .sort()
      .join(';');
    return `${base}|${mods}`;
  }

  // Add a new item or merge with an identical existing one by increasing quantity
  private addOrMergeItem(item: OrderItem): void {
    const incoming: OrderItem = { ...item };
    const sig = this.itemSignature(incoming);
    let merged = false;

    this.currentOrder.update(items => {
      const idx = items.findIndex(ex => this.itemSignature(ex) === sig);
      if (idx >= 0) {
        const existing = items[idx];
        const qtyToAdd = Math.max(1, incoming.quantity || 1);
        const updated: OrderItem = { ...existing, quantity: (existing.quantity || 1) + qtyToAdd };
        const next = [...items];
        next[idx] = updated;
        // highlight the merged row
        this.lastAddedItemId.set(updated.id!);
        setTimeout(() => this.scrollToBottom(), 0);
        merged = true;
        return next;
      } else {
        const newItem: OrderItem = {
          ...incoming,
          id: incoming.id || `item-${Date.now()}-${Math.random()}`,
        };
        // highlight the new row
        const next = [...items, newItem];
        this.lastAddedItemId.set(newItem.id!);
        setTimeout(() => this.scrollToBottom(), 0);
        return next;
      }
    });

    // Exit edit mode and close modal if open
    this.editingCartItemId = undefined;
    this.clearSelection();
  }

  // --- RECOGNIZED ITEMS INGESTION (SEQUENTIAL WITH ANIMATION) ---
  // Shape of a recognized item coming from transcription/mock pipeline
  private normalize(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  private findProductByHint(hint: string): Product | undefined {
    const norm = this.normalize(hint);
    // Prefer exact name match first
    let found = this.products().find(p => this.normalize(p.name) === norm);
    if (found) return found;
    // Fallback: substring contains
    return this.products().find(p => this.normalize(p.name).includes(norm) || norm.includes(this.normalize(p.name)));
  }

  private getCategoryNameForProduct(product: Product): string {
    const cat = this.categories().find(c => c.products.some(p => p.chainproductid === product.chainproductid));
    return cat?.name || 'drink';
  }

  private findOptionFuzzy(chain: ModifierChain, label: string): { groupId: string; optionId: string; optionName: string; price: number; multi: boolean } | undefined {
    const target = this.normalize(label);
    for (const g of chain.groups) {
      if (!g.options) continue;
      for (const o of g.options) {
        if (this.normalize(o.name).includes(target)) {
          return { groupId: g.id, optionId: o.id, optionName: o.name, price: o.price_adjustment, multi: !!g.multi_select };
        }
      }
    }
    return undefined;
  }

  private findSizeOption(chain: ModifierChain, sizeHint?: string): { optionId: string; optionName: string; price: number } | undefined {
    if (!sizeHint) return undefined;
    const sizeGroup = chain.groups.find(g => g.id === 'size' || this.normalize(g.name).includes('size'));
    if (!sizeGroup || !sizeGroup.options) return undefined;
    const target = this.normalize(sizeHint);
    const match = sizeGroup.options.find(o => this.normalize(o.name).startsWith(target) || this.normalize(o.name).includes(target));
    return match ? { optionId: match.id, optionName: match.name, price: match.price_adjustment } : undefined;
  }

  private findTemperatureOption(chain: ModifierChain, tempHint?: string): { groupId: string; optionId: string; optionName: string; price: number } | undefined {
    if (!tempHint) return undefined;
    const target = this.normalize(tempHint);
    const keywords = ['hot', 'iced', 'ice', 'blended'];
    const key = keywords.find(k => target.includes(k));
    if (!key) return undefined;
    for (const g of chain.groups) {
      if (!g.options) continue;
      for (const o of g.options) {
        const on = this.normalize(o.name);
        if (on.includes(key)) {
          return { groupId: g.id, optionId: o.id, optionName: o.name, price: o.price_adjustment };
        }
      }
    }
    return undefined;
  }

  // Public API: add an array of recognized items with animation and auto-scroll
  async addItemsSequentially(items: Array<{ product_hint: string; quantity?: number; size?: string; temperature?: string; modifiers?: string[] }>, delayMs: number = 600): Promise<void> {
    if (!items?.length) return;
    this.setActiveTab('cart');

    for (const rec of items) {
      try {
        const product = this.findProductByHint(rec.product_hint);
        if (!product) {
          console.warn('No product match for', rec.product_hint);
          continue;
        }

        const chain = this.menuService.getModifierChain(product.chainproductid.toString())();
        const selections: { [key: string]: string | string[] } = {};
        const child_items: OrderItem['child_items'] = [];
        let price = product.cost;
        let sizeName = 'medium'; // default

        if (chain) {
          // size
          const sizeSel = this.findSizeOption(chain, rec.size);
          if (sizeSel) {
            selections['size'] = sizeSel.optionId;
            sizeName = sizeSel.optionName.toLowerCase();
            price += sizeSel.price;
            child_items.push({ name: sizeSel.optionName, item_type: 'modifier', modifier_group: 'size', quantity: 1, unit_price: sizeSel.price });
          } else if (!rec.size) {
            // No size hint provided; try to use the default from chain
            const sizeGroup = chain.groups.find(g => g.id === 'size');
            if (sizeGroup && sizeGroup.default) {
              const defaultOpt = sizeGroup.options?.find(o => o.id === sizeGroup.default);
              if (defaultOpt) {
                selections['size'] = defaultOpt.id;
                sizeName = defaultOpt.name.toLowerCase();
                price += defaultOpt.price_adjustment;
                child_items.push({ name: defaultOpt.name, item_type: 'modifier', modifier_group: 'size', quantity: 1, unit_price: defaultOpt.price_adjustment });
              }
            }
          }

          // temperature
          const tempSel = this.findTemperatureOption(chain, rec.temperature);
          if (tempSel) {
            selections[tempSel.groupId] = tempSel.optionId;
            price += tempSel.price;
            child_items.push({ name: tempSel.optionName, item_type: 'modifier', modifier_group: tempSel.groupId, quantity: 1, unit_price: tempSel.price });
          }

          // other modifiers
          for (const m of rec.modifiers || []) {
            const found = this.findOptionFuzzy(chain, m);
            if (!found) continue;
            const existing = selections[found.groupId];
            if (found.multi) {
              const arr = Array.isArray(existing) ? existing : (existing ? [existing as string] : []);
              if (!arr.includes(found.optionId)) {
                selections[found.groupId] = [...arr, found.optionId];
                price += found.price;
                child_items.push({ name: found.optionName, item_type: 'modifier', modifier_group: found.groupId, quantity: 1, unit_price: found.price });
              }
            } else {
              if (existing !== found.optionId) {
                selections[found.groupId] = found.optionId;
                price += found.price;
                child_items.push({ name: found.optionName, item_type: 'modifier', modifier_group: found.groupId, quantity: 1, unit_price: found.price });
              }
            }
          }
        }

        const quantity = Math.max(1, rec.quantity || 1);
        const orderItem: OrderItem = {
          id: `item-${Date.now()}-${Math.random()}`,
          product_id: product.chainproductid.toString(),
          name: product.name,
          category: this.getCategoryNameForProduct(product),
          size: sizeName,
          quantity,
          unit_price: price, // unit price (single item)
          child_items
        };

        // push or merge and animate
        this.addOrMergeItem(orderItem);
        await new Promise(res => setTimeout(res, 0));
        // small delay between items
        await new Promise(res => setTimeout(res, delayMs));
      } catch (e) {
        console.error('Failed to add recognized item', rec, e);
      }
    }
  }

  // Accept a recognized order payload that can include order-level notes and customer name
  async addFromRecognized(payload: {
    items: Array<{ product_hint: string; quantity?: number; size?: string; temperature?: string; modifiers?: string[] }>,
    notes?: string,
    customer_name?: string
  }, delayMs: number = 600): Promise<void> {
    // Set order-level data immediately so it doesn't appear delayed
    if (payload.notes) this.orderNotes = payload.notes;
    if (payload.customer_name) this.customerName = payload.customer_name;
    await this.addItemsSequentially(payload.items, delayMs);
  }

  // Load a recognized payload from an assets JSON file and ingest it
  loadRecognizedFromFile(path: string = 'assets/mock/recognized-order.json'): void {
    this.http.get<any>(path).subscribe({
      next: (raw) => {
        const items = Array.isArray(raw?.items) ? raw.items : [];
        const mapped = items.map((it: any) => ({
          product_hint: it?.name ?? '',
          size: it?.size ?? undefined,
          temperature: it?.temperature ?? undefined,
          quantity: Math.max(1, it?.quantity ?? 1),
          modifiers: Array.isArray(it?.modifiers) ? it.modifiers.map((m: any) => m?.name).filter(Boolean) : []
        }));

        const payload = {
          items: mapped,
          notes: raw?.notes || undefined,
          customer_name: raw?.customer_name || undefined
        } as {
          items: Array<{ product_hint: string; quantity?: number; size?: string; temperature?: string; modifiers?: string[] }>,
          notes?: string,
          customer_name?: string
        };

        // Ingest with animation
        this.addFromRecognized(payload, 600);
      },
      error: (err) => {
        console.error('Failed to load recognized order JSON', err);
        alert('Could not load mock JSON. Check assets path and console for details.');
      }
    });
  }
}
