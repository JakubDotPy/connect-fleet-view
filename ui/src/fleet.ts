// The floor plan and how a printer reads on it. Pure: no component, no host.
import {
  type Device,
  PRINTER_STATE_SEVERITY_TIER,
  PRINTER_STATE_TONE,
  type PrinterState,
  type PrinterStateTone,
  printerStateOf,
  STATE_PATH,
  textAt,
} from '@prusa/connect-ui/domain';
import {
  PRINTER_MODELS,
  type PrinterModel,
} from '@prusa/connect-ui/primitives';

/** A slot kept for something other than a printer, such as room for maintenance. */
export type Placeholder = 'computer' | 'service';
export const PLACEHOLDERS: readonly Placeholder[] = ['computer', 'service'];

export interface Slot {
  name: string;
  printer: string | null;
  placeholder?: Placeholder;
}
export interface Shelf {
  name: string;
  slots: Slot[];
}
export interface Unit {
  id: string;
  name: string;
  /** Grid cell of the top-left corner on the floor. */
  x: number;
  y: number;
  /** Bottom shelf first. */
  shelves: Shelf[];
}
export interface Layout {
  units: Unit[];
}

/** What every view draws from; a layout read from elsewhere is held to it first. */
export const isLayout = (v: unknown): v is Layout =>
  typeof v === 'object' &&
  v !== null &&
  Array.isArray((v as Layout).units) &&
  (v as Layout).units.every(
    (u: unknown) =>
      typeof u === 'object' &&
      u !== null &&
      typeof (u as Unit).id === 'string' &&
      Array.isArray((u as Unit).shelves),
  );

/** Where a selection points: a unit, one of its shelves, or one printer. */
export interface Selection {
  unit: string;
  shelf?: number;
  printer?: string;
}

// How far the floor reaches. Wide enough for ten racks of twenty slots side by side.
export const FLOOR_COLUMNS = 240;
export const FLOOR_ROWS = 120;

export type Group = 'printing' | 'attention' | 'done' | 'idle' | 'silent';
export const GROUPS: readonly Group[] = [
  'printing',
  'attention',
  'done',
  'idle',
  'silent',
];

// The Overview's summary counts by these, and so does this page, so one
// printer reads the same on both.
const GROUP_OF_TONE: Readonly<Record<PrinterStateTone, Group>> = {
  active: 'printing',
  busy: 'printing',
  moving: 'printing',
  fault: 'attention',
  attention: 'attention',
  paused: 'attention',
  ready: 'done',
  finished: 'done',
  stopped: 'done',
  idle: 'idle',
  quiet: 'silent',
  offline: 'silent',
};

/** A disconnected machine reads OFFLINE, not the last thing it said. */
export const stateOf = (device: Device): PrinterState =>
  device.connected
    ? printerStateOf(textAt(device, STATE_PATH) ?? 'UNKNOWN')
    : 'OFFLINE';

/** The dashboard's rule: a loud state, or a warning or error the printer reports. */
export const groupOf = (device: Device): Group => {
  const state = stateOf(device);
  if (state === 'OFFLINE' || state === 'UNKNOWN') return 'silent';
  const tier = PRINTER_STATE_SEVERITY_TIER[state];
  const severity = device.issues?.[0]?.severity;
  if (
    tier === 'critical' ||
    tier === 'attention' ||
    severity === 'warning' ||
    severity === 'error'
  )
    return 'attention';

  return GROUP_OF_TONE[PRINTER_STATE_TONE[state]];
};

export const countGroups = (
  devices: readonly Device[],
): Record<Group, number> => {
  const counts: Record<Group, number> = {
    printing: 0,
    attention: 0,
    done: 0,
    idle: 0,
    silent: 0,
  };
  for (const device of devices) counts[groupOf(device)] += 1;

  return counts;
};

const folded = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]/g, '');
const ARTWORK = new Map<string, PrinterModel>(
  PRINTER_MODELS.map((model) => [folded(model), model]),
);

/** The drawing for a model spelling, matched the way core folds it. */
export const artworkOf = (device: Device): PrinterModel =>
  ARTWORK.get(folded(device.model)) ?? 'unknown';

/** Slots a printer takes on a shelf: an XL is two wide. */
export const widthOf = (device: Device | undefined): 1 | 2 =>
  device !== undefined && folded(device.model).startsWith('xl') ? 2 : 1;

export interface SlotCell {
  index: number;
  slot: Slot;
  device: Device | undefined;
  /** A printer id the fleet no longer holds. */
  missing: boolean;
  /** Covers this slot and the next. */
  wide: boolean;
}

/** The cells of a shelf, left to right, a wide printer read as one cell. */
export const cellsOf = (
  shelf: Shelf,
  device: (id: string) => Device | undefined,
): SlotCell[] => {
  const cells: SlotCell[] = [];
  let covered = false;
  for (const [index, slot] of shelf.slots.entries()) {
    if (covered) {
      covered = false;
      continue;
    }
    const found = slot.printer === null ? undefined : device(slot.printer);
    const wide = widthOf(found) === 2 && index + 1 < shelf.slots.length;
    cells.push({
      index,
      slot,
      device: found,
      missing: slot.printer !== null && found === undefined,
      wide,
    });
    covered = wide;
  }

  return cells;
};

export const printerIdsOf = (unit: Unit, shelf?: number): string[] =>
  unit.shelves
    .filter((_, index) => shelf === undefined || index === shelf)
    .flatMap((s) =>
      s.slots.flatMap((slot) => (slot.printer === null ? [] : [slot.printer])),
    );

export const placedIds = (layout: Layout): Set<string> =>
  new Set(layout.units.flatMap((unit) => printerIdsOf(unit)));

/** The slot a printer sits in, or undefined when it is unplaced. */
export const findPrinter = (
  layout: Layout,
  id: string,
): { shelf: Shelf; index: number; slot: Slot } | undefined => {
  for (const unit of layout.units)
    for (const shelf of unit.shelves)
      for (const [index, slot] of shelf.slots.entries())
        if (slot.printer === id) return { shelf, index, slot };

  return undefined;
};

const widthAt = (
  shelf: Shelf,
  index: number,
  device: (id: string) => Device | undefined,
): number => {
  const id = shelf.slots[index]?.printer ?? null;

  return id === null ? 0 : widthOf(device(id));
};

// A slot past the shelf's end reads as taken.
const isFree = (slot: Slot | undefined): boolean =>
  slot?.printer === null && slot.placeholder === undefined;

/** Whether a printer, or a placeholder when undefined, can go on this slot. */
export const fits = (
  shelf: Shelf,
  index: number,
  printer: Device | undefined,
  device: (id: string) => Device | undefined,
): boolean => {
  if (!isFree(shelf.slots[index])) return false;
  if (widthAt(shelf, index - 1, device) === 2) return false;
  if (widthOf(printer) === 1) return true;

  return isFree(shelf.slots[index + 1]);
};

/** Takes a printer off its slot, if it has one. */
export const unplace = (layout: Layout, id: string): void => {
  const at = findPrinter(layout, id);
  if (at) at.slot.printer = null;
};

/**
 * Puts a printer into a slot. Refused, with the layout unchanged, when the
 * slot cannot hold it; an occupied slot swaps with where the printer came from.
 */
export const place = (
  layout: Layout,
  shelf: Shelf,
  index: number,
  printer: Device,
  device: (id: string) => Device | undefined,
): boolean => {
  const target = shelf.slots[index];
  if (target === undefined) return false;
  const from = findPrinter(layout, printer.id);
  const displaced = target.printer === printer.id ? null : target.printer;
  if (from) from.slot.printer = null;
  target.printer = null;

  if (!fits(shelf, index, printer, device)) {
    target.printer = displaced;
    if (from) from.slot.printer = printer.id;

    return false;
  }
  target.printer = printer.id;
  const back = displaced === null ? undefined : device(displaced);
  if (back && from && fits(from.shelf, from.index, back, device))
    from.slot.printer = back.id;

  return true;
};

/**
 * A unit's footprint on the floor, in grid cells: a cell per slot across, a
 * row per shelf and one for its name. A slot is one cell in every rack, so a
 * printer is the same size wherever it stands.
 */
export const footprintOf = (unit: Unit): { w: number; h: number } => ({
  // One more cell across holds the frame and the card's edges.
  w: Math.max(2, ...unit.shelves.map((s) => s.slots.length)) + 1,
  h: unit.shelves.length + 1,
});

/** The first spot on the floor, row by row, where a unit fits. */
export const firstFree = (
  layout: Layout,
  unit: Unit,
): { x: number; y: number } | undefined => {
  for (let y = 1; y < FLOOR_ROWS; y++)
    for (let x = 1; x < FLOOR_COLUMNS; x++)
      if (!overlaps(layout, unit, x, y)) return { x, y };

  return undefined;
};

/**
 * Gives a shelf n slots, adding empty ones on the right or taking them off
 * it. Answers how many printers lost their place: one on a slot taken off, or
 * an XL whose second slot was.
 */
export const resizeShelf = (
  shelf: Shelf,
  n: number,
  device: (id: string) => Device | undefined,
): number => {
  if (n < 1) return 0;
  while (shelf.slots.length < n)
    shelf.slots.push({ name: String(shelf.slots.length + 1), printer: null });
  const removed = shelf.slots.splice(n);
  let lost = removed.filter((slot) => slot.printer !== null).length;
  const last = shelf.slots[n - 1];
  if (last?.printer != null && widthOf(device(last.printer)) === 2) {
    last.printer = null;
    lost += 1;
  }

  return lost;
};

/** True when the unit at x, y would leave the floor or touch another unit. */
export const overlaps = (
  layout: Layout,
  unit: Unit,
  x: number,
  y: number,
): boolean => {
  const { w, h } = footprintOf(unit);
  if (x < 0 || y < 0 || x + w > FLOOR_COLUMNS || y + h > FLOOR_ROWS)
    return true;

  return layout.units.some((other) => {
    if (other.id === unit.id) return false;
    const o = footprintOf(other);

    return (
      x < other.x + o.w &&
      other.x < x + w &&
      y < other.y + o.h &&
      other.y < y + h
    );
  });
};

export interface Names {
  rack(n: number): string;
  shelf(n: number): string;
}

export const emptyShelf = (name: string, slots: number): Shelf => ({
  name,
  slots: Array.from({ length: slots }, (_, i) => ({
    name: String(i + 1),
    printer: null,
  })),
});

export const newUnit = (
  layout: Layout,
  names: Names,
  shelves = 3,
  slots = 3,
): Unit => ({
  id: `rack-${Date.now().toString(36)}`,
  name: names.rack(layout.units.length + 1),
  x: 0,
  y: 0,
  shelves: Array.from({ length: shelves }, (_, s) =>
    emptyShelf(names.shelf(s + 1), slots),
  ),
});

/**
 * A first layout from the printers there are: a 3x3 rack and a one-shelf rack
 * holding the last printer, so a new page shows the floor and a rack at once.
 */
export const seedLayout = (
  devices: readonly Device[],
  names: Names,
): Layout => {
  const layout: Layout = { units: [] };
  if (devices.length === 0) return layout;
  const rack = {
    ...newUnit(layout, names),
    id: 'rack-1',
    x: 1,
    y: 1,
  };
  layout.units.push(rack);
  const sorted = [...devices].sort((a, b) => a.name.localeCompare(b.name));
  const last = sorted.length > 1 ? sorted.pop() : undefined;
  const lookup = (id: string) => devices.find((d) => d.id === id);
  for (const device of sorted)
    rack.shelves.some((shelf) =>
      shelf.slots.some(
        (_, i) =>
          fits(shelf, i, device, lookup) &&
          place(layout, shelf, i, device, lookup),
      ),
    );
  if (last) {
    const low = { ...newUnit(layout, names, 1, 2), id: 'rack-2', x: 5, y: 1 };
    layout.units.push(low);
    const top = low.shelves[0];
    if (top) place(layout, top, 0, last, lookup);
  }

  return layout;
};
