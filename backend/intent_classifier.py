# src/intent_classifier.py
import re
from typing import Dict, List

class IntentClassifier:
    """Classify customer utterance intent"""
    
    def __init__(self):
        """Initialize intent classifier with improved patterns"""
        
        # Order trigger patterns (stronger signals)
        self.order_patterns = [
            r"can i (get|have|do|order)",
            r"i('ll| would| will) (get|have|take|do)",
            r"i('d| would) like",
            r"let me (get|have)",
            r"give me",
            r"i'm gonna (get|have|do)",
            r"i want",
            r"could i (get|have)",
            r"may i (get|have)",
            r"i need",
        ]
        
        # NEGATIVE patterns (indicate NOT ordering)
        self.negative_patterns = [
            r"not (buying|getting|ordering|having)",
            r"don't want",
            r"won't (get|have|buy)",
            r"can't (get|have|buy)",
            r"shouldn't (get|have|buy)",
            r"didn't (get|have|buy)",
            r"never (get|have|buy)",
            r"refuse",
        ]
        
        # Question patterns
        self.question_patterns = [
            r"what (do you|can i|are|is)",
            r"do you (have|carry|offer)",
            r"can you",
            r"how (much|many|do)",
            r"is there",
            r"are there",
            r"which",
            r"where",
            r"when",
        ]
        
        # Greeting/chitchat patterns
        self.chitchat_patterns = [
            r"^(hi|hello|hey|good morning|good afternoon)",
            r"how are you",
            r"how's it going",
            r"thanks|thank you",
            r"have a (good|great|nice) (day|morning|afternoon)",
            r"that('s| is) (it|all)",
            r"perfect",
            r"awesome",
            r"i am [a-z]+",  # "I am maanesh"
            r"my name is",
        ]
        
        # Product/menu keywords (weaker signals now)
        self.product_keywords = [
            "coffee", "mocha", "latte", "rebel", "freeze", "tea",
            "drink", "hot", "iced", "blended", "large", "medium", "small",
            "caramel", "vanilla", "chocolate", "golden eagle", "caramelizer",
            "rainbow", "rainbro", "soft top", "whip", "drizzle", "shot",
            "milk", "oat", "almond", "coconut", "boba", "size"
        ]
    
    def classify(self, text: str, verbose=False) -> Dict:
        """Classify intent of utterance
        
        Args:
            text: Transcribed text
            verbose: Print debug info
            
        Returns:
            Dict with intent and confidence
        """
        text_lower = text.lower()
        
        # FIRST: Check for negative patterns (strong signal)
        has_negative = False
        for pattern in self.negative_patterns:
            if re.search(pattern, text_lower):
                has_negative = True
                if verbose:
                    print(f"   🚫 Found negative pattern: {pattern}")
                break
        
        # Check for order patterns
        order_score = 0
        matched_order_patterns = []
        
        for pattern in self.order_patterns:
            if re.search(pattern, text_lower):
                order_score += 3  # Strong signal
                matched_order_patterns.append(pattern)
        
        # Check for product keywords (but reduce weight)
        product_count = 0
        for keyword in self.product_keywords:
            if keyword in text_lower:
                # Only add to score if we have order patterns OR no negatives
                if matched_order_patterns or not has_negative:
                    order_score += 0.5  # Weaker signal than before
                product_count += 1
        
        # If negative pattern found, heavily penalize ORDER
        if has_negative:
            order_score = max(0, order_score - 10)
        
        # Check for question patterns
        question_score = 0
        matched_question_patterns = []
        
        for pattern in self.question_patterns:
            if re.search(pattern, text_lower):
                question_score += 3  # Strong signal
                matched_question_patterns.append(pattern)
        
        # Check for chitchat patterns
        chitchat_score = 0
        matched_chitchat_patterns = []
        
        for pattern in self.chitchat_patterns:
            if re.search(pattern, text_lower):
                chitchat_score += 2
                matched_chitchat_patterns.append(pattern)
        
        # Determine intent
        scores = {
            "ORDER": order_score,
            "QUESTION": question_score,
            "CHITCHAT": chitchat_score
        }
        
        intent = max(scores, key=scores.get)
        max_score = scores[intent]
        
        # If no strong signal, default to CHITCHAT (safer than ORDER)
        if max_score <= 0:
            intent = "CHITCHAT"
            max_score = 1
        
        # Calculate confidence (0-1)
        total_score = sum(scores.values()) or 1
        confidence = max_score / total_score
        
        result = {
            "intent": intent,
            "confidence": confidence,
            "scores": scores,
            "product_keywords_found": product_count,
            "has_negative": has_negative
        }
        
        if verbose:
            result["matched_patterns"] = {
                "order": matched_order_patterns,
                "question": matched_question_patterns,
                "chitchat": matched_chitchat_patterns
            }
        
        return result
    
    def is_order(self, text: str, threshold=0.5) -> bool:
        """Check if text is an order
        
        Args:
            text: Transcribed text
            threshold: Confidence threshold
            
        Returns:
            True if classified as ORDER with confidence > threshold
        """
        result = self.classify(text)
        return result["intent"] == "ORDER" and result["confidence"] >= threshold


def demo_classifier():
    """Demo the improved intent classifier"""
    print("🎯 Improved Intent Classifier Demo\n")
    
    classifier = IntentClassifier()
    
    # Test cases (including edge cases)
    test_cases = [
        # Orders
        "Can I get a large hot white chocolate mocha?",
        "I'll have a medium rebel with boba",
        "Let me get a small iced coffee",
        "Give me a golden eagle with soft top",
        "I'd like a caramelizer please",
        
        # NOT orders (edge cases)
        "Hi I am maanesh I am not buying coffee here",
        "I don't want any coffee today",
        "I won't get a latte",
        "My friend wants coffee but I don't",
        
        # Questions
        "What alternative milks do you have?",
        "Do you have oat milk?",
        "How much is a large latte?",
        "What flavors are available?",
        
        # Chitchat
        "Hi, how are you?",
        "Thank you so much!",
        "That's all, thanks!",
        "Have a great day!",
        "My sister has a soccer game today",
        "I am John nice to meet you",
    ]
    
    correct = 0
    total = len(test_cases)
    
    for text in test_cases:
        result = classifier.classify(text)
        
        # Determine expected intent (simple heuristic)
        expected = "ORDER"
        if any(neg in text.lower() for neg in ["not buying", "don't want", "won't"]):
            expected = "CHITCHAT"
        elif text.startswith("What") or text.startswith("Do you") or text.startswith("How"):
            expected = "QUESTION"
        elif any(word in text.lower() for word in ["hi", "thank", "that's all", "have a", "my sister", "i am"]):
            expected = "CHITCHAT"
        
        is_correct = result['intent'] == expected
        if is_correct:
            correct += 1
        
        status = "✅" if is_correct else "❌"
        
        print(f"{status} Text: \"{text}\"")
        print(f"   → Intent: {result['intent']:10} (expected: {expected:10})")
        print(f"      Confidence: {result['confidence']:.2%}")
        print(f"      Scores: ORDER={result['scores']['ORDER']:.1f}, "
              f"QUESTION={result['scores']['QUESTION']:.1f}, "
              f"CHITCHAT={result['scores']['CHITCHAT']:.1f}")
        if result.get('has_negative'):
            print(f"      🚫 Negative pattern detected")
        print()
    
    print(f"📊 Accuracy: {correct}/{total} = {correct/total:.1%}")

if __name__ == "__main__":
    demo_classifier()
