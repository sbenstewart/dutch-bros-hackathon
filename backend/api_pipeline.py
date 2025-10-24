# src/api_pipeline.py
"""
API-ready pipeline that returns JSON instead of printing
Perfect for Flask/FastAPI integration
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))


from production_entity_extractor import ProductionEntityExtractor
from menu_loader import MenuLoader
from fuzzy_matcher import FuzzyMenuMatcher
from order_builder import OrderBuilder
import json
from typing import Dict, List

class APIPipeline:
    """Production pipeline that returns structured JSON"""
    
    def __init__(self):
        """Initialize all components"""
        self.extractor = ProductionEntityExtractor(
            model_id="meta.llama3-1-8b-instruct-v1:0"
        )
        self.menu = MenuLoader()
        self.matcher = FuzzyMenuMatcher(self.menu)
        self.builder = OrderBuilder(self.menu)
    
    def process_audio(self,stats) -> Dict:
        """Process audio file and return complete JSON result
        
        Args:
            audio_path: Path to audio file
            
        Returns:
            Complete order data as JSON-serializable dict
        """
        
        result = {
            "success": False,
            "error": None,
            "transcription": {},
            "extraction": {},
            "matching": {},
            "order": {},
            "flags": []
        }
        
        try:
            # Step 1: Transcribe

            result["transcription"] = {
                "text": stats["text"],
            }
            
            # Step 2: Extract entities
            items, overall_confidence = self.extractor.extract_with_confidence(
                stats["text"], 
                verbose=False
            )
            
            result["extraction"] = {
                "items": items,
                "count": len(items),
                "confidence": overall_confidence
            }
            
            # Step 3: Match to menu
            matched_items = []
            unmatched_items = []
            
            for item in items:
                match = self.matcher.match_best(
                    item['product_hint'], 
                    threshold=0.40
                )
                
                if match and match.get('product'):
                    # Valid match
                    combined_confidence = (
                        item['confidence'] + match['similarity']
                    ) / 2
                    
                    matched_item = {
                        'product': match['product'],
                        'product_id': match['product_id'],
                        'product_name': match['product_name'],
                        'base_price': 5.50,
                        'size': item['size'],
                        'temperature': item['temperature'],
                        'modifiers': item['modifiers'],
                        'quantity': item['quantity'],
                        'match_confidence': match['similarity'],
                        'extraction_confidence': item['confidence'],
                        'overall_confidence': combined_confidence,
                        'exists': match.get('exists', True),
                        'suggestions': match.get('suggestions', []),
                        'original_query': item['product_hint']
                    }
                    
                    matched_items.append(matched_item)
                    
                    # Flag low confidence
                    if combined_confidence < 0.75:
                        result["flags"].append({
                            "item": match['product_name'],
                            "reason": "low_confidence",
                            "confidence": combined_confidence,
                            "action": "review"
                        })
                
                elif match and not match.get('product'):
                    # Known unknown product
                    unmatched_items.append({
                        'product_name': item['product_hint'],
                        'size': item['size'],
                        'temperature': item['temperature'],
                        'modifiers': item['modifiers'],
                        'quantity': item['quantity'],
                        'suggestions': match.get('suggestions', []),
                        'original_query': item['product_hint']
                    })
                    
                    result["flags"].append({
                        "item": item['product_hint'],
                        "reason": "not_in_menu",
                        "suggestions": match.get('suggestions', []),
                        "action": "manual_selection"
                    })
                else:
                    # No match at all
                    unmatched_items.append({
                        'product_name': item['product_hint'],
                        'size': item['size'],
                        'temperature': item['temperature'],
                        'modifiers': item['modifiers'],
                        'quantity': item['quantity'],
                        'suggestions': [],
                        'original_query': item['product_hint']
                    })
                    
                    result["flags"].append({
                        "item": item['product_hint'],
                        "reason": "no_match",
                        "suggestions": [],
                        "action": "manual_entry"
                    })
            
            result["matching"] = {
                "matched_count": len(matched_items),
                "unmatched_count": len(unmatched_items),
                "matched_items": matched_items,
                "unmatched_items": unmatched_items
            }
            
            # Step 4: Build order
            order = self.builder.build_order(
                matched_items,
                customer_name="Voice Customer"
            )
            
            result["order"] = order
            result["success"] = True
            
        except Exception as e:
            result["success"] = False
            result["error"] = str(e)
        
        return result
    
    def process_text(self, text: json) -> Dict:
        """Process text directly (skip transcription)
        
        Useful for testing or text-based orders
        """
        
        result = {
            "success": False,
            "error": None,
            "transcription": {
                "text": text,
                "confidence": 1.0,
                "source": "text_input"
            },
            "extraction": {},
            "matching": {},
            "order": {},
            "flags": []
        }
        
        try:
            # Extract entities
            items, overall_confidence = self.extractor.extract_with_confidence(
                text, 
                verbose=False
            )
            
            result["extraction"] = {
                "items": items,
                "count": len(items),
                "confidence": overall_confidence
            }
            
            # Match to menu
            matched_items = []
            
            for item in items:
                match = self.matcher.match_best(
                    item['product_hint'], 
                    threshold=0.40
                )
                
                if match and match.get('product'):
                    combined_confidence = (
                        item['confidence'] + match['similarity']
                    ) / 2
                    
                    matched_items.append({
                        'product': match['product'],
                        'product_id': match['product_id'],
                        'product_name': match['product_name'],
                        'base_price': 5.50,
                        'size': item['size'],
                        'temperature': item['temperature'],
                        'modifiers': item['modifiers'],
                        'quantity': item['quantity'],
                        'match_confidence': match['similarity'],
                        'extraction_confidence': item['confidence'],
                        'overall_confidence': combined_confidence,
                        'exists': match.get('exists', True),
                        'suggestions': match.get('suggestions', []),
                        'original_query': item['product_hint']
                    })
                    
                    if combined_confidence < 0.75:
                        result["flags"].append({
                            "item": match['product_name'],
                            "reason": "low_confidence",
                            "confidence": combined_confidence
                        })
            
            result["matching"] = {
                "matched_count": len(matched_items),
                "matched_items": matched_items
            }
            
            # Build order
            order = self.builder.build_order(matched_items)
            result["order"] = order
            result["success"] = True
            
        except Exception as e:
            result["success"] = False
            result["error"] = str(e)
        
        return result


def test_api_pipeline():
    """Test the API pipeline"""
    print("🧪 Testing API Pipeline\n")
    
    pipeline = APIPipeline()
    
    # Test with audio    
    result = pipeline.process_audio()
    
    # Pretty print JSON
    print("\n" + "="*60)
    print("JSON OUTPUT (Ready for UI):")
    print("="*60)
    print(json.dumps(result, indent=2, default=str)[:2000])
    print("\n... (truncated)")
    
    print("\n" + "="*60)
    print("SUMMARY:")
    print("="*60)
    print(f"✅ Success: {result['success']}")
    print(f"📝 Transcription: {len(result['transcription']['text'])} chars")
    print(f"🔍 Extracted: {result['extraction']['count']} items")
    print(f"✅ Matched: {result['matching']['matched_count']} items")
    print(f"💰 Total: ${result['order']['total']:.2f}")
    print(f"⚠️ Flags: {len(result['flags'])} items need attention")
    
    if result['flags']:
        print("\nFlags:")
        for flag in result['flags']:
            print(f"  • {flag['item']}: {flag['reason']}")


if __name__ == "__main__":
    test_api_pipeline()
