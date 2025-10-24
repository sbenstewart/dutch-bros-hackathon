import { Component, OnInit } from '@angular/core';
import { PosScreenComponent } from './components/pos-screen/pos-screen.component';
import { TranscriptionComponent } from './components/transcription/transcription.component';
import { NotificationBannerComponent } from './components/notification-banner/notification-banner.component';
import { WebsocketService } from './services/websocket.service';

@Component({
  selector: 'app-root',
  standalone: true, 
  imports: [
    PosScreenComponent,
    TranscriptionComponent,
    NotificationBannerComponent
  ], 
  template: `
    <app-notification-banner></app-notification-banner>
    <div class="app-layout">
      <app-pos-screen class="main-content"></app-pos-screen>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100vh;
      box-sizing: border-box;
      font-family: Arial, sans-serif;
    }
    .app-layout {
      display: flex;
      flex-direction: row;
      height: 100%;
    }
    .main-content {
      flex-grow: 1;
      overflow-y: auto;
    }
    .transcription-sidebar {
      width: 300px;
      flex-shrink: 0;
      border-left: 1px solid #ccc;
      padding: 1rem;
      box-sizing: border-box;
    }
  `]
})
export class App implements OnInit {
  
  constructor(private websocketService: WebsocketService) {}

  ngOnInit(): void {
    console.log('🔌 Connecting to WebSocket...');
    this.websocketService.connectNotifications();
  }
}
