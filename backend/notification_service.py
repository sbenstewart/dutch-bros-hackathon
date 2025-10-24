from datetime import datetime
from typing import List, Dict, Optional
from enum import Enum
import asyncio

class NotificationType(Enum):
    """Types of notifications"""
    PEAK_APPROACHING = "peak_approaching"
    PEAK_ACTIVE = "peak_active"
    CROWD_HIGH = "crowd_high"
    INVENTORY_LOW = "inventory_low"
    TAKE_BREAK = "take_break"
    PREP_REMINDER = "prep_reminder"
    CLEANING_TIME = "cleaning_time"
    COLD_BREW_PREP = "cold_brew_prep"
    RUSH_WARNING = "rush_warning"
    RESTOCK = "restock"
    SLOW_PERIOD = "slow_period"
    STAFFING_SUGGESTION = "staffing_suggestion"
    EVENING_RUSH = "evening_rush"
    CLOSING_TIME = "closing_time"

class NotificationPriority(Enum):
    """Priority levels for notifications"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class Notification:
    """Notification object"""
    def __init__(
        self,
        notification_id: str,
        type: NotificationType,
        priority: NotificationPriority,
        title: str,
        message: str,
        timestamp: datetime,
        action: Optional[str] = None,
        data: Optional[Dict] = None
    ):
        self.id = notification_id
        self.type = type
        self.priority = priority
        self.title = title
        self.message = message
        self.timestamp = timestamp
        self.action = action
        self.data = data or {}
        self.dismissed = False
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return {
            "id": self.id,
            "type": self.type.value,
            "priority": self.priority.value,
            "title": self.title,
            "message": self.message,
            "timestamp": self.timestamp.isoformat(),
            "action": self.action,
            "data": self.data,
            "dismissed": self.dismissed
        }

class NotificationService:
    """
    Manages all notifications for Dutch Bros operations
    Handles timing, deduplication, and notification rules
    """
    
    def __init__(self):
        self.notifications: List[Notification] = []
        self.notification_history: List[Notification] = []
        self.last_break_reminder = None
        self.orders_since_break = 0
        self.notification_counter = 0
        
    def generate_notification_id(self) -> str:
        """Generate unique notification ID"""
        self.notification_counter += 1
        return f"notif_{int(datetime.now().timestamp())}_{self.notification_counter}"
    
    def add_notification(self, notification: Notification):
        """Add a notification to active list"""
        self.notifications.append(notification)
        self.notification_history.append(notification)
        
        # Keep history limited to last 100
        if len(self.notification_history) > 100:
            self.notification_history = self.notification_history[-100:]
    
    def dismiss_notification(self, notification_id: str):
        """Dismiss a notification"""
        for notif in self.notifications:
            if notif.id == notification_id:
                notif.dismissed = True
                self.notifications.remove(notif)
                break
    
    def get_active_notifications(self) -> List[Dict]:
        """Get all active notifications as dictionaries"""
        return [n.to_dict() for n in self.notifications if not n.dismissed]
    
    def clear_old_notifications(self, current_time: datetime, max_age_minutes: int = 10):
        """Remove notifications older than specified age"""
        cutoff = current_time.timestamp() - (max_age_minutes * 60)
        self.notifications = [
            n for n in self.notifications
            if n.timestamp.timestamp() > cutoff
        ]
