import { Injectable, NgZone } from '@angular/core';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { Subject, Observable } from 'rxjs';

// This interface matches the JSON your Python server sends
export interface TranscriptMessage {
  status: 'PARTIAL_SEGMENT' | 'FINAL_SEGMENT' | 'ERROR';
  transcript?: string;
  detail?: string;
}

@Injectable({
  providedIn: 'root'
})
export class TranscriptionService {
  
  // WebSocket URL from your Python server
  private socketUrl = 'ws://localhost:8000/ws/transcribe-live';
  private socket$: WebSocketSubject<TranscriptMessage | ArrayBuffer> | null = null;
  
  // Observables for the component to subscribe to
  private partialTranscriptSubject = new Subject<string>();
  private finalTranscriptSubject = new Subject<string>();
  private errorSubject = new Subject<string>();
  
  // ✅ ADD THIS - Subject to notify when transcription stops
  private transcriptionStoppedSubject = new Subject<void>();
  
  public partialTranscript$: Observable<string> = this.partialTranscriptSubject.asObservable();
  public finalTranscript$: Observable<string> = this.finalTranscriptSubject.asObservable();
  public error$: Observable<string> = this.errorSubject.asObservable();
  
  // ✅ ADD THIS - Observable that components can subscribe to
  public transcriptionStopped$: Observable<void> = this.transcriptionStoppedSubject.asObservable();

  // Web Audio API state
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioWorkletNode: AudioWorkletNode | null = null;

  // Inject NgZone
  constructor(private zone: NgZone) { }

  private connect(): void {
    if (this.socket$ && !this.socket$.closed) {
      return; // Already connected
    }

    // Create the WebSocket connection
    this.socket$ = webSocket<TranscriptMessage | ArrayBuffer>({
      url: this.socketUrl,
      binaryType: 'arraybuffer', 
      deserializer: (msg) => JSON.parse(msg.data),
      serializer: (value:any) => value 
    });

    //
    // !!! THIS IS THE FIX !!!
    // We wrap the *entire subscription* in NgZone.run()
    // This ensures all its callbacks (next, error) run inside Angular's zone.
    //
    this.zone.run(() => {
      this.socket$?.subscribe({
        next: (message) => {
          
          // This log should now be REAL-TIME
          console.log('SERVICE LOG: Received message from Python:', message); 
  
          if (typeof message === 'object' && message !== null && 'status' in message) {
            
            if (message.status === 'PARTIAL_SEGMENT') {
              this.partialTranscriptSubject.next(message.transcript || '');
            } else if (message.status === 'FINAL_SEGMENT') {
              this.finalTranscriptSubject.next(message.transcript || '');
            } else if (message.status === 'ERROR') {
              console.error('Error from backend:', message.detail);
              this.errorSubject.next(message.detail || 'Unknown backend error');
            }
          }
          // We no longer need a separate zone.run() *inside* here.
        },
        error: (err) => {
          // This error callback is now also in the zone
          console.error('WebSocket error:', err);
          this.errorSubject.next('WebSocket connection error.');
        },
        complete: () => console.log('WebSocket connection closed')
      });
    }); // --- End of zone.run() ---
  }

  async startTranscription(): Promise<void> {
    try {
      this.connect(); // Ensure WebSocket is ready

      // 1. Get user microphone permission
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 2. Create AudioContext and load our worklet
      this.audioContext = new AudioContext({ sampleRate: 48000 }); 
      await this.audioContext.audioWorklet.addModule('assets/audio-processor.js');

      // 3. Create the AudioWorkletNode
      this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'audio-processor', {
        processorOptions: {
          targetSampleRate: 16000 // Pass the target rate to the worklet
        }
      });

      // 4. Set up the message handler from the worklet
      this.audioWorkletNode.port.onmessage = (event) => {
        // event.data is the ArrayBuffer of 16-bit PCM audio
        if (this.socket$) {
          this.socket$.next(event.data); // Send the audio chunk to Python
        }
      };

      // 5. Connect the audio graph: Mic -> Worklet
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.audioWorkletNode);

    } catch (err) {
      console.error('Error starting transcription:', err);
      let message = 'Error starting transcription.';
      if (err instanceof Error && err.name === 'NotAllowedError') {
        message = 'Microphone permission was denied. Please allow microphone access.';
      }
      
      // This error handler needs to be in the zone too, 
      // just in case the promise rejection happened outside.
      this.zone.run(() => {
        this.errorSubject.next(message);
      });
    }
  }

  stopTranscription(): void {
    try {
      // 1. Stop microphone tracks
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }

      // 2. Close the AudioContext
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
        this.audioContext = null;
      }
      
      // 3. Disconnect the worklet
      if (this.audioWorkletNode) {
        this.audioWorkletNode.disconnect();
        this.audioWorkletNode.port.close();
        this.audioWorkletNode = null;
      }

      // 4. Close the WebSocket
      if (this.socket$) {
        this.socket$.complete();
        this.socket$ = null;
      }

      // ✅ ADD THIS - Notify that transcription has stopped
      console.log('🛑 Transcription stopped - notifying subscribers');
      this.zone.run(() => {
        this.transcriptionStoppedSubject.next();
      });

    } catch (err) {
      console.error('Error stopping transcription:', err);
    }
  }
}