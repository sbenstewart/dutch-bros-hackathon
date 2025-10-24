# src/product_variations.py
"""
PRODUCTION: Product name variations
Maps customer language → actual menu product names
Only includes products that ACTUALLY EXIST in menu
"""

PRODUCT_VARIATIONS = {
    # White chocolate variations
    'white chocolate mocha': 'white mocha',
    'wc mocha': 'white mocha',
    
    # Rainbow rebel variations
    'rainbow rebel': 'rainbow rebel',
    'rainbro rebel': 'rainbow rebel',
    'rainbro': 'rainbow rebel',
    'double rainbow rebel': 'double rainbro rebel',
    'double rainbro': 'double rainbro rebel',
    
    # Golden eagle variations
    'golden eagle': 'golden eagle',
    'colon eagle': 'golden eagle',
    
    # Mocha variations
    'chocolate mocha': 'dark chocolate mocha',
    
    # Caramelizer
    'carmelizer': 'caramelizer',
    'carameliser': 'caramelizer',
    
    # Hot cocoa variations
    'hot chocolate': 'hot cocoa',
    'kids hot chocolate': 'hot cocoa',
    'cocoa': 'hot cocoa',
}

# Products that don't exist - provide suggestions
UNKNOWN_PRODUCTS = {
    'not so hot': ['hot cocoa', 'build your own: hot cocoa', 'zero sugar added hot cocoa'],
    'nsh': ['hot cocoa', 'build your own: hot cocoa'],
}

def resolve_product(customer_phrase: str) -> tuple:
    """Resolve customer phrase to menu product
    
    Returns:
        (resolved_name, exists, suggestions)
        - resolved_name: actual menu name or original phrase
        - exists: True if product exists, False otherwise
        - suggestions: list of alternatives if doesn't exist
    """
    phrase_lower = customer_phrase.lower().strip()
    
    # Check if we have a direct mapping
    if phrase_lower in PRODUCT_VARIATIONS:
        return (PRODUCT_VARIATIONS[phrase_lower], True, [])
    
    # Check if it's a known non-existent product
    if phrase_lower in UNKNOWN_PRODUCTS:
        return (phrase_lower, False, UNKNOWN_PRODUCTS[phrase_lower])
    
    # Otherwise return as-is (will be fuzzy matched)
    return (phrase_lower, True, [])