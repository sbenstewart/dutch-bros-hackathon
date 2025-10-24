import { Injectable } from '@angular/core';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { Subject, Observable } from 'rxjs';

export interface Notification {
  id: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private notificationSocket$: WebSocketSubject<any> | null = null;
  private notificationSubject = new Subject<Notification>();
  
  public notification$: Observable<Notification> = this.notificationSubject.asObservable();

  constructor() {}

  connectNotifications(): void {
    if (this.notificationSocket$ && !this.notificationSocket$.closed) {
      console.log('🔌 Notification WebSocket already connected');
      return;
    }

    console.log('🔌 Connecting to notification WebSocket...');
    
    this.notificationSocket$ = webSocket({
      url: 'ws://localhost:8000/ws/notifications',
      deserializer: (msg) => JSON.parse(msg.data)
    });

    this.notificationSocket$.subscribe({
      next: (notification) => {
        console.log('📬 Received notification:', notification);
        this.notificationSubject.next(notification);
      },
      error: (err) => {
        console.error('❌ Notification WebSocket error:', err);
      },
      complete: () => {
        console.log('🔌 Notification WebSocket closed');
      }
    });
  }

  disconnectNotifications(): void {
    if (this.notificationSocket$) {
      this.notificationSocket$.complete();
      this.notificationSocket$ = null;
      console.log('🔌 Disconnected from notification WebSocket');
    }
  }

  dismissNotification(id: string): void {
    if (this.notificationSocket$) {
      this.notificationSocket$.next({ action: 'dismiss', notification_id: id });
    }
  }
}
