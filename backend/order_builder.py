# src/order_builder.py
import uuid
from typing import Dict, List, Optional
from datetime import datetime


class OrderBuilder:
    """Build complete orders with pricing for POS API"""

    def __init__(self, menu_loader):
        """Initialize order builder

        Args:
            menu_loader: MenuLoader instance
        """
        self.menu_loader = menu_loader

    def build_order(
        self,
        matched_items: List[Dict],
        customer_name: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Dict:
        """Build complete order from matched items

        Args:
            matched_items: List of items from pipeline
            customer_name: Optional customer name
            notes: Optional order notes

        Returns:
            Complete order dict ready for POS API
        """
        order_items: List[Dict] = []

        for item in matched_items:
            order_item = self._build_order_item(item)
            if order_item:
                order_items.append(order_item)

        subtotal = sum(
            float(item.get("unit_price", 0.0)) * int(item.get("quantity", 1))
            for item in order_items
        )

        order = {
            "source": "broista_copilot",
            "customer_name": customer_name or "Voice Order",
            "notes": notes or "",
            "created_at": datetime.now().isoformat(),
            "items": order_items,
            "subtotal": round(float(subtotal), 2),
            "total": round(float(subtotal), 2),  # taxes/discounts can be added later
            "metadata": {
                "capture_method": "voice_ai",
                "ai_models": ["whisper", "bedrock_llama3.1"],
                "item_count": len(order_items),
            },
        }

        return order

    def _build_order_item(self, item: Dict) -> Optional[Dict]:
        """Build single order item with modifiers"""
        product = item.get('product')
        
        # Handle unknown products
        if not product:
            # Product not in menu - return placeholder
            return {
                "item_id": str(uuid.uuid4()),
                "product_id": None,
                "name": item.get('product_name', 'Unknown Product'),
                "category": "unknown",
                "item_type": "standard",
                "quantity": item.get('quantity', 1),
                "unit_price": 0.0,
                "image_url": "",
                "display_order": 0,
                "size": item.get('size'),
                "temperature": item.get('temperature'),
                "child_items": [],
                "metadata": {
                    "status": "requires_manual_selection",
                    "original_query": item.get('original_query', ''),
                    "suggestions": item.get('suggestions', []),
                    "match_confidence": 0.0
                }
            }

        product_id = item.get("product_id") or str(product.get("chainproductid") or "")
        product_name = item.get("product_name") or product.get("name") or "Unknown Item"

        # Price pieces
        size = item.get("size")
        modifiers_data = self.menu_loader.get_modifiers_for_product(product_id)

        size_price = self._get_size_price(size, modifiers_data)

        # Build child modifiers
        child_items: List[Dict] = []
        modifier_total = 0.0
        for modifier_name in item.get("modifiers", []):
            modifier_item = self._build_modifier_item(modifier_name, modifiers_data)
            if modifier_item:
                child_items.append(modifier_item)
                modifier_total += float(modifier_item.get("unit_price", 0.0))

        # Resolve base price safely (item-provided → infer from product → fallback)
        base_price = item.get("base_price")
        if not isinstance(base_price, (int, float)) or float(base_price) <= 0:
            base_price = self._infer_base_price(product, size)
        else:
            base_price = float(base_price)

        unit_price = float(base_price) + float(size_price) + float(modifier_total)

        order_item = {
            "item_id": str(uuid.uuid4()),
            "product_id": product_id,
            "name": product_name,
            "category": "drink",
            "item_type": "standard",
            "quantity": int(item.get("quantity", 1)),
            "unit_price": round(unit_price, 2),
            "image_url": self.menu_loader.get_image_url(product),
            "display_order": 0,
            "size": size,
            "temperature": item.get("temperature"),
            "child_items": child_items,
            "pricing_breakdown": {
                "base_price": round(float(base_price), 2),
                "size_adjustment": round(float(size_price), 2),
                "modifiers_total": round(float(modifier_total), 2),
                "total": round(unit_price, 2),
            },
            "metadata": {
                "match_confidence": item.get("match_confidence", 0.0),
                "needs_clarification": self._needs_clarification(item),
            },
        }

        return order_item

    def _get_size_price(self, size: Optional[str], modifiers_data: Optional[Dict]) -> float:
        """Get price adjustment for size from modifiers; fallback to defaults"""
        if not size:
            return 0.0

        # 1) Try from modifiers schema if available
        if modifiers_data and isinstance(modifiers_data, dict):
            for group in modifiers_data.get("groups", []):
                if group.get("id") == "size":
                    for option in group.get("options", []):
                        opt_id = (option.get("id") or "").lower()
                        if opt_id == str(size).lower():
                            return float(option.get("price_adjustment", 0.0))

        # 2) Fallback mapping
        size_prices = {
            "small": 0.0,
            "medium": 0.50,
            "large": 1.00,
            "kids": -0.50,
        }
        return float(size_prices.get(str(size).lower(), 0.0))

    def _infer_base_price(self, product: Dict, size: Optional[str]) -> float:
        """Best-effort price lookup from common menu schemas, else fallback."""
        if not product:
            return 5.50

        # 1) Simple numeric price
        price = product.get("price")
        if isinstance(price, (int, float)) and price > 0:
            return float(price)

        # 2) Dict of size -> price
        for smap_key in ("prices", "size_prices", "price_by_size"):
            smap = product.get(smap_key)
            if isinstance(smap, dict) and size:
                p = (
                    smap.get(size)
                    or smap.get(str(size).lower())
                    or smap.get(str(size).title())
                )
                if isinstance(p, (int, float)) and p > 0:
                    return float(p)

        # 3) Variant/option lists with size + price
        for key in ("variants", "options", "items"):
            variants = product.get(key)
            if isinstance(variants, list):
                for v in variants:
                    if not isinstance(v, dict):
                        continue
                    s = (v.get("size") or v.get("name") or "").lower()
                    vp = v.get("price")
                    if (
                        (not size or (str(size).lower() in s))
                        and isinstance(vp, (int, float))
                        and vp > 0
                    ):
                        return float(vp)

        # 4) Fallback
        return 5.50

    def _build_modifier_item(
        self, modifier_name: str, modifiers_data: Optional[Dict]
    ) -> Optional[Dict]:
        """Build modifier as child item"""
        name_l = (modifier_name or "").lower()

        # 1) Try to match against known modifier groups/options
        if modifiers_data and isinstance(modifiers_data, dict):
            for group in modifiers_data.get("groups", []):
                for option in group.get("options", []):
                    option_name = (option.get("name") or "").lower()
                    if name_l in option_name or option_name in name_l:
                        return {
                            "item_id": str(uuid.uuid4()),
                            "name": option.get("name"),
                            "item_type": "modifier",
                            "modifier_group": group.get("id"),
                            "quantity": 1,
                            "unit_price": float(option.get("price_adjustment", 0.0)),
                            "display_order": 0,
                        }

        # 2) Fallback price table
        modifier_prices = {
            "soft top": 0.50,
            "whipped cream": 0.50,
            "whip": 0.50,
            "oat milk": 0.75,
            "almond milk": 0.75,
            "coconut milk": 0.75,
            "boba": 0.75,
            "caramel drizzle": 0.50,
            "chocolate drizzle": 0.50,
            "extra shot": 1.00,
            "double shot": 2.00,
        }

        price = float(modifier_prices.get(name_l, 0.50))

        return {
            "item_id": str(uuid.uuid4()),
            "name": str(modifier_name).title(),
            "item_type": "modifier",
            "modifier_group": "custom",
            "quantity": 1,
            "unit_price": price,
            "display_order": 0,
        }

    def _needs_clarification(self, item: Dict) -> List[str]:
        """Check what info is missing"""
        needs: List[str] = []

        if not item.get("size"):
            needs.append("size")

        if not item.get("temperature"):
            needs.append("temperature")

        return needs

    def format_order_summary(self, order: Dict) -> str:
        """Format order as human-readable string"""
        lines: List[str] = []
        lines.append("=" * 60)
        lines.append("📋 ORDER SUMMARY")
        lines.append("=" * 60)

        for i, item in enumerate(order.get("items", []), 1):
            lines.append("\n🥤 Item {}: {}".format(i, item.get("name", "Unknown")))
            if item.get("size"):
                lines.append("   Size: {}".format(str(item["size"]).title()))
            if item.get("temperature"):
                lines.append("   Temperature: {}".format(str(item["temperature"]).title()))
            lines.append("   Quantity: {}".format(int(item.get("quantity", 1))))

            if item.get("child_items"):
                lines.append("   Modifiers:")
                for mod in item["child_items"]:
                    mod_price = float(mod.get("unit_price", 0.0))
                    price_str = " (+${:.2f})".format(mod_price) if mod_price > 0 else ""
                    lines.append("      • {}{}".format(mod.get("name", "Modifier"), price_str))

            breakdown = item.get("pricing_breakdown", {})
            if breakdown:
                lines.append("   Pricing:")
                lines.append("      Base: ${:.2f}".format(float(breakdown.get("base_price", 0))))
                size_adj = float(breakdown.get("size_adjustment", 0))
                if size_adj != 0:
                    sign = "+" if size_adj > 0 else "-"
                    lines.append("      Size: {}${:.2f}".format(sign, abs(size_adj)))
                mods_total = float(breakdown.get("modifiers_total", 0))
                if mods_total > 0:
                    lines.append("      Mods: +${:.2f}".format(mods_total))
                lines.append("      Total: ${:.2f}".format(float(breakdown.get("total", 0))))

        lines.append("\n" + ("=" * 60))
        lines.append("💰 SUBTOTAL: ${:.2f}".format(float(order.get("subtotal", 0.0))))
        lines.append("💰 TOTAL: ${:.2f}".format(float(order.get("total", 0.0))))
        lines.append("=" * 60)

        return "\n".join(lines)


def demo_order_builder():
    """Demo the order builder"""
    print("🎯 Order Builder Demo\n")

    from menu_loader import MenuLoader

    menu = MenuLoader()
    builder = OrderBuilder(menu)

    # Try by known chainproductid first
    product = menu.get_product_by_id("729771")

    if not product:
        print("❌ Could not find Golden Eagle product by ID")
        # Fallback to name search if available
        if hasattr(menu, "search_product_by_name"):
            print("💡 Using search instead...")
            products = menu.search_product_by_name("golden eagle")
            if products:
                product = products[0]
        if not product:
            print("❌ No Golden Eagle found in menu")
            return

    matched_items = [
        {
            "product": product,
            "product_id": str(product.get("chainproductid")),
            "product_name": product.get("name"),
            "base_price": 5.50,  # If 0 or missing, _infer_base_price will backfill
            "size": "medium",
            "temperature": "iced",
            "modifiers": ["soft top", "caramel drizzle"],
            "quantity": 1,
            "match_confidence": 0.95,
        }
    ]

    print("Building order...")
    order = builder.build_order(
        matched_items,
        customer_name="Voice Customer",
        notes="Order via Broista Co-Pilot",
    )

    print("\n" + builder.format_order_summary(order))
    print("\n✅ Order ready for POS API!")


if __name__ == "__main__":
    demo_order_builder()
