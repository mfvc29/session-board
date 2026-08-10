import { Component, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { BoardService, StrokeData } from './board.service';
import { getStroke } from 'perfect-freehand';
import { Toolbar } from '../toolbar/toolbar';

export function getSvgPathFromStroke(stroke: number[][]) {
  if (!stroke.length) return '';
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...stroke[0], 'Q']
  );
  d.push('Z');
  return d.join(' ');
}

@Component({
  selector: 'app-board',
  imports: [Toolbar],
  templateUrl: './board.html',
  styleUrl: './board.scss',
})
export class Board implements OnInit, OnDestroy {
  private sanitizer = inject(DomSanitizer);
  private boardService = inject(BoardService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  sessionId = signal<string>('');
  
  iframeSrc = signal<SafeResourceUrl | null>(null);
  currentMode = signal<'draw' | 'pointer'>('draw');
  
  currentColor = signal<string>('#ffffff');
  currentPoints = signal<number[][]>([]);
  allStrokes = signal<StrokeData[]>([]);
  images = signal<string[]>([]);
  role = signal<string>('student');

  private sessionSub: any;

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const sessionId = params.get('id');
      if (sessionId) {
        this.sessionId.set(sessionId);
        
        // Only the teacher explicitly creates the session document
        const role = this.route.snapshot.queryParamMap.get('role') || 'student';
        this.role.set(role);

        if (role === 'teacher') {
          this.boardService.createSession(sessionId).then(() => {
            this.joinSession(sessionId);
          });
        } else {
          this.joinSession(sessionId);
        }
      } else {
        this.router.navigate(['/']);
      }
    });
  }

  ngOnDestroy() {
    if (this.sessionSub) {
      this.sessionSub.unsubscribe();
    }
  }

  joinSession(sessionId: string) {
    if (this.sessionSub) this.sessionSub.unsubscribe();
    
    this.sessionSub = this.boardService.getSession(sessionId).subscribe(data => {
      if (data) {
        this.allStrokes.set(data.strokes || []);
        this.images.set(data.images || []);
        if (data.htmlContent && !this.iframeSrc()) {
          // Sync HTML if someone else uploaded it
          const blob = new Blob([data.htmlContent], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          this.iframeSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        }
      } else {
        // If data is null/undefined, it means the session was ended (deleted)
        this.resetSession();
      }
    });
  }

  resetSession() {
    this.allStrokes.set([]);
    this.images.set([]);
    this.iframeSrc.set(null);
  }
  
  currentPath = computed(() => {
    const pts = this.currentPoints();
    if (pts.length === 0) return '';
    const stroke = getStroke(pts, {
      size: 6,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
    });
    return getSvgPathFromStroke(stroke);
  });

  handlePointerDown(e: PointerEvent) {
    if (this.currentMode() !== 'draw') return;
    (e.target as Element).setPointerCapture(e.pointerId);
    this.currentPoints.set([[e.offsetX, e.offsetY, e.pressure]]);
  }

  handlePointerMove(e: PointerEvent) {
    if (this.currentMode() !== 'draw') return;
    if (e.buttons !== 1) return;
    this.currentPoints.update(pts => [...pts, [e.offsetX, e.offsetY, e.pressure]]);
  }

  handlePointerUp(e: PointerEvent) {
    if (this.currentMode() !== 'draw') return;
    const pts = this.currentPoints();
    if (pts.length > 0) {
      const stroke = getStroke(pts, { size: 6 });
      if (stroke.length > 0) {
        const path = getSvgPathFromStroke(stroke);
        const newStroke: StrokeData = {
          id: Date.now().toString(),
          points: pts,
          color: this.currentColor(),
          path
        };
        // Optimistic update
        this.allStrokes.update(s => [...s, newStroke]);
        // Send to Firebase
        if (this.sessionId()) {
          this.boardService.addStroke(this.sessionId(), newStroke);
        }
      }
    }
    this.currentPoints.set([]);
  }

  changeColor(color: string) {
    this.currentColor.set(color);
  }

  handleModeToggle(mode: 'draw' | 'pointer') {
    this.currentMode.set(mode);
  }

  clearBoard() {
    if (this.sessionId()) {
      this.boardService.clearStrokes(this.sessionId());
    } else {
      this.allStrokes.set([]);
    }
  }

  handleHtmlUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        const blob = new Blob([result], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        this.iframeSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        
        // Broadcast the HTML to others in the session
        if (this.sessionId()) {
          this.boardService.updateSessionHtml(this.sessionId(), result);
        }
      }
    };
    reader.readAsText(file);
  }

  handleImageUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string; // Base64 data URL
      if (result) {
        // Add to local state (optimistic)
        this.images.update(imgs => [...imgs, result]);
        
        // Broadcast to others
        if (this.sessionId()) {
          this.boardService.addImage(this.sessionId(), result);
        }
      }
    };
    // readAsDataURL gives us a base64 string
    reader.readAsDataURL(file);
  }

  handleEndSession() {
    if (this.sessionId()) {
      this.boardService.endSession(this.sessionId());
      this.resetSession();
      // Optionally reset the session ID and create a new one, but let's just clear everything
    }
  }
}
