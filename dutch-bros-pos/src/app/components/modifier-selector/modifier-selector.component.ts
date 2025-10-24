import { Component, Input, Output, EventEmitter, signal, computed, WritableSignal, Signal, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Product, ModifierChain, ModifierGroup, ModifierOption, OrderItem } from '../../models/menu.model';
import { MenuService } from '../../services/menu.service'; // We need this for the image path

// Type to store the user's selections
type Selections = { [groupId: string]: string | string[] };

@Component({
  selector: 'app-modifier-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modifier-selector.component.html',
  styleUrls: ['./modifier-selector.component.css'] // We will create this
})
export class ModifierSelectorComponent implements OnInit, OnChanges {
  // --- Inputs / Outputs ---
  @Input({ required: true }) product!: Product;
  @Input({ required: true }) modifierChain!: ModifierChain;
  @Input() initialSelections?: Selections;
  @Input() editingCartItemId?: string;
  @Input() quantityFromCart?: number;
  @Input() autoSubmit?: boolean; // When true, auto-emits after initializing selections
  @Output() orderItemReady = new EventEmitter<OrderItem>();
  @Output() modifyItem = new EventEmitter<OrderItem>();
  @Output() cancel = new EventEmitter<void>();

  // --- Internal State Signals ---
  imagePath: Signal<string>;
  selectedModifiers: WritableSignal<Selections> = signal({});
  quantity = signal(1);
  specialInstructions = signal('');

  // --- Computed Price & Summary ---
  
  // This signal calculates the price for a *single* item
  singleItemPrice: Signal<number> = computed(() => {
    let price = this.product.cost;
    const selections = this.selectedModifiers();

    // 1. Add Size adjustment
    const sizeGroup = this.modifierChain.groups.find(g => g.id === 'size');
    if (sizeGroup && selections['size']) {
      const sizeId = selections['size'] as string;
      const sizeOption = sizeGroup.options?.find(o => o.id === sizeId);
      if (sizeOption) {
        price += sizeOption.price_adjustment;
      }
    }

    // 2. Add all other modifier adjustments
    for (const group of this.modifierChain.groups) {
      if (group.id === 'size' || !group.options) continue; // Skip size (done) and groups with no options

      const selection = selections[group.id];
      if (!selection) continue;

      const selectedIds = Array.isArray(selection) ? selection : [selection];
      for (const optionId of selectedIds) {
        const option = group.options.find(o => o.id === optionId);
        if (option) {
          price += option.price_adjustment;
        }
      }
    }
    return price;
  });

  // This signal calculates the total price (item price * quantity)
  totalPrice: Signal<number> = computed(() => {
    return this.singleItemPrice() * this.quantity();
  });

  // This signal creates the "Customizations:" summary list
  customizationSummary: Signal<{ name: string, price: number }[]> = computed(() => {
    const summary: { name: string, price: number }[] = [];
    const selections = this.selectedModifiers();

    for (const group of this.modifierChain.groups) {
      if (!group.options) continue;

      const selection = selections[group.id];
      if (!selection) continue;

      const selectedIds = Array.isArray(selection) ? selection : [selection];
      for (const optionId of selectedIds) {
        const option = group.options.find(o => o.id === optionId);
        if (option) {
          summary.push({ name: option.name, price: option.price_adjustment });
        }
      }
    }
    return summary;
  });

  constructor(private menuService: MenuService) {
    this.imagePath = this.menuService.imagePath; // Get CDN path
  }

  private didAutoSubmit = false;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['quantityFromCart'] && changes['quantityFromCart'].currentValue !== undefined) {
      this.quantity.set(changes['quantityFromCart'].currentValue);
    }
    if (changes['initialSelections'] && changes['initialSelections'].currentValue) {
      this.selectedModifiers.set(changes['initialSelections'].currentValue);
    } else if (!this.editingCartItemId) {
      // This is not an edit, so set defaults
      const defaults: Selections = {};
      for (const group of this.modifierChain.groups) {
        if (group.default) {
          defaults[group.id] = group.default as string;
        }
      }
      this.selectedModifiers.set(defaults);
    }

    // If autoSubmit is requested, trigger it once after selections are ready
    if (this.autoSubmit && !this.didAutoSubmit) {
      // Defer to allow bindings/signals to settle
      setTimeout(() => {
        // Guard again in case component unmounted
        if (this.autoSubmit && !this.didAutoSubmit) {
          this.didAutoSubmit = true;
          this.addToCart();
        }
      }, 0);
    }
  }

  ngOnInit() {
    // The logic from here is now handled in ngOnChanges to react to every input change
  }

  // --- Modal Actions ---

  close() {
    this.cancel.emit();
  }

  // This is the main logic for selecting/deselecting an option
  selectOption(group: ModifierGroup, option: ModifierOption) {
    this.selectedModifiers.update(current => {
      const newSelections = { ...current };
      const currentSelection = newSelections[group.id];

      if (group.multi_select) {
        // Handle Checkbox logic
        const currentArray = Array.isArray(currentSelection) ? currentSelection : [];
        if (currentArray.includes(option.id)) {
          // De-select
          newSelections[group.id] = currentArray.filter(id => id !== option.id);
        } else {
          // Select
          newSelections[group.id] = [...currentArray, option.id];
        }
      } else {
        // Handle Radio button logic
        newSelections[group.id] = option.id;
      }
      return newSelections;
    });
  }

  // Check if an option is currently active
  isSelected(groupId: string, optionId: string): boolean {
    const selection = this.selectedModifiers()[groupId];
    if (Array.isArray(selection)) {
      return selection.includes(optionId);
    }
    return selection === optionId;
  }

  // Quantity controls
  incQty() {
    this.quantity.update(q => q + 1);
  }
  decQty() {
    this.quantity.update(q => (q > 1 ? q - 1 : 1));
  }

  // Build and emit the final OrderItem
  buildOrderItem(): OrderItem {
    const selections = this.selectedModifiers();
    const size = (selections['size'] as string) || 'medium';

    // Build the child_items array for the cart
    const child_items: OrderItem['child_items'] = [];
    this.customizationSummary().forEach(mod => {
      // Find the group this modifier belongs to
      const group = this.modifierChain.groups.find(g => g.options?.some(o => o.name === mod.name));
      child_items.push({
        name: mod.name,
        item_type: 'modifier',
        modifier_group: group?.id || 'unknown',
        quantity: 1, // Modifiers are 1 per parent item
        unit_price: mod.price
      });
    });

    return {
      product_id: this.product.chainproductid.toString(),
      name: this.product.name,
      category: 'drink', // You might want to pass this in
      size: size,
      quantity: this.quantity(),
      unit_price: this.singleItemPrice(), // Send the price for *one* item
      child_items: child_items
    };
  }

  addToCart() {
    this.orderItemReady.emit(this.buildOrderItem());
  }

  modifyExisting() {
    this.modifyItem.emit(this.buildOrderItem());
  }

  // Helper to get the correct product image for the modal
  getProductImage(): string {
    const defaultImage = this.imagePath() + this.product.imagefilename;
    if (!this.product.images) {
      return defaultImage;
    }
    // Try to find a high-res image, fall back to default
    const largeImage = this.product.images.find(img => img.groupname === 'mobile-webapp-customize');
    return largeImage ? this.imagePath() + largeImage.filename : defaultImage;
  }
}
