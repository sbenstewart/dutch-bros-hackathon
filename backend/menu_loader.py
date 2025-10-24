# src/menu_loader.py
import json
import os
from typing import Dict, List, Optional



class MenuLoader:
    """Load and manage menu data"""
    
    def __init__(self, menu_path='spark/backend/data/menu/menu.json', 
                 modifiers_path='spark/backend/data/menu/modifiers.json'):
        """Initialize menu loader
        
        Args:
            menu_path: Path to menu JSON file
            modifiers_path: Path to modifiers JSON file
        """
        self.menu_path = menu_path
        self.modifiers_path = modifiers_path
        self.products = []
        self.categories = []
        self.modifier_chains = []
        
        self._load_data()
    
    def _load_data(self):
        """Load menu and modifier data"""
        # Load menu
        try:
            print(os.getcwd())
            with open(self.menu_path, 'r') as f:
                menu_data = json.load(f)
                
                self.categories = menu_data.get('categories', [])
                
                # Extract products from categories
                self.products = []
                for category in self.categories:
                    # Get products from this category
                    category_products = category.get('products', [])
                    self.products.extend(category_products)
                
                print(f"✅ Loaded menu data: {len(self.categories)} categories, {len(self.products)} products")
                
                if len(self.products) == 0:
                    print("⚠️ WARNING: No products found in categories!")
                
        except FileNotFoundError:
            print(f"❌ Error: {self.menu_path} not found")
            print("💡 Run 'python src/download_data.py' first to download menu data")
            raise
        except Exception as e:
            print(f"❌ Error loading menu: {e}")
            raise
        
        # Load modifiers
        try:
            with open(self.modifiers_path, 'r') as f:
                modifier_data = json.load(f)
                
                # Handle different structures
                if isinstance(modifier_data, list):
                    self.modifier_chains = modifier_data
                elif isinstance(modifier_data, dict):
                    if 'chains' in modifier_data:
                        self.modifier_chains = modifier_data['chains']
                    elif 'modifiers' in modifier_data:
                        self.modifier_chains = modifier_data['modifiers']
                    else:
                        for value in modifier_data.values():
                            if isinstance(value, list):
                                self.modifier_chains = value
                                break
            
            print(f"✅ Loaded modifiers: {len(self.modifier_chains)} chains")
        except FileNotFoundError:
            print(f"⚠️ Warning: {self.modifiers_path} not found")
            self.modifier_chains = []
        except Exception as e:
            print(f"⚠️ Warning loading modifiers: {e}")
            self.modifier_chains = []
    
    def get_all_products(self) -> List[Dict]:
        """Get all products"""
        return self.products
    
    def get_all_categories(self) -> List[Dict]:
        """Get all categories"""
        return self.categories
    
    def search_product_by_name(self, name: str) -> List[Dict]:
        """Search products by name"""
        name_lower = name.lower()
        results = []
        
        for product in self.products:
            product_name = product.get('name', '').lower()
            if name_lower in product_name:
                results.append(product)
        
        return results
    
    def get_modifiers_for_product(self, product_id: str) -> Dict:
        """Get modifier chain for a product"""
        for chain in self.modifier_chains:
            if str(chain.get('chainproductid')) == str(product_id):
                return chain
        return {}
    
    def get_image_url(self, product: Dict) -> str:
        """Get product image URL"""
        image = product.get('image', {})
        if isinstance(image, dict):
            return image.get('default', '')
        return ''
    
    def get_product_by_id(self, product_id: str) -> Optional[Dict]:
        """Get product by chainproductid
        
        Args:
            product_id: Chain product ID
            
        Returns:
            Product dict or None
        """
        for product in self.products:
            if str(product.get('chainproductid')) == str(product_id):
                return product
        return None


def demo_menu_loader():
    """Demo the menu loader"""
    print("🎯 Menu Loader Demo\n")
    
    menu = MenuLoader()
    
    print(f"\n📊 Stats:")
    print(f"   Products: {len(menu.get_all_products())}")
    print(f"   Categories: {len(menu.get_all_categories())}")
    
    print(f"\n🔍 Search 'golden eagle':")
    results = menu.search_product_by_name('golden eagle')
    for product in results[:5]:
        print(f"   • {product.get('name')} (ID: {product.get('chainproductid')}, Cost: ${product.get('cost', 0):.2f})")
    
    if results:
        print(f"\n🔧 Modifiers for {results[0].get('name')}:")
        product_id = results[0].get('chainproductid')
        modifiers = menu.get_modifiers_for_product(product_id)
        groups = modifiers.get('groups', [])
        print(f"   Found {len(groups)} modifier groups")
        for group in groups[:3]:
            print(f"   • {group.get('name')}: {len(group.get('options', []))} options")


if __name__ == "__main__":
    demo_menu_loader()
