# src/entity_extractor.py
import re
from typing import Dict, List, Optional

class EntityExtractor:
    """Extract order entities from transcribed text"""
    
    def __init__(self):
        """Initialize entity extractor with patterns"""
        
        # Size patterns
        self.sizes = {
            r'\b(small|sm|sml)\b': 'small',
            r'\b(medium|med|md)\b': 'medium',
            r'\b(large|lrg|lg)\b': 'large',
            r'\b(kids?|kid size)\b': 'kids',
        }
        
        # Temperature patterns
        self.temperatures = {
            r'\b(hot)\b': 'hot',
            r'\b(iced|ice|cold)\b': 'iced',
            r'\b(blended|frozen|freeze)\b': 'blended',
        }
        
        # Common modifiers
        self.modifiers = [
            # Milk types
            r'oat milk', r'almond milk', r'coconut milk',
            r'chocolate milk', r'breve', r'half and half',
            r'protein milk', r'nonfat', r'2% milk',
            
            # Toppings
            r'soft top', r'whipped cream', r'whip',
            r'caramel drizzle', r'chocolate drizzle',
            
            # Espresso
            r'extra shot', r'double shot', r'decaf',
            
            # Add-ins
            r'boba', r'pearls',
            
            # Ice level
            r'no ice', r'light ice', r'extra ice',
            
            # Sweetness
            r'extra sweet', r'less sweet', r'no sugar',
            
            # Blend
            r'double blended', r'extra thick',
        ]
        
        # Quantity words
        self.quantities = {
            r'\b(one|a|an)\b': 1,
            r'\b(two|couple)\b': 2,
            r'\b(three)\b': 3,
            r'\b(four)\b': 4,
            r'\b(five)\b': 5,
        }
    
    def extract(self, text: str, verbose=False) -> List[Dict]:
        """Extract all entities from text"""
        text_lower = text.lower()
        
        if verbose:
            print(f"🔍 Extracting entities from: \"{text}\"\n")
        
        # Split into potential items
        items = self._segment_items(text_lower)
        
        extracted_items = []
        
        for item_text in items:
            if verbose:
                print(f"   Processing segment: \"{item_text}\"")
            
            entities = {
                'raw_text': item_text,
                'size': self._extract_size(item_text),
                'temperature': self._extract_temperature(item_text),
                'modifiers': self._extract_modifiers(item_text),
                'quantity': self._extract_quantity(item_text),
                'product_hint': self._extract_product_hint(item_text)
            }
            
            if entities['product_hint'] or entities['modifiers']:
                extracted_items.append(entities)
                
                if verbose:
                    print(f"      ✓ Size: {entities['size']}")
                    print(f"      ✓ Temp: {entities['temperature']}")
                    print(f"      ✓ Product hint: {entities['product_hint']}")
                    print(f"      ✓ Modifiers: {entities['modifiers']}")
                    print()
        
        return extracted_items
    
    def _segment_items(self, text: str) -> List[str]:
        """Split text into individual item segments"""
        text = re.sub(r'\s+and\s+(a|an|also)\s+', ' ||| ', text)
        text = re.sub(r'\s+also\s+', ' ||| ', text)
        text = re.sub(r'\s+and\s+', ' ||| ', text)
        
        segments = [s.strip() for s in text.split('|||')]
        segments = [s for s in segments if len(s.split()) >= 3]
        
        return segments if segments else [text]
    
    def _extract_size(self, text: str) -> Optional[str]:
        """Extract size from text"""
        for pattern, size in self.sizes.items():
            if re.search(pattern, text):
                return size
        return None
    
    def _extract_temperature(self, text: str) -> Optional[str]:
        """Extract temperature from text"""
        for pattern, temp in self.temperatures.items():
            if re.search(pattern, text):
                return temp
        return None
    
    def _extract_modifiers(self, text: str) -> List[str]:
        """Extract modifiers from text"""
        found_modifiers = []
        
        for modifier_pattern in self.modifiers:
            if re.search(modifier_pattern, text):
                match = re.search(modifier_pattern, text)
                found_modifiers.append(match.group(0))
        
        return found_modifiers
    
    def _extract_quantity(self, text: str) -> int:
        """Extract quantity from text"""
        for pattern, qty in self.quantities.items():
            if re.search(pattern, text):
                return qty
        return 1
    
    def _extract_product_hint(self, text: str) -> Optional[str]:
        """Extract product name hints from text"""
        product_patterns = [
            r'golden eagle',
            r'white chocolate mocha',
            r'caramelizer',
            r'rainbow rebel',
            r'rainbro rebel',
            r'rebel',
            r'mocha',
            r'latte',
            r'freeze',
            r'americano',
            r'cold brew',
            r'not so hot',
        ]
        
        for pattern in product_patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(0)
        
        words = text.split()
        skip_words = ['i', 'a', 'an', 'the', 'can', 'get', 'have', 'with', 'and']
        meaningful_words = [w for w in words if w not in skip_words and len(w) > 2]
        
        if meaningful_words:
            return ' '.join(meaningful_words[:3])
        
        return None
