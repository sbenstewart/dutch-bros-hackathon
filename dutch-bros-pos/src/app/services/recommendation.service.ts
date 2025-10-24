import { Injectable, Signal, computed } from '@angular/core';
import { Product, OrderItem } from '../models/menu.model';

export interface Recommendation {
  product: Product;
  reason: string;
  score: number;
}

@Injectable({
  providedIn: 'root'
})
export class RecommendationService {

  constructor() {}

  createRecommendationSignal(
    currentOrderSignal: Signal<OrderItem[]>,
    allProductsSignal: Signal<Product[]>
  ): Signal<Recommendation[]> {
    return computed(() => {
      const order = currentOrderSignal();
      const allProducts = allProductsSignal();

      if (order.length === 0) {
        return [];
      }

      // Get only snacks - filter by name only (no category field)
      const snacks = allProducts.filter(p => {
        const name = (p.name || '').toLowerCase();
        return name.includes('muffin') || name.includes('granola');
      });

      if (snacks.length === 0) {
        return [];
      }

      // Items already in cart
      const cartProductIds = new Set(order.map(item => item.product_id));
      const availableSnacks = snacks.filter(s => !cartProductIds.has(s.chainproductid.toString()));

      if (availableSnacks.length === 0) {
        return [];
      }

      // Combine all order item names
      const orderText = order.map(item => (item.name || '').toLowerCase()).join(' ');
      
      const recommendations = new Map<string, Recommendation>();

      // Find snacks
      const chocolateMuffin = availableSnacks.find(s => s.name.toLowerCase().includes('chocolate chip'));
      const lemonMuffin = availableSnacks.find(s => s.name.toLowerCase().includes('lemon'));
      const orangeMuffin = availableSnacks.find(s => s.name.toLowerCase().includes('orange'));
      const granola = availableSnacks.find(s => s.name.toLowerCase().includes('granola'));

      // LATTE drinks
      if (orderText.includes('latte') && !orderText.includes('mocha')) {
        if (chocolateMuffin) {
          recommendations.set(chocolateMuffin.chainproductid.toString(), {
            product: chocolateMuffin,
            reason: 'Perfect latte pairing!',
            score: 95
          });
        }
        if (lemonMuffin) {
          recommendations.set(lemonMuffin.chainproductid.toString(), {
            product: lemonMuffin,
            reason: 'Light & refreshing combo',
            score: 88
          });
        }
      }

      // MOCHA drinks
      else if (orderText.includes('mocha')) {
        if (chocolateMuffin) {
          recommendations.set(chocolateMuffin.chainproductid.toString(), {
            product: chocolateMuffin,
            reason: 'Double chocolate heaven!',
            score: 98
          });
        }
        if (orangeMuffin) {
          recommendations.set(orangeMuffin.chainproductid.toString(), {
            product: orangeMuffin,
            reason: 'Chocolate & citrus twist',
            score: 85
          });
        }
      }

      // MATCHA + LEMONADE combo
      else if (orderText.includes('matcha') && orderText.includes('lemonade')) {
        if (orangeMuffin) {
          recommendations.set(orangeMuffin.chainproductid.toString(), {
            product: orangeMuffin,
            reason: 'Citrus complements matcha!',
            score: 95
          });
        }
        if (granola) {
          recommendations.set(granola.chainproductid.toString(), {
            product: granola,
            reason: 'Light & healthy pairing',
            score: 90
          });
        }
      }
      
      // MATCHA LATTE
      else if (orderText.includes('matcha') && orderText.includes('latte')) {
        if (granola) {
          recommendations.set(granola.chainproductid.toString(), {
            product: granola,
            reason: 'Healthy matcha combo',
            score: 92
          });
        }
        if (lemonMuffin) {
          recommendations.set(lemonMuffin.chainproductid.toString(), {
            product: lemonMuffin,
            reason: 'Refreshing matcha pair',
            score: 87
          });
        }
      }

      // CHAI drinks
      else if (orderText.includes('chai')) {
        if (lemonMuffin) {
          recommendations.set(lemonMuffin.chainproductid.toString(), {
            product: lemonMuffin,
            reason: 'Spice meets citrus!',
            score: 94
          });
        }
        if (chocolateMuffin) {
          recommendations.set(chocolateMuffin.chainproductid.toString(), {
            product: chocolateMuffin,
            reason: 'Sweet chai companion',
            score: 88
          });
        }
      }

      // COFFEE / COLD BREW / AMERICANO
      else if (orderText.includes('coffee') || orderText.includes('brew') || 
               orderText.includes('americano') || orderText.includes('espresso')) {
        if (chocolateMuffin) {
          recommendations.set(chocolateMuffin.chainproductid.toString(), {
            product: chocolateMuffin,
            reason: 'Classic coffee pairing!',
            score: 96
          });
        }
        if (granola) {
          recommendations.set(granola.chainproductid.toString(), {
            product: granola,
            reason: 'Energizing breakfast',
            score: 85
          });
        }
      }

      // REBEL / ENERGY drinks
      else if (orderText.includes('rebel') || orderText.includes('energy')) {
        if (granola) {
          recommendations.set(granola.chainproductid.toString(), {
            product: granola,
            reason: 'Energy boost combo!',
            score: 92
          });
        }
        if (chocolateMuffin) {
          recommendations.set(chocolateMuffin.chainproductid.toString(), {
            product: chocolateMuffin,
            reason: 'Sweet energy kick',
            score: 86
          });
        }
      }

      // LEMONADE
      else if (orderText.includes('lemonade')) {
        if (orangeMuffin) {
          recommendations.set(orangeMuffin.chainproductid.toString(), {
            product: orangeMuffin,
            reason: 'Fruity refreshment pair!',
            score: 93
          });
        }
        if (lemonMuffin) {
          recommendations.set(lemonMuffin.chainproductid.toString(), {
            product: lemonMuffin,
            reason: 'Citrus delight',
            score: 88
          });
        }
      }

      // TEA drinks
      else if (orderText.includes('tea')) {
        if (lemonMuffin) {
          recommendations.set(lemonMuffin.chainproductid.toString(), {
            product: lemonMuffin,
            reason: 'Classic tea pairing',
            score: 90
          });
        }
        if (granola) {
          recommendations.set(granola.chainproductid.toString(), {
            product: granola,
            reason: 'Light & healthy',
            score: 85
          });
        }
      }

      // HOT COCOA
      else if (orderText.includes('cocoa') || orderText.includes('hot chocolate')) {
        if (chocolateMuffin) {
          recommendations.set(chocolateMuffin.chainproductid.toString(), {
            product: chocolateMuffin,
            reason: 'Chocolate lovers dream!',
            score: 97
          });
        }
      }

      // SMOOTHIE / SHAKE / FREEZE
      else if (orderText.includes('smoothie') || orderText.includes('shake') || orderText.includes('freeze')) {
        if (granola) {
          recommendations.set(granola.chainproductid.toString(), {
            product: granola,
            reason: 'Healthy smoothie pair',
            score: 90
          });
        }
        if (orangeMuffin) {
          recommendations.set(orangeMuffin.chainproductid.toString(), {
            product: orangeMuffin,
            reason: 'Fruity combination',
            score: 85
          });
        }
      }

      // SODA
      else if (orderText.includes('soda')) {
        if (chocolateMuffin) {
          recommendations.set(chocolateMuffin.chainproductid.toString(), {
            product: chocolateMuffin,
            reason: 'Sweet treat combo',
            score: 88
          });
        }
        if (orangeMuffin) {
          recommendations.set(orangeMuffin.chainproductid.toString(), {
            product: orangeMuffin,
            reason: 'Fun flavor mix',
            score: 83
          });
        }
      }

      // DEFAULT
      else {
        if (chocolateMuffin) {
          recommendations.set(chocolateMuffin.chainproductid.toString(), {
            product: chocolateMuffin,
            reason: 'Customer favorite!',
            score: 80
          });
        }
        if (granola) {
          recommendations.set(granola.chainproductid.toString(), {
            product: granola,
            reason: 'Healthy snack option',
            score: 75
          });
        }
      }

      return Array.from(recommendations.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);
    });
  }
}
