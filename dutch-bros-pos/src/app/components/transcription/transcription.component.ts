// 1. Import ChangeDetectorRef
import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { TranscriptionService } from '../../services/transcription.service';

@Component({
  selector: 'app-transcription',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './transcription.component.html',
  styleUrls: ['./transcription.component.css']
  // We are assuming ChangeDetectionStrategy.OnPush is active
  // even if it's not explicitly written, this fix is safe.
})
export class TranscriptionComponent implements OnInit, OnDestroy {
  isTranscribing = false;
  finalTranscript = '';
  partialTranscript = '';
  errorMessage = '';
  
  private subs = new Subscription();

  // 2. Inject ChangeDetectorRef in the constructor
  constructor(
    private transcriptionService: TranscriptionService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    // 3. Handle FINAL transcripts
    this.subs.add(
      this.transcriptionService.finalTranscript$.subscribe(text => {
        // Append final text and clear the partial text
        this.finalTranscript += text + ' ';
        this.partialTranscript = '';
        
        // 4. TELL ANGULAR TO UPDATE!
        this.cdr.markForCheck();
      })
    );

    // 5. Handle PARTIAL transcripts
    this.subs.add(
      this.transcriptionService.partialTranscript$.subscribe(text => {
        // Just update the partial text
        this.partialTranscript = text;
        
        // 6. TELL ANGULAR TO UPDATE!
        this.cdr.markForCheck();
      })
    );

    // 7. Handle Errors
    this.subs.add(
      this.transcriptionService.error$.subscribe(error => {
        this.errorMessage = error;
        this.isTranscribing = false; // Stop on error
        
        // 8. TELL ANGULAR TO UPDATE!
        this.cdr.markForCheck();
      })
    );
  }

  onStart(): void {
    this.isTranscribing = true;
    this.finalTranscript = '';
    this.partialTranscript = '';
    this.errorMessage = '';
    this.transcriptionService.startTranscription();
  }

  onStop(): void {
    this.isTranscribing = false;
    this.transcriptionService.stopTranscription();
  }

  ngOnDestroy(): void {
    // Clean up all subscriptions
    this.subs.unsubscribe();
    
    // Ensure we stop if the component is destroyed
    if (this.isTranscribing) {
      this.onStop();
    }
  }
}