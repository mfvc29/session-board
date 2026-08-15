import { Component, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BoardService, StrokeData, StudentRequest } from './board.service';
import { getStroke } from 'perfect-freehand';
import { Toolbar } from '../toolbar/toolbar';
import { LatexComponent } from '../components/latex/latex.component';
import { Subscription, firstValueFrom } from 'rxjs';
import { Auth, authState } from '@angular/fire/auth';

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
  imports: [Toolbar, LatexComponent],
  templateUrl: './board.html',
  styleUrl: './board.scss',
})
export class Board implements OnInit, OnDestroy {
  private boardService = inject(BoardService);
  private route = inject(ActivatedRoute);
  private auth = inject(Auth);
  router = inject(Router);

  sessionId = signal<string>('');
  currentMode = signal<'draw' | 'pointer'>('draw');
  currentColor = signal<string>('#111111');
  currentPoints = signal<number[][]>([]);
  activeDrawingExerciseId = signal<string | null>(null);
  activeExerciseId = signal<string | null>(null);
  allStrokes = signal<StrokeData[]>([]);
  images = signal<string[]>([]);
  role = signal<string>('student');
  exercises = signal<any[]>([]);
  user = signal<any>(null);

  // Student waiting room state
  studentStatus = signal<'pending' | 'approved' | 'rejected' | null>(null);
  myStudentId = signal<string>('');
  myStudentName = signal<string>('');

  // Teacher: list of pending/approved students
  studentRequests = signal<StudentRequest[]>([]);
  pendingStudents = computed(() => this.studentRequests().filter(s => s.status === 'pending'));
  approvedStudents = computed(() => this.studentRequests().filter(s => s.status === 'approved'));

  private sessionSub: Subscription | null = null;
  private strokesSub: Subscription | null = null;
  private statusSub: Subscription | null = null;
  private studentsSub: Subscription | null = null;

  ngOnInit() {
    authState(this.auth).subscribe(u => this.user.set(u));
    this.route.paramMap.subscribe(async params => {
      const sessionId = params.get('id');
      if (sessionId) {
        // Wait for Auth state
        const user = await firstValueFrom(authState(this.auth));
        if (!user) {
          console.warn("Usuario no autenticado. Redirigiendo a inicio.");
          this.router.navigate(['/']);
          return;
        }

        this.sessionId.set(sessionId);
        const role = this.route.snapshot.queryParamMap.get('role') || 'student';
        const name = this.route.snapshot.queryParamMap.get('name') || user.displayName || 'Alumno';
        this.role.set(role);

        if (role === 'teacher') {
          this.joinSession(sessionId);
        } else {
          // Student: must request to join first
          const studentId = 'student-' + Math.random().toString(36).substring(2, 10);
          this.myStudentId.set(studentId);
          this.myStudentName.set(name);
          this.requestJoinSession(sessionId, studentId, name);
        }
      } else {
        this.router.navigate(['/']);
      }
    });
  }

  ngOnDestroy() {
    this.sessionSub?.unsubscribe();
    this.strokesSub?.unsubscribe();
    this.statusSub?.unsubscribe();
    this.studentsSub?.unsubscribe();
  }

  /** Student requests to join and waits for approval */
  requestJoinSession(sessionId: string, studentId: string, name: string) {
    this.studentStatus.set('pending');

    // Write to Firestore (may be blocked by Brave)
    this.boardService.requestJoin(sessionId, studentId, name).catch(err => {
      console.error('Error in requestJoin:', err);
    });

    // Fallback: if no Firestore response in 5s, auto-approve (Brave/offline scenario)
    const fallbackTimer = setTimeout(() => {
      if (this.studentStatus() === 'pending') {
        console.warn('Firestore unreachable — auto-approving student');
        this.studentStatus.set('approved');
        this.joinSession(sessionId);
      }
    }, 5000);

    // Watch my status doc — if Firestore works, this fires before the timeout
    this.statusSub = this.boardService.watchMyStatus(sessionId, studentId).subscribe(data => {
      if (data && data.status && data.status !== 'pending') {
        // Only clear timer on a definitive answer (approved or rejected)
        clearTimeout(fallbackTimer);
        this.studentStatus.set(data.status);
        if (data.status === 'approved') {
          this.joinSession(sessionId);
        }
      }
    });
  }

  joinSession(sessionId: string) {
    this.sessionSub?.unsubscribe();
    this.strokesSub?.unsubscribe();
    this.studentsSub?.unsubscribe();

    // Teacher watches student requests
    if (this.role() === 'teacher') {
      this.studentsSub = this.boardService.getStudentRequests(sessionId).subscribe(reqs => {
        this.studentRequests.set(reqs || []);
      });
    }

    // Subscribe to session metadata
    this.sessionSub = this.boardService.getSession(sessionId).subscribe(data => {
      if (data) {
        if (data.images) {
          this.images.set(Array.isArray(data.images) ? data.images : [data.images]);
        }
        if (data.exercises && data.exercises.length > 0) {
          this.exercises.set(data.exercises);
          if (!this.activeExerciseId()) {
            this.activeExerciseId.set(data.exercises[0].id);
          }
        }
      } else {
        this.resetSession();
      }
    });

    // Subscribe to strokes: MERGE, never wipe
    this.strokesSub = this.boardService.getStrokes(sessionId).subscribe(strokes => {
      if (strokes && strokes.length > 0) {
        this.allStrokes.update(local => {
          const localIds = new Set(local.map(s => s.id));
          const newFromServer = strokes.filter(s => !localIds.has(s.id));
          return newFromServer.length > 0 ? [...local, ...newFromServer] : local;
        });
      }
    });
  }

  resetSession() {
    this.allStrokes.set([]);
    this.images.set([]);
    this.exercises.set([]);
  }

  // Teacher approval actions
  approveStudent(studentId: string) {
    this.boardService.approveStudent(this.sessionId(), studentId).catch(console.error);
  }

  rejectStudent(studentId: string) {
    this.boardService.rejectStudent(this.sessionId(), studentId).catch(console.error);
  }


  currentPath = computed(() => {
    const pts = this.currentPoints();
    if (pts.length === 0) return '';
    const stroke = getStroke(pts, { size: 6, thinning: 0.5, smoothing: 0.5, streamline: 0.5 });
    return getSvgPathFromStroke(stroke);
  });

  handlePointerDown(e: PointerEvent, exerciseId: string | null = null) {
    if (this.currentMode() !== 'draw') return;
    (e.target as Element).setPointerCapture(e.pointerId);
    this.activeDrawingExerciseId.set(exerciseId);
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
        const exerciseId = this.activeDrawingExerciseId();
        const newStroke: StrokeData = {
          id: Date.now().toString(),
          color: this.currentColor(),
          path
        };
        if (exerciseId) newStroke.exerciseId = exerciseId;

        this.allStrokes.update(s => [...s, newStroke]);
        if (this.sessionId()) {
          this.boardService.addStroke(this.sessionId(), newStroke).catch(() => {});
        }
      }
    }
    this.currentPoints.set([]);
    this.activeDrawingExerciseId.set(null);
  }

  changeColor(color: string) { this.currentColor.set(color); }
  handleModeToggle(mode: 'draw' | 'pointer') { this.currentMode.set(mode); }
  selectExercise(id: string) { this.activeExerciseId.set(id); }

  clearBoard() {
    if (this.sessionId()) {
      this.boardService.clearStrokes(this.sessionId()).catch(() => {});
    }
    this.allStrokes.set([]);
  }

  async addExercise(statement: string, a: string, b: string, c: string, d: string) {
    if (!statement.trim()) return;
    const exercise = {
      id: crypto.randomUUID(),
      statement,
      options: { a, b, c, d }
    };

    this.exercises.update(exs => {
      if (!exs.find(e => e.id === exercise.id)) return [...exs, exercise];
      return exs;
    });

    if (!this.activeExerciseId()) this.activeExerciseId.set(exercise.id);

    try {
      await this.boardService.updateExercises(this.sessionId(), this.exercises());
    } catch (error) {
      console.error('Error saving exercise:', error);
    }
  }

  handleImageUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) this.images.update(imgs => [...imgs, result]);
    };
    reader.readAsDataURL(file);
  }

  handleEndSession() {
    if (this.sessionId()) {
      this.boardService.endSession(this.sessionId()).catch(console.error);
      this.resetSession();
      this.router.navigate(['/']);
    }
  }
}
