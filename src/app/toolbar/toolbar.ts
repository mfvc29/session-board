import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { LucideAngularModule, PenTool, Eraser, Undo, Trash2, Image, MousePointer2, Power, Hand } from 'lucide-angular';
import { BoardMode, SHAPES, SHAPE_GROUPS, ShapeKind } from '../board/shapes';

@Component({
  selector: 'app-toolbar',
  imports: [LucideAngularModule],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'openPanel.set(null)',
  },
})
export class Toolbar {
  private el = inject(ElementRef<HTMLElement>);

  currentColor = input<string>('#ffffff');
  currentShape = input<ShapeKind>('rect');
  role = input<string>('student');
  colorChange = output<string>();
  shapeChange = output<ShapeKind>();
  clear = output<void>();
  uploadImage = output<File>();
  endSession = output<void>();
  toggleMode = output<BoardMode>();

  currentMode: BoardMode = 'draw';
  openPanel = signal<'shapes' | 'colors' | null>(null);

  readonly PenTool = PenTool;
  readonly Eraser = Eraser;
  readonly MousePointer2 = MousePointer2;
  readonly Undo = Undo;
  readonly Trash2 = Trash2;
  readonly Image = Image;
  readonly Power = Power;
  readonly Hand = Hand;

  colors = ['#111111', '#ff4757', '#2ed573', '#1e90ff', '#ffa502'];

  /** Extended palette: neutrals + 8 hues in dark / mid / light shades. */
  extraColors = [
    '#000000', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#ffffff', '#78350f', '#a16207',
    '#991b1b', '#c2410c', '#ca8a04', '#15803d', '#0f766e', '#1d4ed8', '#6d28d9', '#be185d',
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
    '#fca5a5', '#fdba74', '#fde047', '#86efac', '#5eead4', '#93c5fd', '#c4b5fd', '#f9a8d4',
  ];

  shapeGroups = SHAPE_GROUPS;
  activeShapeIcon = computed(() => SHAPES.find(s => s.kind === this.currentShape())?.icon ?? SHAPES[0].icon);
  isCustomColor = computed(() => !this.colors.includes(this.currentColor()));

  selectColor(color: string) {
    this.colorChange.emit(color);
  }

  pickFromPalette(color: string) {
    this.selectColor(color);
    this.openPanel.set(null);
  }

  togglePanel(panel: 'shapes' | 'colors') {
    this.openPanel.update(p => (p === panel ? null : panel));
  }

  onShapeButton() {
    if (this.currentMode !== 'shape') this.setMode('shape');
    this.togglePanel('shapes');
  }

  selectShape(kind: ShapeKind) {
    this.shapeChange.emit(kind);
    this.setMode('shape');
    this.openPanel.set(null);
  }

  onDocumentPointerDown(event: PointerEvent) {
    if (this.openPanel() && !this.el.nativeElement.contains(event.target as Node)) {
      this.openPanel.set(null);
    }
  }

  onClear() {
    this.clear.emit();
  }

  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.uploadImage.emit(input.files[0]);
    }
  }

  setMode(mode: BoardMode) {
    this.currentMode = mode;
    this.openPanel.set(null);
    this.toggleMode.emit(mode);
  }
}
