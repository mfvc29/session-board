import { Component, ElementRef, signal, computed, inject, viewChild, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BoardService, StrokeData, StudentRequest } from './board.service';
import { getStroke } from 'perfect-freehand';
import { Toolbar } from '../toolbar/toolbar';
import { LatexComponent } from '../components/latex/latex.component';
import { Subscription, firstValueFrom } from 'rxjs';
import { Auth, authState } from '@angular/fire/auth';
import { BoardMode, ShapeBox, ShapeKind, SHAPE_STROKE_WIDTH, constrainEnd, isLineShape, mustConstrain, shapeGeometry } from './shapes';

type XKey = 'x0' | 'x1';
type YKey = 'y0' | 'y1';
/** A resize handle moves one x and one y coordinate of the shape box. */
interface Handle { xKey: XKey; yKey: YKey; }

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

/** Stores the shape box (rounded) and rebuilds its SVG paths from it. */
function withGeometry(stroke: StrokeData, box: ShapeBox): StrokeData {
  const round = (n: number) => Math.round(n * 10) / 10;
  const rounded = { x0: round(box.x0), y0: round(box.y0), x1: round(box.x1), y1: round(box.y1) };
  const { path, hiddenPath } = shapeGeometry(stroke.shape!, rounded);
  return { ...stroke, ...rounded, path, hiddenPath };
}

@Component({
  selector: 'app-board',
  imports: [Toolbar, LatexComponent],
  templateUrl: './board.html',
  styleUrl: './board.scss',
  host: {
    '(document:keydown)': 'onKeyDown($event)',
  },
})
export class Board implements OnInit, OnDestroy {
  private boardService = inject(BoardService);
  private route = inject(ActivatedRoute);
  private auth = inject(Auth);
  router = inject(Router);

  sessionId = signal<string>('');
  currentMode = signal<BoardMode>('draw');
  currentColor = signal<string>('#111111');
  currentShape = signal<ShapeKind>('rect');
  currentPoints = signal<number[][]>([]);
  shapeDraft = signal<ShapeBox | null>(null);
  readonly shapeStrokeWidth = SHAPE_STROKE_WIDTH;
  selectedId = signal<string | null>(null);
  private canvas = viewChild<ElementRef<SVGSVGElement>>('canvas');
  /** Shape being moved (handle null) or resized with the hand tool. */
  private edit: { id: string; handle: Handle | null; startX: number; startY: number; orig: ShapeBox; moved: boolean } | null = null;
  /** Stroke ids present in the last server snapshot, to detect remote deletions. */
  private serverIds = new Set<string>();
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

    // Subscribe to strokes: merge with local state. Local-only strokes (never seen on
    // the server, e.g. Firestore blocked) are kept; strokes the server had and no longer
    // has were deleted by someone else; server versions win for edits, except for the
    // shape this user is dragging right now.
    this.serverIds = new Set();
    this.strokesSub = this.boardService.getStrokes(sessionId).subscribe(strokes => {
      const fromServer = new Map(strokes.map(s => [s.id, s]));
      const removed = [...this.serverIds].filter(id => !fromServer.has(id));
      this.serverIds = new Set(fromServer.keys());
      const editingId = this.edit?.id;

      this.allStrokes.update(local => {
        const localIds = new Set(local.map(s => s.id));
        const merged = local
          .filter(s => !removed.includes(s.id))
          .map(s => (s.id !== editingId && fromServer.get(s.id)) || s);
        const added = strokes.filter(s => !localIds.has(s.id));
        return [...merged, ...added];
      });
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

  currentShapeGeometry = computed(() => {
    const d = this.shapeDraft();
    return d ? shapeGeometry(this.currentShape(), d) : null;
  });

  /** Bounding box + handles of the shape selected with the hand tool. */
  selection = computed(() => {
    if (this.currentMode() !== 'hand') return null;
    const stroke = this.allStrokes().find(s => s.id === this.selectedId());
    if (!stroke || !this.isEditable(stroke) || !this.isVisible(stroke)) return null;
    const { x0, y0, x1, y1 } = stroke as StrokeData & ShapeBox;
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);
    const corners: Handle[] = isLineShape(stroke.shape!)
      ? [{ xKey: 'x0', yKey: 'y0' }, { xKey: 'x1', yKey: 'y1' }]
      : [{ xKey: 'x0', yKey: 'y0' }, { xKey: 'x1', yKey: 'y0' }, { xKey: 'x0', yKey: 'y1' }, { xKey: 'x1', yKey: 'y1' }];
    const handles = corners.map(h => {
      const x = stroke[h.xKey]!;
      const y = stroke[h.yKey]!;
      return { ...h, x, y, cursor: (x === left) === (y === top) ? 'nwse-resize' : 'nesw-resize' };
    });
    const width = Math.abs(x1 - x0);
    const height = Math.abs(y1 - y0);
    // Delete button just outside the top-right corner, kept inside the board
    const deleteX = left + width + 22;
    const deleteY = Math.max(14, top - 22);
    return { stroke, left, top, width, height, handles, deleteX, deleteY };
  });

  isEditable(stroke: StrokeData) {
    return stroke.type === 'shape' && !!stroke.shape && stroke.x0 !== undefined;
  }

  handlePointerDown(e: PointerEvent, exerciseId: string | null = null) {
    const mode = this.currentMode();
    if (mode === 'hand') {
      // Shapes and handles stop propagation, so this is a click on empty board
      this.selectedId.set(null);
      return;
    }
    if (mode !== 'draw' && mode !== 'shape') return;
    (e.target as Element).setPointerCapture(e.pointerId);
    this.activeDrawingExerciseId.set(exerciseId);
    if (mode === 'shape') {
      this.shapeDraft.set({ x0: e.offsetX, y0: e.offsetY, x1: e.offsetX, y1: e.offsetY });
    } else {
      this.currentPoints.set([[e.offsetX, e.offsetY, e.pressure]]);
    }
  }

  handlePointerMove(e: PointerEvent) {
    const mode = this.currentMode();
    if (e.buttons !== 1) return;
    if (mode === 'hand') {
      this.dragEdit(e);
      return;
    }
    if (mode !== 'draw' && mode !== 'shape') return;
    if (mode === 'shape') {
      const d = this.shapeDraft();
      if (!d) return;
      const kind = this.currentShape();
      const [x1, y1] = mustConstrain(kind, e.shiftKey)
        ? constrainEnd(kind, d.x0, d.y0, e.offsetX, e.offsetY)
        : [e.offsetX, e.offsetY];
      this.shapeDraft.set({ ...d, x1, y1 });
      return;
    }
    this.currentPoints.update(pts => [...pts, [e.offsetX, e.offsetY, e.pressure]]);
  }

  handlePointerUp(e: PointerEvent) {
    const mode = this.currentMode();
    if (mode === 'hand') {
      this.finishEdit();
      return;
    }
    if (mode === 'shape') {
      this.finishShape();
      return;
    }
    if (mode !== 'draw') return;
    const pts = this.currentPoints();
    if (pts.length > 0) {
      const stroke = getStroke(pts, { size: 6 });
      if (stroke.length > 0) {
        this.saveStroke({
          id: Date.now().toString(),
          color: this.currentColor(),
          path: getSvgPathFromStroke(stroke)
        });
      }
    }
    this.currentPoints.set([]);
    this.activeDrawingExerciseId.set(null);
  }

  private finishShape() {
    const d = this.shapeDraft();
    // Ignore clicks / tiny drags so they don't leave invisible shapes behind
    if (d && Math.hypot(d.x1 - d.x0, d.y1 - d.y0) > 4) {
      this.saveStroke(withGeometry({
        id: Date.now().toString(),
        color: this.currentColor(),
        path: '',
        type: 'shape',
        width: SHAPE_STROKE_WIDTH,
        shape: this.currentShape()
      }, d));
    }
    this.shapeDraft.set(null);
    this.activeDrawingExerciseId.set(null);
  }

  private saveStroke(newStroke: StrokeData) {
    const exerciseId = this.activeDrawingExerciseId();
    if (exerciseId) newStroke.exerciseId = exerciseId;

    this.allStrokes.update(s => [...s, newStroke]);
    if (this.sessionId()) {
      this.boardService.addStroke(this.sessionId(), newStroke).catch(() => {});
    }
  }

  /** Strokes saved without an exercise must still show when no exercise is active. */
  isVisible(stroke: StrokeData) {
    return (stroke.exerciseId ?? null) === this.activeExerciseId();
  }

  // ===== HAND TOOL: select, move, resize, recolor and delete shapes =====

  /** Pointer position in board coordinates, whatever element got the event. */
  private toBoard(e: PointerEvent): [number, number] {
    const rect = this.canvas()!.nativeElement.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  onShapePointerDown(e: PointerEvent, stroke: StrokeData) {
    if (this.currentMode() === 'eraser') {
      this.eraseStroke(e, stroke.id);
    } else {
      this.startEdit(e, stroke, null);
    }
  }

  startEdit(e: PointerEvent, stroke: StrokeData, handle: Handle | null) {
    if (this.currentMode() !== 'hand' || !this.isEditable(stroke)) return;
    e.stopPropagation();
    this.canvas()!.nativeElement.setPointerCapture(e.pointerId);
    const [x, y] = this.toBoard(e);
    const { x0, y0, x1, y1 } = stroke as StrokeData & ShapeBox;
    this.selectedId.set(stroke.id);
    this.edit = { id: stroke.id, handle, startX: x, startY: y, orig: { x0, y0, x1, y1 }, moved: false };
  }

  private dragEdit(e: PointerEvent) {
    const edit = this.edit;
    const stroke = edit && this.allStrokes().find(s => s.id === edit.id);
    if (!edit || !stroke) return;
    const [x, y] = this.toBoard(e);
    const o = edit.orig;
    let box: ShapeBox;
    if (!edit.handle) {
      const dx = x - edit.startX;
      const dy = y - edit.startY;
      box = { x0: o.x0 + dx, y0: o.y0 + dy, x1: o.x1 + dx, y1: o.y1 + dy };
    } else {
      const { xKey, yKey } = edit.handle;
      // The opposite corner stays fixed while resizing
      const ox = xKey === 'x0' ? o.x1 : o.x0;
      const oy = yKey === 'y0' ? o.y1 : o.y0;
      const kind = stroke.shape!;
      const [px, py] = mustConstrain(kind, e.shiftKey) ? constrainEnd(kind, ox, oy, x, y) : [x, y];
      box = { ...o, [xKey]: px, [yKey]: py };
    }
    edit.moved = true;
    this.allStrokes.update(list => list.map(s => (s.id === edit.id ? withGeometry(s, box) : s)));
  }

  private finishEdit() {
    const edit = this.edit;
    this.edit = null;
    if (!edit?.moved) return;
    const stroke = this.allStrokes().find(s => s.id === edit.id);
    if (stroke) this.persistStroke(stroke);
  }

  private persistStroke(stroke: StrokeData) {
    this.allStrokes.update(list => list.map(s => (s.id === stroke.id ? stroke : s)));
    if (this.sessionId()) {
      this.boardService.updateStroke(this.sessionId(), stroke).catch(() => {});
    }
  }

  deleteSelected(e?: Event) {
    e?.stopPropagation();
    const id = this.selection()?.stroke.id;
    if (!id) return;
    this.allStrokes.update(list => list.filter(s => s.id !== id));
    this.selectedId.set(null);
    if (this.sessionId()) {
      this.boardService.deleteStroke(this.sessionId(), id).catch(() => {});
    }
  }

  onKeyDown(e: KeyboardEvent) {
    if (!this.selection()) return;
    if ((e.target as HTMLElement).closest?.('input, textarea, [contenteditable]')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.deleteSelected();
    } else if (e.key === 'Escape') {
      this.selectedId.set(null);
    }
  }

  changeColor(color: string) {
    this.currentColor.set(color);
    // With the hand tool, picking a color recolors the selected shape
    const sel = this.selection();
    if (sel) this.persistStroke({ ...sel.stroke, color });
  }
  changeShape(shape: ShapeKind) { this.currentShape.set(shape); }
  handleModeToggle(mode: BoardMode) {
    this.currentMode.set(mode);
    if (mode !== 'hand') this.selectedId.set(null);
  }

  eraseStroke(event: PointerEvent, strokeId: string) {
    if (this.currentMode() !== 'eraser') return;
    
    // Only erase if pointer button is pressed (or if it's a pointer down event)
    if (event.buttons === 1 || event.type === 'pointerdown') {
      // Optimistically remove locally
      this.allStrokes.update(strokes => strokes.filter(s => s.id !== strokeId));
      
      // Remove from server
      const sessionId = this.sessionId();
      if (sessionId) {
        this.boardService.deleteStroke(sessionId, strokeId).catch(() => {});
      }
    }
  }
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
