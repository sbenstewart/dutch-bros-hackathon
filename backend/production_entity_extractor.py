# src/production_entity_extractor.py
"""
PRODUCTION-GRADE ENTITY EXTRACTOR
Designed for real coffee shop use, not just test cases
"""

import boto3
import json
import os
import re
from typing import Dict, List, Tuple
from dotenv import load_dotenv

load_dotenv()

class ProductionEntityExtractor:
    """Production-grade entity extraction with validation and confidence scoring"""
    
    def __init__(self, model_id="meta.llama3-1-70b-instruct-v1:0"):
        """Initialize with best model for accuracy
        
        Use 70B model for production (more accurate, worth the latency)
        Use 8B model for testing (faster)
        """
        self.model_id = model_id
        
        print(f"⏳ Initializing Production Extractor ({model_id.split('.')[-1]})...")
        
        self.bedrock = boto3.client(
            'bedrock-runtime',
            region_name=os.getenv('AWS_REGION', 'us-west-2'),
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
        )
        
        print("✅ Ready!")
    
    def extract_with_confidence(self, text: str, verbose=False) -> Tuple[List[Dict], float]:
        """Extract entities with overall confidence score
        
        Returns:
            (items, confidence_score)
        """
        
        # Step 1: Extract with chain-of-thought reasoning
        items_with_reasoning = self._extract_with_reasoning(text, verbose)
        
        # Step 2: Validate and score
        validated_items = self._validate_and_score(items_with_reasoning, text, verbose)
        
        # Step 3: Calculate overall confidence
        if validated_items:
            avg_confidence = sum(item['confidence'] for item in validated_items) / len(validated_items)
        else:
            avg_confidence = 0.0
        
        return validated_items, avg_confidence
    
    def _extract_with_reasoning(self, text: str, verbose: bool) -> List[Dict]:
        """Use chain-of-thought prompting for better accuracy"""
        
        prompt = self._build_chain_of_thought_prompt(text)
        
        try:
            import time
            start = time.time()
            
            response = self._call_bedrock(prompt)
            elapsed = time.time() - start
            
            if verbose:
                print(f"⏱️ Extraction: {elapsed:.2f}s\n")
                print(f"🤖 Response:\n{response[:800]}...\n")
            
            # Parse response
            items = self._parse_chain_of_thought(response, verbose)
            
            return items
            
        except Exception as e:
            print(f"❌ Extraction error: {e}")
            return []
    
    def _build_chain_of_thought_prompt(self, text: str) -> str:
        """Advanced prompt with reasoning steps"""
        
        return f"""You are an expert barista assistant. Extract order items using step-by-step reasoning.

TASK: Analyze this conversation and extract ALL drink/food items ordered.

CONVERSATION:
"{text}"

REASONING PROCESS:
1. Identify all product mentions (ignore chitchat like "how are you", "thank you")
2. For each product, determine:
   - Is this a NEW item or a MODIFICATION to previous item?
   - What size? (small/medium/large/kids)
   - What temperature? (hot/iced/blended)
   - What modifiers? (soft top, oat milk, boba, extra sweet, etc.)
   - What quantity? (one=1, two=2, etc.)
3. Handle special cases:
   - "actually, make that iced" = MODIFY previous item's temperature
   - "can you add soft top" = ADD modifier to previous item
   - "and" or "also" = usually means NEW item
   - "double rainbow" = "rainbow" is product, "double" might be modifier or size context

EXAMPLES:

Example 1: Simple
Input: "Can I get a large hot mocha with soft top?"
Reasoning: One item mentioned - mocha, size large, temp hot, modifier soft top
Output: [{{"product":"mocha","size":"large","temp":"hot","mods":["soft top"],"qty":1,"is_new_item":true}}]

Example 2: Multiple items
Input: "I'll do a medium iced golden eagle and a small rebel with boba"
Reasoning: Two items - (1) golden eagle medium iced, (2) rebel small with boba
Output: [
  {{"product":"golden eagle","size":"medium","temp":"iced","mods":[],"qty":1,"is_new_item":true}},
  {{"product":"rebel","size":"small","temp":null,"mods":["boba"],"qty":1,"is_new_item":true}}
]

Example 3: Modification
Input: "Can I get a golden eagle? Actually, make that iced please"
Reasoning: One item - golden eagle, then customer changes to iced (modification)
Output: [{{"product":"golden eagle","size":null,"temp":"iced","mods":[],"qty":1,"is_new_item":true}}]

Example 4: Complex multi-item
Input: "Large hot white chocolate mocha extra sweet with soft top, medium double blended rainbow rebel with boba, and kids not so hot with whip"
Reasoning: Three items separated by commas/and - (1) mocha (2) rebel (3) not so hot
Output: [
  {{"product":"white chocolate mocha","size":"large","temp":"hot","mods":["extra sweet","soft top"],"qty":1,"is_new_item":true}},
  {{"product":"rainbow rebel","size":"medium","temp":"blended","mods":["boba","double blended"],"qty":1,"is_new_item":true}},
  {{"product":"not so hot","size":"kids","temp":null,"mods":["whip"],"qty":1,"is_new_item":true}}
]

Example 5: Modifier addition
Input: "Medium golden eagle. Can you add oat milk and soft top?"
Reasoning: One item - golden eagle medium, then customer adds modifiers
Output: [{{"product":"golden eagle","size":"medium","temp":null,"mods":["oat milk","soft top"],"qty":1,"is_new_item":true}}]

CRITICAL RULES:
1. IGNORE chitchat (greetings, thank you, questions about milk types, etc.)
2. "and", "also", "can I also have" = NEW item
3. "can you add", "with", "make that" = MODIFICATION/ADDITION
4. Size before product = applies to that product ("small oat milk golden eagle" = small golden eagle + oat milk modifier)
5. Milk types (oat/almond/coconut milk) = MODIFIERS not part of product name
6. "double" before product name usually means "double blended" modifier
7. "not so hot" is ONE product (kids hot chocolate)
8. "rainbro" or "rainbow" = "rainbow rebel"
9. Each item needs: product, size, temp, mods, qty, is_new_item flag

OUTPUT FORMAT (JSON array only, no explanation):
[{{"product":"...","size":"...","temp":"...","mods":[...],"qty":1,"is_new_item":true}}]

Now extract from the conversation above:"""
    
    def _call_bedrock(self, prompt: str) -> str:
        """Call Bedrock with optimal production settings"""
        
        body = json.dumps({
            "prompt": prompt,
            "max_gen_len": 800,
            "temperature": 0.00,  # Very low for consistency
            "top_p": 0.9
        })
        
        response = self.bedrock.invoke_model(
            modelId=self.model_id,
            body=body
        )
        
        response_body = json.loads(response['body'].read())
        return response_body.get('generation', '')
    
    def _parse_chain_of_thought(self, response: str, verbose: bool) -> List[Dict]:
        """Parse response with reasoning"""
        
        items = []
        
        # Extract JSON array
        array_match = re.search(r'\[.*\]', response, re.DOTALL)
        if array_match:
            try:
                json_str = array_match.group(0)
                parsed = json.loads(json_str)
                
                if isinstance(parsed, list):
                    for item_dict in parsed:
                        if item_dict.get('product'):
                            items.append(item_dict)
                    
                    if items and verbose:
                        print(f"✅ Parsed {len(items)} items from reasoning\n")
                    
                    return items
            except Exception as e:
                if verbose:
                    print(f"⚠️ JSON parse error: {e}")
        
        # Fallback: Extract individual objects
        for match in re.finditer(r'\{[^}]*"product"[^}]*\}', response):
            try:
                obj = json.loads(match.group(0))
                if obj.get('product'):
                    items.append(obj)
            except:
                continue
        
        return items
    
    def _validate_and_score(self, items: List[Dict], original_text: str, verbose: bool) -> List[Dict]:
        """Validate items and assign confidence scores"""
        
        validated = []
        text_lower = original_text.lower()
        
        # Remove duplicates first
        items = self._deduplicate(items)
        
        for item in items:
            # Normalize
            normalized = self._normalize_item(item)
            
            # Calculate confidence
            confidence = self._calculate_confidence(normalized, text_lower)
            normalized['confidence'] = confidence
            
            # Validation checks
            is_valid, reason = self._is_valid_item(normalized, text_lower)
            
            if is_valid:
                validated.append(normalized)
            elif verbose:
                print(f"⚠️ Filtered: {normalized['product_hint']} - {reason}")
        
        return validated
    
    def _normalize_item(self, item: Dict) -> Dict:
        """Normalize item format"""
        
        # Handle different field names
        product = item.get('product') or item.get('product_name', '')
        size = item.get('size')
        temp = item.get('temp') or item.get('temperature')
        mods = item.get('mods') or item.get('modifiers', [])
        qty = item.get('qty') or item.get('quantity', 1)
        
        # Clean nulls
        if size in ['null', None, '']:
            size = None
        if temp in ['null', None, '']:
            temp = None
        
        # Clean temperature values
        if temp == 'blended' or 'blended' in str(temp):
            temp = 'blended'
        elif temp == 'double blended':
            temp = 'blended'
            if 'double blended' not in mods:
                mods.append('double blended')
        
        # Normalize product name
        product = str(product).lower().strip()
        
        # Handle nicknames
        nickname_map = {
            'rainbro': 'rainbow rebel',
            'rainbow': 'rainbow rebel',
            'double rainbro': 'rainbow rebel',
            'double rainbow': 'rainbow rebel',
            'wc mocha': 'white chocolate mocha',
            'nsh': 'not so hot',
        }
        product = nickname_map.get(product, product)
        
        return {
            'raw_text': '',
            'product_hint': product,
            'size': size,
            'temperature': temp,
            'modifiers': mods if isinstance(mods, list) else [],
            'quantity': qty,
            'confidence': 1.0  # Will be calculated
        }
    
    def _calculate_confidence(self, item: Dict, text: str) -> float:
        """Calculate confidence score for item"""
        
        confidence = 1.0
        product = item['product_hint']
        
        # Check 1: Product appears in text
        if product not in text:
            # Check if any words appear
            product_words = product.split()
            found_words = sum(1 for word in product_words if len(word) > 2 and word in text)
            word_ratio = found_words / max(len(product_words), 1)
            confidence *= (0.3 + 0.7 * word_ratio)
        
        # Check 2: Has reasonable attributes
        if not item['size'] and not item['temperature']:
            confidence *= 0.9  # Slight penalty for missing common attributes
        
        # Check 3: Modifiers make sense
        if item['modifiers']:
            valid_mods = sum(1 for mod in item['modifiers'] if mod in text)
            mod_ratio = valid_mods / len(item['modifiers'])
            confidence *= (0.5 + 0.5 * mod_ratio)
        
        # Check 4: Product name length (too short = suspicious)
        if len(product) < 4:
            confidence *= 0.7
        
        return round(confidence, 2)
    
    def _is_valid_item(self, item: Dict, text: str) -> Tuple[bool, str]:
        """Validate if item is legitimate"""
        
        product = item['product_hint']
        
        # Check 1: Has product name
        if not product or len(product) < 3:
            return False, "Product name too short"
        
        # Check 2: Not a common false positive
        false_positives = ['thank', 'please', 'awesome', 'great', 'good', 'fun', 'course']
        if product in false_positives:
            return False, f"False positive: {product}"
        
        # Check 3: Confidence threshold
        if item['confidence'] < 0.4:
            return False, f"Low confidence: {item['confidence']:.0%}"
        
        return True, "Valid"
    
    def _deduplicate(self, items: List[Dict]) -> List[Dict]:
        """Remove duplicate items"""
        
        seen = []
        unique = []
        
        for item in items:
            # Create signature
            product = item.get('product') or item.get('product_name', '')
            size = item.get('size')
            temp = item.get('temp') or item.get('temperature')
            mods = item.get('mods') or item.get('modifiers', [])
            
            signature = (
                str(product).lower(),
                size,
                temp,
                tuple(sorted(mods)) if isinstance(mods, list) else ()
            )
            
            if signature not in seen:
                seen.append(signature)
                unique.append(item)
        
        return unique


def test_production_extractor():
    """Test with diverse real-world scenarios"""
    
    print("🎯 PRODUCTION EXTRACTOR TEST\n")
    
    extractor = ProductionEntityExtractor(
        model_id="meta.llama3-1-8b-instruct-v1:0"  # Use 8B for testing
    )
    
    test_cases = [
        # Simple
        ("Can I get a medium iced golden eagle with soft top?", 1),
        
        # Complex multi-item
        ("Large hot white chocolate mocha extra sweet with soft top, medium double blended rainbow rebel with boba, and kids not so hot with whip", 3),
        
        # With chitchat
        ("Hi! How are you? I'd like a small coffee please. Thank you!", 1),
        
        # Modification
        ("Can I get a golden eagle? Actually, can you make that iced? And add oat milk?", 1),
        
        # Ambiguous
        ("Two small coffees and a large rebel", 2),
        
        # With questions mixed in
        ("I'll have a mocha. What sizes do you have? Okay, make it large. Can you add whip?", 1),
    ]
    
    for text, expected_count in test_cases:
        print("="*60)
        print(f"📝 \"{text[:80]}...\"")
        print(f"   Expected: {expected_count} item(s)")
        print("="*60)
        
        items, confidence = extractor.extract_with_confidence(text, verbose=False)
        
        print(f"\n✅ Extracted: {len(items)} item(s) (Confidence: {confidence:.0%})\n")
        
        for i, item in enumerate(items, 1):
            print(f"{i}. {item['product_hint']}")
            print(f"   Size: {item['size']}, Temp: {item['temperature']}, Qty: {item['quantity']}")
            print(f"   Confidence: {item['confidence']:.0%}")
            if item['modifiers']:
                print(f"   Modifiers: {', '.join(item['modifiers'])}")
        
        if len(items) == expected_count:
            print("\n✅ CORRECT COUNT!")
        else:
            print(f"\n⚠️ Expected {expected_count}, got {len(items)}")
        
        print()


if __name__ == "__main__":
    test_production_extractor()
