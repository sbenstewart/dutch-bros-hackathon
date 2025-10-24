import { Component, OnInit, OnDestroy, signal, Signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common'; // Replaces NgFor/NgIf
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranscriptionService } from '../../services/transcription.service';
import { MenuService } from '../../services/menu.service';
import { Product, ModifierChain, OrderItem, Category } from '../../models/menu.model';
import { ModifierSelectorComponent } from '../modifier-selector/modifier-selector.component';
import { TranscriptionComponent } from '../transcription/transcription.component';
import { FilterProductsPipe } from './filter-products.pipe';
import { RecommendationService } from '../../services/recommendation.service';

@Component({
  selector: 'app-pos-screen',
  templateUrl: './pos-screen.component.html',
  styleUrls: ['./pos-screen.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, ModifierSelectorComponent, TranscriptionComponent, FilterProductsPipe]
})
export class PosScreenComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  products: Signal<Product[]>;
  recommendations: Signal<{ product: Product; reason: string }[]>;
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

  // --- UI EFFECTS & SCROLL ---
  @ViewChild('orderScroll') orderScroll?: ElementRef<HTMLDivElement>;
  lastAddedItemId = signal<string | undefined>(undefined);

    // --- STATE FOR CART ITEM EDITING ---
  cartItemSelections: { [key: string]: string | string[] } | undefined;
  editingCartItemId: string | undefined;
  autoSubmitModal: boolean = false; // when true, the modifier modal will auto-submit once
  private pendingModalResolve?: () => void; // resolves when modal emits and cart updates
  
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

constructor(
  private menuService: MenuService, 
  private http: HttpClient,
  private transcriptionService: TranscriptionService,
  private recommendationService: RecommendationService
) {
  this.categories = this.menuService.categories;
  this.imagePath = this.menuService.imagePath;
  this.products = this.menuService.products;
  this.recommendations = this.recommendationService.createRecommendationSignal(
      this.currentOrder,
      this.products
    );
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
  
  this.transcriptionService.transcriptionStopped$.pipe(
  takeUntil(this.destroy$)
).subscribe(() => {
  console.log('🎤 Transcription stopped - fetching result in 2 seconds...');
  setTimeout(() => {
    this.fetchTranscriptionResult();
  }, 5000);
});
}
// ✅ ADD THIS ENTIRE METHOD
private fetchTranscriptionResult(): void {
  console.log('📡 Fetching transcription result...');
  
  this.http.get<any>('http://localhost:8000/api/get-transcription-result').subscribe({
    next: (raw) => {
      console.log('✅ Full Response received:', raw);
      
      if (raw?.status === 'NO_DATA' || raw?.status === 'PROCESSING') {
        console.log('⏳ No data available yet');
        return;
      }
      
      if (raw?.status === 'ERROR') {
        console.error('❌ Transcription error:', raw?.detail);
        return;
      }
      
      const orderData = raw?.data?.order;
      
      if (!orderData || !orderData.items) {
        console.error('No order items found in response');
        return;
      }
      
      const items = orderData.items;
      const mapped = items.map((it: any) => ({
        product_hint: it?.name ?? '',
        size: it?.size ?? undefined,
        temperature: it?.temperature ?? undefined,
        quantity: Math.max(1, it?.quantity ?? 1),
        modifiers: Array.isArray(it?.child_items) 
          ? it.child_items.map((m: any) => m?.name).filter(Boolean) 
          : []
      }));

      const payload = {
        items: mapped,
        notes: orderData?.notes || undefined,
        customer_name: orderData?.customer_name || undefined
      };

      console.log('Final payload:', payload);
      this.addFromRecognized(payload, 600);
      console.log('✅ Order processing complete');
    },
    error: (err) => {
      console.error('❌ HTTP Error:', err);
    }
  });
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
  // ✅ ADD THIS METHOD
ngOnDestroy(): void {
  this.destroy$.next();
  this.destroy$.complete();
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
      // Reset auto-submit flag once an item is produced
      this.autoSubmitModal = false;
      // Delegate to unified add/merge logic
      this.addOrMergeItem(item);
      // Resolve pending modal promise if any
      if (this.pendingModalResolve) {
        this.pendingModalResolve();
        this.pendingModalResolve = undefined;
      }
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

  getCartItemImage(item: OrderItem): string {
    const product = this.products().find(p => p.chainproductid.toString() === item.product_id);
    if (product && product.imagefilename) {
      return this.imagePath() + product.imagefilename;
    }
    return this.imagePath() + 'placeholder.png';
  }

    editCartItem(item: OrderItem): void {
      this.editingCartItemId = item.id;
      const selections: { [key: string]: string | string[] } = {};
      const prod = this.products().find(p => p.chainproductid.toString() === item.product_id);
      const modifierChain = prod ? this.menuService.getModifierChain(prod.chainproductid.toString())() : undefined;
      if (modifierChain) {
        item.child_items.forEach(mod => {
          const group = modifierChain.groups.find(g => g.id === mod.modifier_group);
          // Handle range types (like sweetness)
          if (group?.type === 'range') {
             // Extract number from '5 pumps'
             const value = mod.name.match(/\d+/)?.[0];
             if (value) {
                selections[mod.modifier_group] = value;
             }
             return;
          }
          // Handle option types
          const option = group?.options?.find(o => o.name === mod.name);
          if (!option) return;
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
      if (prod) {
        this.selectedProduct.set(prod);
        this.modalQuantity.set(item.quantity || 1);
      }
    }

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
            this.currentOrder.set([]);
            this.customerName = '';
            this.orderNotes = '';
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

  // Helper: open the modifier modal with selections and optionally auto-submit
  private openModifierModalForProduct(product: Product, selections: { [key: string]: string | string[] }, quantity: number, autoSubmit: boolean = true): Promise<void> {
    return new Promise<void>((resolve) => {
      this.pendingModalResolve = resolve;
      this.selectedProduct.set(product);
      this.cartItemSelections = selections;
      this.modalQuantity.set(Math.max(1, quantity || 1));
      this.autoSubmitModal = autoSubmit;
    });
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

        if (chain) {
          // size
          const sizeSel = this.findSizeOption(chain, rec.size);
          if (sizeSel) {
            selections['size'] = sizeSel.optionId;
          }

          // temperature
          const tempSel = this.findTemperatureOption(chain, rec.temperature);
          if (tempSel) {
            selections[tempSel.groupId] = tempSel.optionId;
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
              }
            } else {
              if (existing !== found.optionId) {
                selections[found.groupId] = found.optionId;
              }
            }
          }

          // --- START: MODIFIED GENERIC DEFAULT MODIFIER LOGIC ---
          // Apply defaults for any groups not explicitly set by the item
          for (const group of chain.groups) {
            const groupAlreadySet = selections.hasOwnProperty(group.id);

            // Skip if already set or no default exists
            if (groupAlreadySet || group.default == null) {
              continue;
            }
            
            // Case 1: Default is from an 'options' list (e.g., size, ice, temp)
            if (group.options && Array.isArray(group.options)) {
              const defaultOpt = group.options.find(o => o.id === group.default);

              if (defaultOpt) {
                // Add to selections map
                selections[group.id] = defaultOpt.id;
              }
            } 
            // Case 2: Default is from a 'range' (e.g., sweetness pumps)
            else if (group.type === 'range') {
              const defaultValue = group.default; // e.g., 5
              // Add to selections map (storing the value)
              selections[group.id] = defaultValue.toString();
            }
            // Case 3: Other types (like 'info') can be ignored as they won't have defaults to apply
          }
          // --- END: MODIFIED GENERIC DEFAULT MODIFIER LOGIC ---

        }

        const quantity = Math.max(1, rec.quantity || 1);
        // Open the modal with defaults and auto-submit to populate back into the cart
        await this.openModifierModalForProduct(product, selections, quantity, true);
        // small delay between items for visual pacing
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
 loadRecognizedFromFile(path: string = 'http://localhost:8000/api/get-transcription-result'): void {
  console.log('🚀 Starting fetch from:', path);
  
  this.http.get<any>(path).subscribe({
    next: (raw) => {
      console.log('✅ Full Response received:', raw);
      
      if (raw?.status === 'NO_DATA' || raw?.status === 'PROCESSING') {
        console.log('⏳ No data available yet');
        return;
      }
      
      if (raw?.status === 'ERROR') {
        console.error('❌ Transcription error:', raw?.detail);
        console.error(`Error: ${raw.detail}`);
        return;
      }
      
      console.log('📦 Processing successful response...');
      
      const orderData = raw?.data?.order;
      console.log('Order data:', orderData);
      
      if (!orderData || !orderData.items) {
        console.error('No order items found in response');
        return;
      }
      
      const items = orderData.items;
      console.log('Items extracted:', items);
      
      const mapped = items.map((it: any) => ({
        product_hint: it?.name ?? '',
        size: it?.size ?? undefined,
        temperature: it?.temperature ?? undefined,
        quantity: Math.max(1, it?.quantity ?? 1),
        modifiers: Array.isArray(it?.child_items) 
          ? it.child_items.map((m: any) => m?.name).filter(Boolean) 
          : []
      }));

      console.log('Mapped items:', mapped);

      const payload = {
        items: mapped,
        notes: orderData?.notes || undefined,
        customer_name: orderData?.customer_name || undefined
      } as {
        items: Array<{ 
          product_hint: string; 
          quantity?: number; 
          size?: string; 
          temperature?: string; 
          modifiers?: string[] 
        }>,
        notes?: string,
        customer_name?: string
      };

      console.log('Final payload:', payload);

      this.addFromRecognized(payload, 600);
      console.log('✅ Order added successfully');
    },
    error: (err) => {
      console.error('❌ HTTP Error:', err);
      console.error('Error status:', err?.status);
      console.error('Error message:', err?.message);
    }
  });
}
}