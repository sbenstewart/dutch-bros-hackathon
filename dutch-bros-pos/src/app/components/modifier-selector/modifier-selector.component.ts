import { Component, Input, signal, computed, Output, EventEmitter, OnInit } from '@angular/core';
import { NgFor, NgIf, JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModifierChain, ModifierGroup, ModifierOption, Product, OrderItem } from '../../models/menu.model';

@Component({
  selector: 'app-modifier-selector',
  templateUrl: './modifier-selector.component.html',
//   styleUrls: ['./modifier-selector.component.css'],
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, JsonPipe] // Use standalone component imports
})
export class ModifierSelectorComponent implements OnInit {
  @Input({ required: true }) product!: Product;
  @Input({ required: true }) modifierChain!: ModifierChain;

  @Output() orderItemReady = new EventEmitter<OrderItem>();
  @Output() cancel = new EventEmitter<void>();

  // Signal to hold the current raw selections (key: group.id, value: optionId or array of optionIds/number)
  selectedOptions = signal<Record<string, string | string[] | number>>({});
  
  // Computed Signal to calculate the final price
  finalPrice = computed(() => {
    let price = this.product.cost;
    const selections = this.selectedOptions();

    // Iterate through all modifier groups in the chain
    for (const group of this.modifierChain.groups) {
      const selectionValue = selections[group.id];

      if (group.options) {
        // Handle Single-Select and Multi-Select Options
        const selectedIds = Array.isArray(selectionValue) ? selectionValue : (selectionValue ? [selectionValue] : []);

        for (const optionId of selectedIds) {
          const option = group.options.find(o => o.id === optionId);
          if (option) {
            price += option.price_adjustment;
          }
        }
      }
    }
    
    // Price adjustment rules (size) are applied by using the appropriate option's price_adjustment
    return price;
  });

  ngOnInit(): void {
    // Set initial defaults when the component loads
    this.setInitialDefaults();
  }
  
  private setInitialDefaults(): void {
      const defaults: Record<string, string | string[] | number> = {};
      
      for (const group of this.modifierChain.groups) {
          if (group.default !== undefined) {
              defaults[group.id] = group.default;
          } else if (group.multi_select) {
              defaults[group.id] = [];
          } else if (group.type === 'range') {
              // Range default is handled by the group.default property
          }
      }
      this.selectedOptions.set(defaults);
  }

  // Method to handle updates from UI inputs (used by template)
  updateSelection(groupId: string, event: Event, isMultiSelect: boolean = false): void {
    const target = event.target as HTMLInputElement;
    const value = target.value;
    
    if (isMultiSelect) {
      this.selectedOptions.update(current => {
          const currentSelections = (current[groupId] as string[] || []);
          if (target.checked) {
              return { ...current, [groupId]: [...currentSelections, value] };
          } else {
              return { ...current, [groupId]: currentSelections.filter(id => id !== value) };
          }
      });
    } else if (target.type === 'range') {
      this.selectedOptions.update(current => ({ 
        ...current, 
        [groupId]: target.valueAsNumber 
      }));
    } else {
      // Single select (radio buttons)
      this.selectedOptions.update(current => ({ 
        ...current, 
        [groupId]: value 
      }));
    }
  }

  // Helper to format price adjustment for display
  getAdjustment(adjustment: number): string {
    if (adjustment === 0) return '';
    return adjustment > 0 ? ` (+$${adjustment.toFixed(2)})` : ` (-$${Math.abs(adjustment).toFixed(2)})`;
  }
  
  // Logic to finalize and submit the order item (TODO: Implement server call)
  submitOrder(): void {
      // Logic to transform selections into the required OrderItem/child_items format
      const orderItem: OrderItem = {
          product_id: this.product.chainproductid.toString(),
          name: this.product.name,
          category: 'drink', // Assuming based on modifier chains
          size: this.selectedOptions()['size'] as string,
          quantity: 1,
          unit_price: this.finalPrice(),
          child_items: [] // TODO: Logic to build child_items from this.selectedOptions()
      };
      
      this.orderItemReady.emit(orderItem);
      // In a later phase, this will call the AWS Service
  }
}