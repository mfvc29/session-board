import { Component, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { BoardService, StrokeData } from './board.service';
import { getStroke } from 'perfect-freehand';
import { Toolbar } from '../toolbar/toolbar';
import { Subscription } from 'rxjs';

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

  // Two separate subscriptions: one for metadata, one for strokes
  private sessionSub: Subscription | null = null;
  private strokesSub: Subscription | null = null;

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const sessionId = params.get('id');
      if (sessionId) {
        this.sessionId.set(sessionId);
        const role = this.route.snapshot.queryParamMap.get('role') || 'student';
        this.role.set(role);
        this.joinSession(sessionId);
      } else {
        this.router.navigate(['/']);
      }
    });
  }

  onIframeLoad(event: Event) {
    const iframe = event.target as HTMLIFrameElement;
    try {
      if (iframe.contentWindow && iframe.contentWindow.document.body) {
        const height = iframe.contentWindow.document.documentElement.scrollHeight;
        iframe.style.height = height + 'px';
      }
    } catch (e) {
      console.warn('Cannot auto-resize iframe:', e);
    }
  }

  ngOnDestroy() {
    this.sessionSub?.unsubscribe();
    this.strokesSub?.unsubscribe();
  }

  joinSession(sessionId: string) {
    this.sessionSub?.unsubscribe();
    this.strokesSub?.unsubscribe();

    // Subscribe to session metadata (HTML + images) — small doc, rarely changes
    this.sessionSub = this.boardService.getSession(sessionId).subscribe(data => {
      if (data) {
        if (data.images) {
          this.images.set(Array.isArray(data.images) ? data.images : [data.images]);
        }
        if (data.htmlContent && !this.iframeSrc()) {
          const blob = new Blob([data.htmlContent], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          this.iframeSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        }
      } else {
        this.resetSession();
      }
    });

    // Subscribe to strokes subcollection — each stroke is a tiny separate doc
    this.strokesSub = this.boardService.getStrokes(sessionId).subscribe(strokes => {
      this.allStrokes.set(strokes || []);
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
        // Optimistic update locally
        this.allStrokes.update(s => [...s, newStroke]);
        // Send small individual stroke doc to Firebase
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
        const processed = this.boardService.processHtmlTemplate(result);
        const blob = new Blob([processed], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        this.iframeSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        if (this.sessionId()) {
          this.boardService.updateSessionHtml(this.sessionId(), processed);
        }
      }
    };
    reader.readAsText(file);
  }

  handleImageUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        this.images.update(imgs => [...imgs, result]);
        if (this.sessionId()) {
          this.boardService.addImage(this.sessionId(), result);
        }
      }
    };
    reader.readAsDataURL(file);
  }

  handleEndSession() {
    if (this.sessionId()) {
      this.boardService.endSession(this.sessionId());
      this.resetSession();
      this.router.navigate(['/']);
    }
  }
}
