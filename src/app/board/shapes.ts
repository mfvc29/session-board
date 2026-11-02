export type BoardMode = 'draw' | 'pointer' | 'eraser' | 'shape' | 'hand';

export type ShapeKind =
  // Figuras planas
  | 'line'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'right-triangle'
  | 'rhombus'
  | 'parallelogram'
  | 'trapezoid'
  | 'pentagon'
  | 'hexagon'
  // Figuras 3D
  | 'cube'
  | 'prism'
  | 'triangular-prism'
  | 'pyramid'
  | 'cylinder'
  | 'cone'
  | 'sphere';

/** Drag start (x0, y0) and end (x1, y1); every shape is rebuilt from these. */
export interface ShapeBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** `hiddenPath` holds the back edges of 3D solids, drawn dashed. */
export interface ShapeGeometry {
  path: string;
  hiddenPath?: string;
}

export const SHAPE_STROKE_WIDTH = 3;

export function isLineShape(kind: ShapeKind): boolean {
  return kind === 'line' || kind === 'arrow';
}

/** Cubes and spheres are always regular; the other shapes only while Shift is held. */
export function mustConstrain(kind: ShapeKind, shift: boolean): boolean {
  return shift || kind === 'cube' || kind === 'sphere';
}

/**
 * Lines snap to 15° steps; any other shape gets a square bounding box
 * (square, circle, cube...), keeping the drag direction.
 */
export function constrainEnd(kind: ShapeKind, x0: number, y0: number, x1: number, y1: number): [number, number] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (isLineShape(kind)) {
    const len = Math.hypot(dx, dy);
    const step = Math.PI / 12;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    return [x0 + len * Math.cos(angle), y0 + len * Math.sin(angle)];
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return [x0 + side * (Math.sign(dx) || 1), y0 + side * (Math.sign(dy) || 1)];
}

export function shapeGeometry(kind: ShapeKind, { x0, y0, x1, y1 }: ShapeBox): ShapeGeometry {
  const l = Math.min(x0, x1);
  const rt = Math.max(x0, x1);
  const t = Math.min(y0, y1);
  const b = Math.max(y0, y1);
  const w = rt - l;
  const h = b - t;
  const cx = (l + rt) / 2;
  const cy = (t + b) / 2;
  // Depth offset of the oblique projection used by the solids
  const k = Math.min(w, h) * 0.3;

  switch (kind) {
    case 'line':
      return { path: open([x0, y0], [x1, y1]) };
    case 'arrow': {
      const angle = Math.atan2(y1 - y0, x1 - x0);
      const head = Math.min(18, Math.max(8, Math.hypot(x1 - x0, y1 - y0) * 0.3));
      const spread = Math.PI / 7;
      const a: Pt = [x1 - head * Math.cos(angle - spread), y1 - head * Math.sin(angle - spread)];
      const c: Pt = [x1 - head * Math.cos(angle + spread), y1 - head * Math.sin(angle + spread)];
      return { path: `${open([x0, y0], [x1, y1])} ${open(a, [x1, y1], c)}` };
    }
    case 'rect':
      return { path: closed([l, t], [rt, t], [rt, b], [l, b]) };
    case 'ellipse':
      return { path: ellipse(cx, cy, w / 2, h / 2) };
    case 'triangle':
      // Apex follows the drag start, so dragging upwards draws it upside down.
      return { path: closed([cx, y0], [x1, y1], [x0, y1]) };
    case 'right-triangle':
      // Right angle sits at (x0, y1).
      return { path: closed([x0, y0], [x0, y1], [x1, y1]) };
    case 'rhombus':
      return { path: closed([cx, t], [rt, cy], [cx, b], [l, cy]) };
    case 'parallelogram': {
      const s = w * 0.25;
      return { path: closed([l + s, t], [rt, t], [rt - s, b], [l, b]) };
    }
    case 'trapezoid': {
      const s = w * 0.2;
      return { path: closed([l + s, t], [rt - s, t], [rt, b], [l, b]) };
    }
    case 'pentagon':
      return { path: polygon(cx, cy, w / 2, h / 2, 5) };
    case 'hexagon':
      return { path: polygon(cx, cy, w / 2, h / 2, 6) };

    case 'cube':
    case 'prism': {
      // Front face bottom-left, back face shifted up-right by k
      const f1: Pt = [l, t + k], f2: Pt = [rt - k, t + k], f3: Pt = [rt - k, b], f4: Pt = [l, b];
      const b1: Pt = [l + k, t], b2: Pt = [rt, t], b3: Pt = [rt, b - k], b4: Pt = [l + k, b - k];
      return {
        path: `${closed(f1, f2, f3, f4)} ${open(f1, b1, b2, f2)} ${open(b2, b3, f3)}`,
        hiddenPath: `${open(f4, b4, b1)} ${open(b4, b3)}`,
      };
    }
    case 'triangular-prism': {
      const fl: Pt = [l, b], fr: Pt = [rt - k, b], fa: Pt = [(l + rt - k) / 2, t + k];
      const bl: Pt = [l + k, b - k], br: Pt = [rt, b - k], ba: Pt = [(l + k + rt) / 2, t];
      return {
        path: `${closed(fl, fr, fa)} ${open(fa, ba, br, fr)}`,
        hiddenPath: `${open(fl, bl, br)} ${open(bl, ba)}`,
      };
    }
    case 'pyramid': {
      // Square base in perspective, apex above its centre
      const fl: Pt = [l, b], fr: Pt = [rt - k, b], br: Pt = [rt, b - k], bl: Pt = [l + k, b - k];
      const apex: Pt = [cx, t];
      return {
        path: `${open(fl, fr, br)} ${open(fl, apex, fr)} ${open(apex, br)}`,
        hiddenPath: `${open(br, bl, fl)} ${open(bl, apex)}`,
      };
    }
    case 'cylinder': {
      const ry = Math.min(h / 6, w / 4);
      const top = t + ry;
      const bottom = b - ry;
      return {
        path: `${ellipse(cx, top, w / 2, ry)} ${open([l, top], [l, bottom])} ${open([rt, top], [rt, bottom])} ${halfEllipse(l, rt, bottom, ry, true)}`,
        hiddenPath: halfEllipse(l, rt, bottom, ry, false),
      };
    }
    case 'cone': {
      const ry = Math.min(h / 6, w / 4);
      const base = b - ry;
      return {
        path: `${open([l, base], [cx, t], [rt, base])} ${halfEllipse(l, rt, base, ry, true)}`,
        hiddenPath: halfEllipse(l, rt, base, ry, false),
      };
    }
    case 'sphere': {
      const rad = Math.min(w, h) / 2;
      return {
        path: `${ellipse(cx, cy, rad, rad)} ${halfEllipse(cx - rad, cx + rad, cy, rad * 0.3, true)}`,
        hiddenPath: halfEllipse(cx - rad, cx + rad, cy, rad * 0.3, false),
      };
    }
  }
}

type Pt = [number, number];

function pt([x, y]: Pt): string {
  return `${r(x)} ${r(y)}`;
}

function open(...pts: Pt[]): string {
  return `M${pts.map(pt).join(' L')}`;
}

function closed(...pts: Pt[]): string {
  return `${open(...pts)} Z`;
}

function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${pt([cx - rx, cy])} A${r(rx)} ${r(ry)} 0 1 0 ${pt([cx + rx, cy])} A${r(rx)} ${r(ry)} 0 1 0 ${pt([cx - rx, cy])} Z`;
}

/** Lower (front) or upper (back) half of a horizontal ellipse spanning left..right. */
function halfEllipse(left: number, right: number, cy: number, ry: number, front: boolean): string {
  const rx = (right - left) / 2;
  return `M${pt([left, cy])} A${r(rx)} ${r(ry)} 0 0 ${front ? 0 : 1} ${pt([right, cy])}`;
}

/** Regular polygon inscribed in the ellipse (cx, cy, rx, ry), first vertex on top. */
function polygon(cx: number, cy: number, rx: number, ry: number, sides: number): string {
  const pts: Pt[] = [];
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return closed(...pts);
}

function r(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Shape catalog for the toolbar; icons are the real geometry drawn in a 24x24 box. */
type CatalogEntry = { kind: ShapeKind; label: string; box?: [number, number, number, number] };

const PLANE: CatalogEntry[] = [
  { kind: 'line', label: 'Línea', box: [4, 20, 20, 4] },
  { kind: 'arrow', label: 'Flecha', box: [4, 20, 20, 4] },
  { kind: 'rect', label: 'Rectángulo', box: [2, 6, 22, 18] },
  { kind: 'ellipse', label: 'Círculo / Elipse', box: [2, 5, 22, 19] },
  { kind: 'triangle', label: 'Triángulo' },
  { kind: 'right-triangle', label: 'Triángulo rectángulo' },
  { kind: 'rhombus', label: 'Rombo', box: [3, 2, 21, 22] },
  { kind: 'parallelogram', label: 'Paralelogramo', box: [2, 6, 22, 18] },
  { kind: 'trapezoid', label: 'Trapecio', box: [2, 6, 22, 18] },
  { kind: 'pentagon', label: 'Pentágono', box: [2, 2.5, 22, 22] },
  { kind: 'hexagon', label: 'Hexágono', box: [2, 2, 22, 22] },
];

const SOLIDS: CatalogEntry[] = [
  { kind: 'cube', label: 'Cubo', box: [2, 2, 22, 22] },
  { kind: 'prism', label: 'Paralelepípedo', box: [1, 5, 23, 20] },
  { kind: 'triangular-prism', label: 'Prisma triangular', box: [2, 3, 22, 21] },
  { kind: 'pyramid', label: 'Pirámide', box: [2, 2, 22, 22] },
  { kind: 'cylinder', label: 'Cilindro', box: [5, 2, 19, 22] },
  { kind: 'cone', label: 'Cono', box: [4, 2, 20, 22] },
  { kind: 'sphere', label: 'Esfera', box: [2, 2, 22, 22] },
];

function toShapeOption({ kind, label, box = [3, 3, 21, 21] }: CatalogEntry) {
  const [x0, y0, x1, y1] = box;
  return { kind, label, icon: shapeGeometry(kind, { x0, y0, x1, y1 }) };
}

export type ShapeOption = ReturnType<typeof toShapeOption>;

export const SHAPE_GROUPS: { title: string; shapes: ShapeOption[] }[] = [
  { title: 'Figuras planas', shapes: PLANE.map(toShapeOption) },
  { title: 'Figuras 3D', shapes: SOLIDS.map(toShapeOption) },
];

export const SHAPES: ShapeOption[] = SHAPE_GROUPS.flatMap(g => g.shapes);
