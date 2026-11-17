// The layout as a file people and agents write by hand: YAML, or JSON, which
// is YAML too. Printers are named by their name or serial number, never by
// an id, because ids differ from one server to the next.
import type { Device } from '@prusa/connect-ui/domain';
import { Document, isMap, isScalar, isSeq, parse, visit } from 'yaml';

import {
  emptyShelf,
  type Placeholder,
  PLACEHOLDERS,
  firstFree,
  fits,
  type Layout,
  overlaps,
  place,
  type Unit,
} from './fleet';

export const FILE_VERSION = 1;

interface FileSlot {
  name?: string;
  placeholder?: Placeholder;
  printer?: string;
  serial?: string;
}
interface FileShelf {
  name?: string;
  slots: FileSlot[];
}
interface FileUnit {
  name: string;
  at?: [number, number];
  /** Top shelf first, as a rack is read. */
  shelves: FileShelf[];
}

/** The layout as the file holds it, the top shelf of every rack first. */
export const toYaml = (
  layout: Layout,
  device: (id: string) => Device | undefined,
): string => {
  const units: FileUnit[] = layout.units.map((unit) => ({
    name: unit.name,
    at: [unit.x, unit.y],
    shelves: [...unit.shelves].reverse().map((shelf) => ({
      name: shelf.name,
      slots: shelf.slots.map((slot) => {
        if (slot.placeholder)
          return { name: slot.name, placeholder: slot.placeholder };
        const d = slot.printer === null ? undefined : device(slot.printer);

        return d
          ? {
              name: slot.name,
              printer: d.name,
              ...(d.serial ? { serial: d.serial } : {}),
            }
          : { name: slot.name };
      }),
    })),
  }));

  // A cell and a slot each fit on one line, as people write them by hand.
  const doc = new Document({ version: FILE_VERSION, units });
  visit(doc, {
    Pair(_, pair) {
      if (!isScalar(pair.key) || !isSeq(pair.value)) return;
      if (pair.key.value === 'at') pair.value.flow = true;
      if (pair.key.value === 'slots')
        for (const item of pair.value.items) if (isMap(item)) item.flow = true;
    },
  });

  return doc.toString({ flowCollectionPadding: true });
};

export interface ImportReport {
  units: number;
  slots: number;
  placed: number;
  /** Names and serials no printer of this server answers to. */
  unknown: string[];
  /** Printers named on more than one slot; the first slot keeps them. */
  repeated: string[];
  /** Printers that did not fit where the file put them, such as an XL on the last slot. */
  misfit: string[];
  /** Units whose `at` was taken or missing, put on the first free spot instead. */
  moved: string[];
}

/** What is wrong with a file, as a text key of this module and its values. */
export interface ImportError {
  key: string;
  params?: Record<string, string>;
}

export type ImportResult =
  | { ok: true; layout: Layout; report: ImportReport }
  | { ok: false; error: ImportError };

const refuse = (
  key: string,
  params?: Record<string, string>,
): ImportResult => ({
  ok: false,
  error: { key: `fleet-view.file.error.${key}`, ...(params ? { params } : {}) },
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const text = (v: unknown): string | undefined =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;

/**
 * Reads a layout file against the printers this server knows. A file that is
 * not a layout is refused with what is wrong and where; a printer it names
 * that is not here leaves its slot empty and is listed in the report.
 */
export const fromYaml = (
  source: string,
  devices: readonly Device[],
  current: Layout = { units: [] },
): ImportResult => {
  let doc: unknown;
  try {
    doc = parse(source);
  } catch (e) {
    return refuse('syntax', {
      detail: e instanceof Error ? e.message : String(e),
    });
  }
  if (!isRecord(doc) || !Array.isArray(doc.units)) return refuse('units');
  if (doc.version !== undefined && doc.version !== FILE_VERSION)
    return refuse('version', {
      found: JSON.stringify(doc.version),
      expected: String(FILE_VERSION),
    });

  const byName = new Map(devices.map((d) => [d.name.toLowerCase(), d]));
  const bySerial = new Map(
    devices.filter((d) => d.serial).map((d) => [d.serial.toLowerCase(), d]),
  );
  const lookup = (id: string): Device | undefined =>
    devices.find((d) => d.id === id);

  const layout: Layout = { units: [] };
  const report: ImportReport = {
    units: 0,
    slots: 0,
    placed: 0,
    unknown: [],
    repeated: [],
    misfit: [],
    moved: [],
  };
  const used = new Set<string>();
  // A rack keeps its id when the file names one already here, so whatever
  // points at it, such as a dashboard card, still finds it.
  const keptIds = new Map(current.units.map((u) => [u.name, u.id]));
  const wanted: { unit: Unit; at: [number, number] | undefined }[] = [];

  for (const [u, raw] of doc.units.entries()) {
    const where = `units[${String(u)}]`;
    if (!isRecord(raw)) return refuse('unit', { where });
    if (!Array.isArray(raw.shelves) || raw.shelves.length === 0)
      return refuse('shelves', { where });
    const at =
      Array.isArray(raw.at) &&
      raw.at.length === 2 &&
      raw.at.every((n) => Number.isInteger(n) && (n as number) >= 0)
        ? ([raw.at[0], raw.at[1]] as [number, number])
        : undefined;

    const name = text(raw.name) ?? `R${String(u + 1)}`;
    const kept = keptIds.get(name);
    keptIds.delete(name);
    const unit: Unit = {
      id: kept ?? `rack-${String(u + 1)}-${Date.now().toString(36)}`,
      name,
      x: 0,
      y: 0,
      shelves: [],
    };

    // Read in the file's order, top shelf first, so "first" in the report is
    // first as written; the unit keeps its bottom shelf first.
    const shelves = raw.shelves as unknown[];
    for (const [s, rawShelf] of shelves.entries()) {
      const shelfWhere = `${where}.shelves[${String(s)}]`;
      if (
        !isRecord(rawShelf) ||
        !Array.isArray(rawShelf.slots) ||
        rawShelf.slots.length === 0
      )
        return refuse('slots', { where: shelfWhere });
      const shelf = emptyShelf(
        text(rawShelf.name) ?? String(shelves.length - s),
        rawShelf.slots.length,
      );
      unit.shelves.unshift(shelf);
      for (const [i, rawSlot] of (rawShelf.slots as unknown[]).entries()) {
        report.slots += 1;
        const slotRecord = isRecord(rawSlot) ? rawSlot : { name: rawSlot };
        const target = shelf.slots[i];
        if (!target) continue;
        target.name = text(slotRecord.name) ?? String(i + 1);
        if (slotRecord.placeholder !== undefined) {
          const kind = PLACEHOLDERS.find((k) => k === slotRecord.placeholder);
          if (kind === undefined)
            return refuse('placeholder', {
              where: `${shelfWhere}.slots[${String(i)}]`,
              value: JSON.stringify(slotRecord.placeholder),
            });
          if (fits(shelf, i, undefined, lookup)) target.placeholder = kind;
          else report.misfit.push(target.name);
          continue;
        }
        const serial = text(slotRecord.serial)?.toLowerCase();
        const printerName = text(slotRecord.printer)?.toLowerCase();
        if (serial === undefined && printerName === undefined) continue;
        const found =
          (serial ? bySerial.get(serial) : undefined) ??
          (printerName ? byName.get(printerName) : undefined);
        const label = text(slotRecord.printer) ?? text(slotRecord.serial) ?? '';
        if (!found) {
          report.unknown.push(label);
          continue;
        }
        if (used.has(found.id)) {
          report.repeated.push(found.name);
          continue;
        }
        if (!fits(shelf, i, found, lookup)) {
          report.misfit.push(found.name);
          continue;
        }
        place(layout, shelf, i, found, lookup);
        used.add(found.id);
        report.placed += 1;
      }
    }
    wanted.push({ unit, at });
    report.units += 1;
  }

  // Units go where the file says when that cell is free, the rest to the first free spot.
  for (const { unit, at } of wanted) {
    if (at && !overlaps(layout, unit, at[0], at[1])) {
      unit.x = at[0];
      unit.y = at[1];
    } else {
      const spot = firstFree(layout, unit);
      if (!spot) return refuse('room', { where: unit.name });
      unit.x = spot.x;
      unit.y = spot.y;
      if (at) report.moved.push(unit.name);
    }
    layout.units.push(unit);
  }

  return { ok: true, layout, report };
};
