import { Component } from '@angular/core';
import { PosScreenComponent } from './components/pos-screen/pos-screen.component';
import { TranscriptionComponent } from './components/transcription/transcription.component'; // 1. Import new component

@Component({
  selector: 'app-root',
  standalone: true, 
  imports: [
    PosScreenComponent,
    TranscriptionComponent // 2. Add to imports
  ], 
  template: `
    <div class="app-layout">
      <app-pos-screen class="main-content"></app-pos-screen>
      <app-transcription class="transcription-sidebar"></app-transcription>
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

    /* 4. Add layout styles */
    .app-layout {
      display: flex;
      flex-direction: row; /* Horizontal layout */
      height: 100%;
    }

    .main-content {
      flex-grow: 1; /* POS screen takes up available space */
      overflow-y: auto; /* Allow POS screen to scroll */
    }

    .transcription-sidebar {
      width: 300px; /* Set a fixed width for the sidebar */
      flex-shrink: 0; /* Prevent sidebar from shrinking */
      border-left: 1px solid #ccc; /* Visual separator */
      padding: 1rem;
      box-sizing: border-box;
      overflow-y: auto;
    }
  `]
})
export class App {
  // No complex logic is needed here
}