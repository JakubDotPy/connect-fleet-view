// Edit mode's one gesture, the same on the floor and in a rack: take a printer
// or a placeholder, by drag or by a press, and put it on a slot.
import type { Shelf } from './fleet';
import type { Held, PageState } from './page-state.svelte';

// A drag carries only this mark: what is held lives in the page state, because
// a drag's data cannot be read until the drop.
const TYPE = 'application/x-fleet-item';

export const isItemDrag = (event: DragEvent): boolean =>
  event.dataTransfer?.types.includes(TYPE) ?? false;

export const sameItem = (a: Held | undefined, b: Held | undefined): boolean =>
  a !== undefined &&
  b !== undefined &&
  (a.printer !== undefined
    ? a.printer === b.printer
    : a.from !== undefined &&
      a.from.shelf === b.from?.shelf &&
      a.from.index === b.from.index);

/** The handlers that make an element hand out an item by drag. */
export const source = (ui: PageState, item: Held) => ({
  draggable: true,
  ondragstart: (event: DragEvent): void => {
    event.stopPropagation();
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(TYPE, '1');
    ui.held = item;
  },
  ondragend: (): void => {
    ui.held = undefined;
  },
});

/** The handlers that make a slot take an item, by drop or by a press. */
export const slotTarget = (
  ui: PageState,
  shelf: Shelf,
  index: number,
  item: Held | undefined,
  refuse: () => void,
) => {
  const press = (): void => {
    if (ui.held === undefined) ui.held = item;
    else if (sameItem(ui.held, item)) ui.held = undefined;
    else if (!ui.put(shelf, index)) refuse();
  };

  return {
    ondragover: (event: DragEvent): void => {
      if (isItemDrag(event) && ui.fitsAt(shelf, index)) event.preventDefault();
    },
    ondrop: (event: DragEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (!ui.put(shelf, index)) refuse();
    },
    onclick: press,
    onkeydown: (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      press();
    },
  };
};
