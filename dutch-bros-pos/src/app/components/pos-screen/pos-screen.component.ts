import { Component, OnInit, signal, Signal, computed } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { MenuService } from '../../services/menu.service';
import { Product, ModifierChain, OrderItem } from '../../models/menu.model';
import { ModifierSelectorComponent } from '../modifier-selector/modifier-selector.component'; // Import the new component

@Component({
  selector: 'app-pos-screen',
  templateUrl: './pos-screen.component.html',
//   styleUrls: ['./pos-screen.component.css'],
  standalone: true,
  imports: [NgFor, NgIf, ModifierSelectorComponent]
})
export class PosScreenComponent implements OnInit {
  // Public signals for template access
  availableProducts!: Signal<Product[]>;

  constructor(private menuService: MenuService) {
    this.availableProducts = this.menuService.products;
  }
  
  // State for the currently selected item and its modifier chain
  selectedProduct = signal<Product | undefined>(undefined);
  selectedProductModifiers: Signal<ModifierChain | undefined> = computed(() => {
    const product = this.selectedProduct();
    if (product) {
      // Use the service function to get the correct chain reactively
      return this.menuService.getModifierChain(product.chainproductid.toString())();
    }
    return undefined;
  });

  // Signal for the running order list
  currentOrder = signal<OrderItem[]>([]);

  ngOnInit(): void {
    // The products are loaded asynchronously by the service's constructor
  }

  // Step 1: User selects a base product
  selectProduct(product: Product): void {
    this.selectedProduct.set(product);
  }

  // Step 2: User completes customization (received from ModifierSelectorComponent)
  addToOrder(item: OrderItem): void {
    this.currentOrder.update(items => [...items, item]);
    this.clearSelection();
  }

  // Cancel the customization panel
  clearSelection(): void {
    this.selectedProduct.set(undefined);
  }
}