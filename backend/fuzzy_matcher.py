# src/fuzzy_matcher.py
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from fuzzywuzzy import fuzz
from typing import List, Dict, Optional
import pickle
import os

class FuzzyMenuMatcher:
    """Match product names to menu items using fuzzy + semantic similarity."""

    def __init__(self, menu_loader, model_name: str = 'all-MiniLM-L6-v2'):
        """
        Args:
            menu_loader: MenuLoader instance
            model_name: Sentence transformer model name
        """
        self.menu_loader = menu_loader
        self.products = menu_loader.get_all_products()

        print(f"⏳ Loading sentence transformer model '{model_name}'...")
        self.model = SentenceTransformer(model_name)
        print("✅ Model loaded!")

        # Build embeddings
        self.embeddings = None
        self.product_names: List[str] = []
        self._build_embeddings()

        # Common nicknames/aliases (extend as needed)
        # If your menu uses size-specific names (e.g., "Not So Hot 24oz"),
        # update the mapping to the exact product name.
        self.nicknames = {
            'rainbro': 'rainbro rebel',
            'rainbow': 'rainbro rebel',
            'double rainbro': 'double rainbro rebel',
            'colon eagle': 'golden eagle',
            'wc mocha': 'white mocha',
            'white chocolate mocha': 'white mocha',  # CRITICAL
            'hot white chocolate mocha': 'white mocha',  # CRITICAL
            'carmelizer': 'caramelizer',
        }

        # Optional variation resolver (safe fallback if not present)
        self._load_variations()

    def _load_variations(self):
        """Load product variation resolver if available."""
        try:
            import sys
            sys.path.insert(0, os.path.dirname(__file__))
            from product_variations import resolve_product
            self.resolve_product = resolve_product
        except Exception as e:
            print(f"⚠️ Could not load variations: {e}")
            # identity: returns (query, True, [])
            self.resolve_product = lambda x: (x, True, [])

    def _build_embeddings(self):
        """Build or load embeddings for all products."""
        print(f"🔨 Building embeddings for {len(self.products)} products...")

        if len(self.products) == 0:
            print("⚠️ No products loaded! Cannot build embeddings.")
            self.product_names = []
            self.embeddings = None
            return

        cache_file = 'data/menu/embeddings_cache.pkl'

        if os.path.exists(cache_file):
            print("   Checking cache...")
            try:
                with open(cache_file, 'rb') as f:
                    cache = pickle.load(f)
                cached_count = len(cache.get('names', []))
                current_count = len(self.products)
                if cached_count == current_count:
                    self.product_names = cache['names']
                    self.embeddings = cache['embeddings']
                    print(f"✅ Loaded {len(self.product_names)} embeddings from cache")
                    return
                else:
                    print(f"⚠️ Cache mismatch: {cached_count} vs {current_count} (rebuilding)")
            except Exception as e:
                print(f"⚠️ Cache error: {e} (rebuilding)")

        # Extract product names
        self.product_names = []
        for product in self.products:
            name = (product.get('name') or '').lower()
            self.product_names.append(name)

        if not self.product_names:
            print("⚠️ No product names found!")
            return

        # Generate embeddings
        print("   Generating embeddings...")
        self.embeddings = self.model.encode(
            self.product_names,
            show_progress_bar=True,
            convert_to_numpy=True
        )

        # Cache
        try:
            os.makedirs(os.path.dirname(cache_file), exist_ok=True)
            with open(cache_file, 'wb') as f:
                pickle.dump({'names': self.product_names, 'embeddings': self.embeddings}, f)
            print(f"✅ Built and cached {len(self.product_names)} embeddings")
        except Exception as e:
            print(f"⚠️ Could not cache embeddings: {e}")
            print(f"✅ Built {len(self.product_names)} embeddings (not cached)")

    def match(self, query: str, top_k=5, threshold=0.5) -> List[Dict]:
        """Match query to menu items
        
        Args:
            query: Product name to match
            top_k: Number of top matches to return
            threshold: Minimum similarity threshold
            
        Returns:
            List of matches with scores
        """
        if not query:
            return []
        
        if self.embeddings is None or len(self.product_names) == 0:
            print("⚠️ No embeddings available for matching!")
            return []
        
        query_lower = query.lower().strip()
        
        # Check for nicknames first
        if query_lower in self.nicknames:
            query_lower = self.nicknames[query_lower]
        
        # 1. Semantic similarity (embeddings)
        query_embedding = self.model.encode([query_lower])
        semantic_scores = cosine_similarity(
            query_embedding,
            self.embeddings
        )[0]
        
        # 2. Fuzzy string matching
        fuzzy_scores = []
        for product_name in self.product_names:
            # Combine multiple fuzzy metrics
            ratio = fuzz.ratio(query_lower, product_name) / 100.0
            partial = fuzz.partial_ratio(query_lower, product_name) / 100.0
            token_sort = fuzz.token_sort_ratio(query_lower, product_name) / 100.0
            
            # Weighted average
            score = 0.4 * ratio + 0.3 * partial + 0.3 * token_sort
            fuzzy_scores.append(score)
        
        fuzzy_scores = np.array(fuzzy_scores)
        
        # 3. COLOR CONTRADICTION PENALTY (ADD THIS ENTIRE SECTION)
        color_penalty = np.zeros(len(self.product_names))
        
        query_words = set(query_lower.split())
        
        # Define contradictory color pairs
        if 'white' in query_words:
            for i, product_name in enumerate(self.product_names):
                if 'dark' in product_name.lower():
                    color_penalty[i] = -1.0  # Heavy penalty
                elif 'double chocolate' in product_name.lower():
                    color_penalty[i] = -0.8  # Penalty
        
        if 'dark' in query_words:
            for i, product_name in enumerate(self.product_names):
                if 'white' in product_name.lower():
                    color_penalty[i] = -1.0  # Heavy penalty
        
        # 4. Combined score WITH color penalty
        combined_scores = 0.6 * semantic_scores + 0.4 * fuzzy_scores + color_penalty

        
        
        # Get top matches
        top_indices = np.argsort(combined_scores)[::-1][:top_k]
        
        matches = []
        for idx in top_indices:
            # Bounds check
            if idx >= len(self.products):
                continue
            
            score = combined_scores[idx]
            
            # Filter by threshold
            if score < threshold:
                continue
            
            product = self.products[idx]
            
            matches.append({
                'product': product,
                'product_name': product.get('name'),
                'product_id': product.get('chainproductid'),
                'similarity': float(score),
                'semantic_score': float(semantic_scores[idx]),
                'fuzzy_score': float(fuzzy_scores[idx]),
                'base_price': product.get('cost', 0)
            })
        
        return matches

    def match_best(self, query: str, threshold=0.5) -> Optional[Dict]:
        """Get best match for query with variation resolution
        
        Args:
            query: Product name to match
            threshold: Minimum similarity threshold
            
        Returns:
            Best match dict with 'exists' and 'suggestions' flags, or None
        """
        # NEW: Check if this is a known non-existent product FIRST
        query_lower = query.lower().strip()
        
        # Import here to avoid circular imports
        try:
            from product_variations import UNKNOWN_PRODUCTS
            
            if query_lower in UNKNOWN_PRODUCTS:
                # This product doesn't exist - return with suggestions
                return {
                    'product': None,
                    'product_name': query,
                    'product_id': None,
                    'similarity': 0.0,
                    'exists': False,
                    'suggestions': UNKNOWN_PRODUCTS[query_lower],
                    'original_query': query
                }
        except:
            pass
        
        # Try normal matching
        matches = self.match(query, top_k=1, threshold=threshold)
        
        if matches:
            best_match = matches[0]
            # Add metadata
            best_match['exists'] = True
            best_match['suggestions'] = []
            best_match['original_query'] = query
            return best_match
        
        return None
    def match_with_category(self, query: str, category_hint: Optional[str] = None) -> Optional[Dict]:
        """Optionally bias results to a category (e.g., 'rebel', 'mocha')."""
        matches = self.match(query, top_k=10, threshold=0.3)
        if not matches:
            return None

        if category_hint:
            for m in matches:
                product_categories = m['product'].get('categories', [])
                if any(category_hint.lower() in str(cat).lower() for cat in product_categories):
                    m['similarity'] *= 1.2
            matches.sort(key=lambda x: x['similarity'], reverse=True)

        return matches[0]


def demo_matcher():
    """Quick demo of the fuzzy matcher."""
    print("🎯 Fuzzy Matcher Demo\n")

    from menu_loader import MenuLoader
    menu = MenuLoader()

    matcher = FuzzyMenuMatcher(menu)

    tests = [
        "white chocolate mocha",
        "hot white chocolate mocha",
        "dark chocolate mocha",
        "golden eagle",
        "colon eagle",
        "rainbro rebel",
        "double rainbro",
        "not so hot",
        "nsh",
        "wc mocha",
    ]

    for q in tests:
        print("=" * 60)
        print(f"🔍 Query: {q!r}")
        best = matcher.match_best(q, threshold=0.3)
        if best:
            print(f"→ Best: {best['product_name']} (Score: {best['similarity']:.2%})")
        else:
            print("→ No match")
    print()

if __name__ == "__main__":
    demo_matcher()
