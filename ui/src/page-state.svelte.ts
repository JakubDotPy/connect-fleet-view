// What the page shows and edits: the saved layout, the draft while editing,
// which view is open and what is selected.
import type { Device, ReadonlyFleet } from '@prusa/connect-ui/domain';
import type { ModuleHost, ScopedStore } from '@prusa/connect-ui/slots';

import {
  emptyShelf,
  firstFree,
  fits,
  isLayout,
  type Layout,
  type Names,
  type Placeholder,
  newUnit,
  overlaps,
  place,
  placedIds,
  printerIdsOf,
  resizeShelf,
  seedLayout,
  type Selection,
  type Shelf,
  type Unit,
  unplace,
} from './fleet';
import { type LayoutApi, layoutApi, type Saved } from './layout-api';

// Where each person kept their own layout before it was shared. It is read
// once, as the starting point of a server that has no shared layout yet.
const STORE_KEY = 'layout';

/** What edit mode has picked up, by drag or by a press: a printer, or a placeholder and the slot it came from. */
export interface Held {
  printer?: string;
  placeholder?: Placeholder;
  from?: { shelf: Shelf; index: number };
}

// Someone else's save shows within this long, while nobody is editing here.
const REFRESH_MS = 15000;

export type View = { kind: 'floor' } | { kind: 'unit'; id: string };

export class PageState {
  saved = $state<Layout | undefined>(undefined);
  draft = $state<Layout | undefined>(undefined);
  view = $state<View>({ kind: 'floor' });
  selection = $state<Selection | undefined>(undefined);
  controlsOpen = $state(false);
  held = $state<Held | undefined>(undefined);
  notice = $state<string | undefined>(undefined);

  /** False until the shared layout has been read. */
  ready = $state(false);
  /** The version of the shared layout `saved` came from; 0 before its first save. */
  version = 0;
  /** Who saved the shared layout last, as the server says. */
  savedBy = $state<string | undefined>(undefined);

  readonly #fleet: ReadonlyFleet;
  readonly #store: ScopedStore;
  readonly #api: LayoutApi;
  readonly #names: Names;

  constructor(
    fleet: ReadonlyFleet,
    store: ScopedStore,
    api: LayoutApi,
    names: Names,
  ) {
    this.#fleet = fleet;
    this.#store = store;
    this.#api = api;
    this.#names = names;
  }

  #take(got: Saved): void {
    this.version = got.version;
    this.savedBy = got.saved_by;
    if (isLayout(got.layout)) this.saved = got.layout;
  }

  /** This person's own layout from before the shared one existed, if it still reads as one. */
  #kept(): Layout | undefined {
    try {
      const kept: unknown = JSON.parse(this.#store.get(STORE_KEY) ?? 'null');
      return isLayout(kept) ? kept : undefined;
    } catch {
      return undefined;
    }
  }

  /** Reads the shared layout; with none saved yet, this person's own earlier one is the start. */
  async load(): Promise<void> {
    const got = await this.#api.read();
    this.#take(got);
    if (got.version === 0) this.saved = this.#kept() ?? this.saved;
    this.ready = true;
  }

  /** Reads the shared layout now and keeps it fresh; the answer stops that. */
  follow(failed: () => void): () => void {
    this.load().catch(failed);
    const timer = setInterval(() => {
      this.refresh().catch(() => undefined);
    }, REFRESH_MS);

    return () => {
      clearInterval(timer);
    };
  }

  /** Picks up a save made elsewhere; an open edit is left as it is. A first load that failed is tried again. */
  async refresh(): Promise<void> {
    if (document.hidden || this.editing) return;
    if (!this.ready) {
      await this.load();
      return;
    }
    const before = this.version;
    const got = await this.#api.read();
    // An edit begun, or a save of our own landed, while the read was out.
    if (
      this.version === before &&
      got.version !== before &&
      this.draft === undefined
    )
      this.#take(got);
  }

  get names(): Names {
    return this.#names;
  }

  /** The first layout is drawn from the fleet once it has loaded. */
  seedWhenLoaded(): void {
    if (this.ready && this.saved === undefined && this.#fleet.loaded)
      this.saved = seedLayout(this.#fleet.devices, this.#names);
  }

  get editing(): boolean {
    return this.draft !== undefined;
  }

  get layout(): Layout {
    return this.draft ?? this.saved ?? { units: [] };
  }

  device = (id: string): Device | undefined => this.#fleet.device(id);

  /** The floor shows from two units up, and always while editing, so a second can be added. */
  get onFloor(): boolean {
    return (
      this.view.kind === 'floor' &&
      (this.layout.units.length > 1 || this.editing)
    );
  }

  /** The unit the stage shows, or undefined on the floor. */
  get openUnit(): Unit | undefined {
    if (this.onFloor) return undefined;
    const view = this.view;

    return view.kind === 'unit'
      ? this.layout.units.find((u) => u.id === view.id)
      : this.layout.units[0];
  }

  unit = (id: string): Unit | undefined =>
    this.layout.units.find((u) => u.id === id);

  devicesOf = (ids: readonly string[]): Device[] =>
    ids.flatMap((id) => {
      const found = this.device(id);

      return found ? [found] : [];
    });

  unitDevices = (unit: Unit, shelf?: number): Device[] =>
    this.devicesOf(printerIdsOf(unit, shelf));

  get placedDevices(): Device[] {
    return this.layout.units.flatMap((unit) => this.unitDevices(unit));
  }

  get unplaced(): Device[] {
    const placed = placedIds(this.layout);

    return this.#fleet.devices.filter(
      (d) => d.retired === undefined && !placed.has(d.id),
    );
  }

  get selected(): Device[] {
    const s = this.selection;
    if (!s) return [];
    if (s.printer !== undefined) return this.devicesOf([s.printer]);
    const unit = this.unit(s.unit);

    return unit ? this.unitDevices(unit, s.shelf) : [];
  }

  open(view: View): void {
    this.view = view;
    this.selection = undefined;
  }

  /** A press on a printer: its shelf first, then the printer, then back to the shelf. */
  pressPrinter(unit: string, shelf: number, printer: string): void {
    const s = this.selection;
    const onThisShelf = s?.unit === unit && s.shelf === shelf;
    this.selection =
      onThisShelf && s.printer !== printer
        ? { unit, shelf, printer }
        : { unit, shelf };
  }

  /** Only on the shared layout: a draft of nothing would be saved over it. */
  edit(): void {
    if (!this.ready) return;
    this.draft = structuredClone($state.snapshot(this.layout));
    this.selection = undefined;
  }

  cancel(): void {
    this.draft = undefined;
    this.held = undefined;
    this.selection = undefined;
  }

  /**
   * Saves the draft for everyone. 'changed' means someone saved first: their
   * layout is then what Cancel returns to, and saving again goes over it.
   */
  async save(): Promise<'saved' | 'changed'> {
    const draft = this.draft;
    if (!draft) return 'saved';
    const got = await this.#api.save(this.version, $state.snapshot(draft));
    if (!got) {
      this.#take(await this.#api.read());

      return 'changed';
    }
    this.version = got.version;
    this.savedBy = got.saved_by;
    this.saved = draft;
    this.draft = undefined;
    this.held = undefined;
    this.selection = undefined;

    return 'saved';
  }

  /** The unit the edit panel works on: the one open, or the one picked on the floor. */
  get inspected(): Unit | undefined {
    const sel = this.selection;

    return this.openUnit ?? (sel ? this.unit(sel.unit) : undefined);
  }

  /** Puts a new unit in the first free spot of the draft; false when the floor has no room left. */
  addUnit(): boolean {
    const layout = this.draft;
    if (!layout) return false;
    const unit = newUnit(layout, this.#names);
    const spot = firstFree(layout, unit);
    if (!spot) return false;
    layout.units.push({ ...unit, ...spot });
    this.selection = { unit: unit.id };

    return true;
  }

  /** Moves a unit to a cell, unless it would overlap another or leave the floor. */
  moveUnit(id: string, x: number, y: number): boolean {
    const unit = this.unit(id);
    if (!this.draft || !unit || overlaps(this.draft, unit, x, y)) return false;
    unit.x = x;
    unit.y = y;

    return true;
  }

  deleteUnit(id: string): void {
    if (!this.draft) return;
    this.draft.units = this.draft.units.filter((u) => u.id !== id);
    this.selection = undefined;
    if (this.view.kind === 'unit' && this.view.id === id)
      this.view = { kind: 'floor' };
  }

  /** False, with nothing changed, when a unit grown to its new size would run into another. */
  #roomFor(unit: Unit, grow: () => void): boolean {
    const before = $state.snapshot(unit.shelves);
    grow();
    if (this.draft && !overlaps(this.draft, unit, unit.x, unit.y)) return true;
    unit.shelves = before;

    return false;
  }

  /** Adds a shelf on top or takes the top one off; answers the printers that lost their place, or -1 when there is no room. */
  setShelves(unit: Unit, n: number): number {
    if (n < 1) return 0;
    if (n > unit.shelves.length) {
      const room = this.#roomFor(unit, () => {
        while (unit.shelves.length < n)
          unit.shelves.push(
            emptyShelf(this.#names.shelf(unit.shelves.length + 1), 3),
          );
      });

      return room ? 0 : -1;
    }
    let lost = 0;
    while (unit.shelves.length < n)
      unit.shelves.push(
        emptyShelf(this.#names.shelf(unit.shelves.length + 1), 3),
      );
    for (const shelf of unit.shelves.splice(n))
      lost += shelf.slots.filter((slot) => slot.printer !== null).length;

    return lost;
  }

  /** Answers the printers that lost their place, or -1 when there is no room. */
  setSlots(unit: Unit, shelf: number, n: number): number {
    const s = unit.shelves[shelf];
    if (!s) return 0;
    if (n > s.slots.length)
      return this.#roomFor(unit, () => resizeShelf(s, n, this.device)) ? 0 : -1;

    return resizeShelf(s, n, this.device);
  }

  /** Whether what is held could go on this slot; a printer swaps with one already there. */
  fitsAt(shelf: Shelf, index: number): boolean {
    const h = this.held;
    if (!h) return false;
    const there = shelf.slots[index]?.printer ?? null;
    if (h.printer !== undefined && there !== null && there !== h.printer)
      return true;
    // Judged as if the held thing had already left, so it can shift along its own shelf.
    const copy = $state.snapshot(shelf);
    for (const [i, slot] of copy.slots.entries()) {
      if (h.printer !== undefined && slot.printer === h.printer)
        slot.printer = null;
      if (h.from?.shelf === shelf && h.from.index === i)
        delete slot.placeholder;
    }

    return fits(
      copy,
      index,
      h.printer === undefined ? undefined : this.device(h.printer),
      this.device,
    );
  }

  /** Puts what is held on a slot; false, with nothing changed, when it does not go there. */
  put(shelf: Shelf, index: number): boolean {
    const h = this.held;
    if (!this.draft || !h || !this.fitsAt(shelf, index)) return false;
    if (h.printer !== undefined) {
      const printer = this.device(h.printer);
      if (!printer || !place(this.draft, shelf, index, printer, this.device))
        return false;
    } else {
      const slot = shelf.slots[index];
      if (!slot || !h.placeholder) return false;
      if (h.from) delete h.from.shelf.slots[h.from.index]?.placeholder;
      slot.placeholder = h.placeholder;
    }
    this.held = undefined;

    return true;
  }

  /** Puts what is held on the first free slot of a rack that takes it, top shelf first. */
  putInto(unit: Unit): boolean {
    for (const shelf of [...unit.shelves].reverse())
      for (const [i, slot] of shelf.slots.entries())
        if (
          slot.printer === null &&
          slot.placeholder === undefined &&
          this.fitsAt(shelf, i)
        )
          return this.put(shelf, i);

    return false;
  }

  /** Takes what is held off the layout. */
  release(): void {
    const h = this.held;
    if (this.draft && h?.printer !== undefined) unplace(this.draft, h.printer);
    if (h?.from) delete h.from.shelf.slots[h.from.index]?.placeholder;
    this.held = undefined;
  }

  /** Every printer this person can see, for matching a layout file against. */
  get devices(): readonly Device[] {
    return this.#fleet.devices;
  }

  /** Takes an imported layout as the draft; nothing is kept until it is saved. */
  takeDraft(layout: Layout): void {
    this.draft = layout;
    this.held = undefined;
    this.open({ kind: 'floor' });
  }

  /** Forgets the stored layout and draws a fresh one from the fleet. */
  reset(): void {
    this.draft = seedLayout(this.#fleet.devices, this.#names);
    this.open({ kind: 'floor' });
  }

  say(text: string): void {
    this.notice = text;
    setTimeout(() => {
      if (this.notice === text) this.notice = undefined;
    }, 3000);
  }
}

/** The state of one page or card, over the host's fleet and the shared layout. */
export const pageStateFor = (host: ModuleHost): PageState =>
  new PageState(host.fleet, host.store, layoutApi(host), {
    rack: (n) => host.t('fleet-view.name.rack', { n }),
    shelf: (n) => host.t('fleet-view.name.shelf', { n }),
  });
