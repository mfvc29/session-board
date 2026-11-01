export type BoardMode = 'draw' | 'pointer' | 'eraser' | 'shape';

export type ShapeKind =
  | 'line'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'right-triangle'
  | 'rhombus'
  | 'pentagon'
  | 'hexagon';

export const SHAPE_STROKE_WIDTH = 3;

/** Shape catalog used by the toolbar: `icon` is an SVG path drawn in a 24x24 box. */
export const SHAPES: { kind: ShapeKind; label: string; icon: string }[] = [
  { kind: 'line', label: 'Línea', icon: 'M4 20 L20 4' },
  { kind: 'arrow', label: 'Flecha', icon: 'M4 20 L20 4 M11 4 H20 V13' },
  { kind: 'rect', label: 'Rectángulo', icon: 'M3 6 H21 V18 H3 Z' },
  { kind: 'ellipse', label: 'Círculo / Elipse', icon: 'M3 12 A9 7 0 1 0 21 12 A9 7 0 1 0 3 12 Z' },
  { kind: 'triangle', label: 'Triángulo', icon: 'M12 3 L21 20 H3 Z' },
  { kind: 'right-triangle', label: 'Triángulo rectángulo', icon: 'M4 3 V20 H20 Z M4 15 H9 V20' },
  { kind: 'rhombus', label: 'Rombo', icon: 'M12 2 L21 12 L12 22 L3 12 Z' },
  { kind: 'pentagon', label: 'Pentágono', icon: polygonPath(12, 12.5, 9.5, 9.5, 5) },
  { kind: 'hexagon', label: 'Hexágono', icon: polygonPath(12, 12, 10, 10, 6) },
];

/**
 * Applies the Shift modifier: lines snap to 15° steps and the other shapes
 * become regular (square, circle, equilateral-ish box).
 */
export function constrainEnd(kind: ShapeKind, x0: number, y0: number, x1: number, y1: number): [number, number] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (kind === 'line' || kind === 'arrow') {
    const len = Math.hypot(dx, dy);
    const step = Math.PI / 12;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    return [x0 + len * Math.cos(angle), y0 + len * Math.sin(angle)];
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return [x0 + side * (Math.sign(dx) || 1), y0 + side * (Math.sign(dy) || 1)];
}

/** Builds the SVG path of a shape dragged from (x0, y0) to (x1, y1). */
export function shapePath(kind: ShapeKind, x0: number, y0: number, x1: number, y1: number): string {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = (right - left) / 2;
  const ry = (bottom - top) / 2;

  switch (kind) {
    case 'line':
      return `M${r(x0)} ${r(y0)} L${r(x1)} ${r(y1)}`;
    case 'arrow': {
      const angle = Math.atan2(y1 - y0, x1 - x0);
      const head = Math.min(18, Math.max(8, Math.hypot(x1 - x0, y1 - y0) * 0.3));
      const spread = Math.PI / 7;
      const ax = x1 - head * Math.cos(angle - spread);
      const ay = y1 - head * Math.sin(angle - spread);
      const bx = x1 - head * Math.cos(angle + spread);
      const by = y1 - head * Math.sin(angle + spread);
      return `M${r(x0)} ${r(y0)} L${r(x1)} ${r(y1)} M${r(ax)} ${r(ay)} L${r(x1)} ${r(y1)} L${r(bx)} ${r(by)}`;
    }
    case 'rect':
      return `M${r(left)} ${r(top)} H${r(right)} V${r(bottom)} H${r(left)} Z`;
    case 'ellipse':
      return `M${r(cx - rx)} ${r(cy)} A${r(rx)} ${r(ry)} 0 1 0 ${r(cx + rx)} ${r(cy)} A${r(rx)} ${r(ry)} 0 1 0 ${r(cx - rx)} ${r(cy)} Z`;
    case 'triangle':
      // Apex follows the drag start, so dragging upwards draws it upside down.
      return `M${r(cx)} ${r(y0)} L${r(x1)} ${r(y1)} L${r(x0)} ${r(y1)} Z`;
    case 'right-triangle':
      // Right angle sits at (x0, y1).
      return `M${r(x0)} ${r(y0)} L${r(x0)} ${r(y1)} L${r(x1)} ${r(y1)} Z`;
    case 'rhombus':
      return `M${r(cx)} ${r(top)} L${r(right)} ${r(cy)} L${r(cx)} ${r(bottom)} L${r(left)} ${r(cy)} Z`;
    case 'pentagon':
      return polygonPath(cx, cy, rx, ry, 5);
    case 'hexagon':
      return polygonPath(cx, cy, rx, ry, 6);
  }
}

/** Regular polygon inscribed in the ellipse (cx, cy, rx, ry), first vertex on top. */
function polygonPath(cx: number, cy: number, rx: number, ry: number, sides: number): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    pts.push(`${r(cx + rx * Math.cos(a))} ${r(cy + ry * Math.sin(a))}`);
  }
  return `M${pts.join(' L')} Z`;
}

function r(n: number): number {
  return Math.round(n * 10) / 10;
}
