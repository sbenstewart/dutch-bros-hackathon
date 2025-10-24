import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebsocketService } from '../../services/websocket.service';
import { Subscription } from 'rxjs';

export interface Notification {
  id: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  timestamp: string;
  dismissed?: boolean;
}

@Component({
  selector: 'app-notification-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-banner.component.html',
  styleUrls: ['./notification-banner.component.css']
})
export class NotificationBannerComponent implements OnInit, OnDestroy {
  notifications: Notification[] = [];
  private subscription?: Subscription;

  constructor(
    private websocketService: WebsocketService,
    private cdr: ChangeDetectorRef
  ) {
    console.log('📢 NotificationBannerComponent created');
  }

  ngOnInit(): void {
    console.log('📢 NotificationBannerComponent initialized, subscribing to notifications...');
    
    this.subscription = this.websocketService.notification$.subscribe({
      next: (notification: any) => {
        console.log('📢 Banner received notification:', notification);
        
        this.notifications.unshift(notification);
        console.log('📢 Current notifications count:', this.notifications.length);
        
        // Force change detection
        this.cdr.detectChanges();
        
        setTimeout(() => {
          this.dismissNotification(notification.id);
        }, 10000);
        
        if (this.notifications.length > 3) {
          this.notifications = this.notifications.slice(0, 3);
        }
      },
      error: (err) => console.error('❌ Notification subscription error:', err)
    });
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  dismissNotification(id: string): void {
    console.log('❌ Dismissing notification:', id);
    const notif = this.notifications.find(n => n.id === id);
    if (notif) {
      notif.dismissed = true;
      this.cdr.detectChanges();
      
      setTimeout(() => {
        this.notifications = this.notifications.filter(n => n.id !== id);
        this.websocketService.dismissNotification(id);
        this.cdr.detectChanges();
      }, 300);
    }
  }

  trackById(index: number, item: Notification): string {
    return item.id;
  }

  getPriorityClass(priority: string): string {
    return `notification-${priority}`;
  }
}
