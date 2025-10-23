// src/app/models/menu.model.ts

// Base structure for a Product from menu.json
export interface Product {
  chainproductid: number;
  name: string;
  cost: number; // base price
  description?: string;
  imagefilename?: string;
  images?: { groupname: string; filename: string; isdefault?: boolean; }[];
  // Simplified version of the full properties from menu.json
}

// Simplified structure for Category from menu.json
export interface Category {
  id: number;
  name: string;
  products: Product[];
  // Assuming a flattened list of available products is derived from this structure
}

// --- Modifier Models based on modifiers.json ---

export interface ModifierOption {
  id: string;
  name: string;
  price_adjustment: number;
  dairy_free?: boolean;
}

export interface ModifierGroup {
  id: string; // e.g., 'size', 'milk', 'sweetness'
  name: string;
  required: boolean;
  default?: string | number;
  multi_select?: boolean;
  type?: 'range' | 'info';
  options?: ModifierOption[];
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  message?: string;
}

export interface ModifierChain {
  id: string;
  name: string;
  description: string;
  groups: ModifierGroup[];
}

export interface ModifiersData {
  modifier_chains: { [key: string]: ModifierChain };
  product_modifier_mappings: { [key: string]: string }; // Maps product ID (string representation of chainproductid) to chain ID
  default_chain: string;
}

export interface OrderItem {
  id?: string; // <-- ADD THIS LINE (Unique ID for cart management)
  product_id: string; // string version of chainproductid
  name: string;
  category: string;
  size: string;
  quantity: number;
  unit_price: number;
  child_items: {
    name: string;
    item_type: 'modifier';
    modifier_group: string;
    quantity: number;
    unit_price: number;
  }[];
}