import { Pipe, PipeTransform } from '@angular/core';
import { Product } from '../../models/menu.model';

@Pipe({
  name: 'filterProducts',
  standalone: true
})
export class FilterProductsPipe implements PipeTransform {
  transform(products: Product[], search: string): Product[] {
    if (!search?.trim()) return products;
    const term = search.trim().toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(term));
  }
}