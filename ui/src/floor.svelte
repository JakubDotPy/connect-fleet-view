<!--
  The room from above: every rack where it stands, each drawn as a
  small front view so a lit slot shows where the printer that needs a person is.
  The grid is sized to the units placed, so a few of them fill the view; while
  editing it shows the whole floor, a rack is dragged by its header to another
  cell, and its slots take printers and placeholders as they do in the rack.
-->
<script lang="ts">
  import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
  import MonitorIcon from '@lucide/svelte/icons/monitor';
  import WrenchIcon from '@lucide/svelte/icons/wrench';
  import { Button, PrinterIcon, Tile } from '@prusa/connect-ui/primitives';

  import {
    artworkOf,
    cellsOf,
    FLOOR_COLUMNS,
    FLOOR_ROWS,
    footprintOf,
    groupOf,
    type Shelf,
    type SlotCell,
    type Unit,
  } from './fleet';
  import { isItemDrag, slotTarget, source } from './grab';
  import { heldHost } from './host';
  import type { Held, PageState } from './page-state.svelte';
  import RackFrame from './rack-frame.svelte';
  import SelectionPill from './selection-pill.svelte';
  import Stats from './stats.svelte';
  import { GROUP_SLOT } from './tones';
  import UnitGlyph from './unit-glyph.svelte';

  let { ui, height }: { ui: PageState; height: number } = $props();

  const t = heldHost().t;
  const GAP = 12;
  const SLOT_GAP = 4;

  let box = $state<HTMLElement>();
  let grid = $state<HTMLElement>();
  let width = $state(0);

  $effect(() => {
    if (!box) return;
    const el = box;
    const watch = new ResizeObserver(() => {
      width = el.clientWidth;
    });
    watch.observe(el);

    return () => {
      watch.disconnect();
    };
  });

  // The part of the grid worth drawing: the units and a cell around them, or
  // the whole floor while editing so there is room to put a new one.
  const extent = $derived.by(() => {
    const boxes = ui.layout.units.map((u) => ({
      ...footprintOf(u),
      x: u.x,
      y: u.y,
    }));
    const right = Math.max(0, ...boxes.map((b) => b.x + b.w));
    const bottom = Math.max(0, ...boxes.map((b) => b.y + b.h));
    if (ui.editing || boxes.length === 0)
      return {
        x: 0,
        y: 0,
        cols: Math.min(FLOOR_COLUMNS, Math.max(16, right + 6)),
        rows: Math.min(FLOOR_ROWS, Math.max(9, bottom + 4)),
      };
    const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - 1);
    const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - 1);

    return { x, y, cols: right + 1 - x, rows: bottom + 1 - y };
  });

  // Below this a card has no room for its frame, so the floor scrolls instead.
  const MIN_CELL = 52;
  const cell = $derived(
    Math.max(
      MIN_CELL,
      Math.min((width - GAP) / extent.cols, (height - GAP) / extent.rows, 140),
    ),
  );

  // One slot is one cell, in every unit alike; the footprint's extra cell holds the frame.
  const slot = $derived(Math.floor(cell - SLOT_GAP));
  const pictured = $derived(slot >= 32);

  // A card's header, its padding and the space under the header.
  const CARD_CHROME = 60;
  // Above each shelf's slots and the rule under them.
  const SHELF_CHROME = 8;

  /** How tall a unit's slots can be and still keep the card inside its footprint. */
  const rowHeight = (unit: Unit): number => {
    const room = footprintOf(unit).h * cell - GAP - CARD_CHROME;

    // Slots take the whole height, so a card ends on its footprint's grid line.
    return Math.max(12, Math.floor(room / unit.shelves.length - SHELF_CHROME));
  };

  const DOTS =
    'radial-gradient(circle, var(--border) 1.5px, transparent 1.7px)';
  const LINES =
    'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)';

  const slotClass = (c: SlotCell): string => {
    if (c.device) return GROUP_SLOT[groupOf(c.device)];
    if (c.missing) return 'border-dashed border-destructive';
    if (c.slot.placeholder)
      return 'border-border bg-border text-muted-foreground';

    return 'border-dashed border-border';
  };

  const anchor = $derived(
    ui.selection && !ui.editing
      ? `[data-unit="${ui.selection.unit}"]`
      : undefined,
  );

  const refuse = (): void => {
    ui.say(t('fleet-view.edit.noFit'));
  };

  const itemOf = (shelf: Shelf, c: SlotCell): Held | undefined => {
    if (c.device) return { printer: c.device.id };
    if (c.slot.placeholder)
      return {
        placeholder: c.slot.placeholder,
        from: { shelf, index: c.index },
      };

    return undefined;
  };

  const putInto = (unit: Unit): void => {
    if (!ui.putInto(unit)) refuse();
  };

  // Where in the dragged card the pointer took hold, so it lands where it is let go.
  let grip = { id: '', dx: 0, dy: 0 };

  const dragStart = (event: DragEvent, id: string): void => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement) || !event.dataTransfer) return;
    const card = target.closest('[data-unit]') ?? target;
    const r = card.getBoundingClientRect();
    grip = { id, dx: event.clientX - r.left, dy: event.clientY - r.top };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.setDragImage(card, grip.dx, grip.dy);
  };

  const drop = (event: DragEvent): void => {
    event.preventDefault();
    if (!grid || !grip.id) return;
    const r = grid.getBoundingClientRect();
    const x = Math.round((event.clientX - r.left - grip.dx) / cell) + extent.x;
    const y = Math.round((event.clientY - r.top - grip.dy) / cell) + extent.y;
    if (!ui.moveUnit(grip.id, x, y)) ui.say(t('fleet-view.edit.noRoom'));
    grip = { id: '', dx: 0, dy: 0 };
  };
</script>

{#snippet mark(c: SlotCell)}
  {#if c.slot.placeholder === 'computer'}
    <MonitorIcon
      class="pointer-events-none size-1/2 self-center"
      aria-hidden="true"
    />
  {:else if c.slot.placeholder === 'service'}
    <WrenchIcon
      class="pointer-events-none size-1/2 self-center"
      aria-hidden="true"
    />
  {/if}
{/snippet}

{#snippet miniature(unit: Unit, row: number, editing: boolean)}
  <RackFrame shelves={unit.shelves} small>
    {#snippet shelf(s: Shelf)}
      <span
        class="flex w-full items-end justify-center"
        style:gap="{SLOT_GAP}px"
      >
        {#each cellsOf(s, ui.device) as c (c.index)}
          {@const title =
            c.device?.name ??
            (c.slot.placeholder
              ? t(`fleet-view.placeholder.${c.slot.placeholder}`)
              : c.slot.name)}
          {@const icon = c.device && pictured && row >= 28}
          {#if editing}
            {@const item = itemOf(s, c)}
            {@const target = slotTarget(ui, s, c.index, item, refuse)}
            {@const fit = ui.held !== undefined && ui.fitsAt(s, c.index)}
            <span
              role="button"
              tabindex="0"
              aria-label={title}
              {title}
              class={[
                'flex shrink-0 cursor-pointer items-end justify-center rounded-sm border p-0.5',
                slotClass(c),
                fit && 'ring-2 ring-primary',
                ui.held !== undefined && !fit && 'opacity-40',
                item && 'cursor-grab',
              ]}
              style:width="{c.wide ? slot * 2 + SLOT_GAP : slot}px"
              style:height="{row}px"
              {...item ? source(ui, item) : {}}
              {...target}
            >
              {#if icon && c.device}
                <PrinterIcon
                  model={artworkOf(c.device)}
                  reported={c.device.model}
                  class="pointer-events-none max-h-full max-w-full object-contain"
                />
              {/if}
              {@render mark(c)}
            </span>
          {:else}
            <span
              class={[
                'flex shrink-0 items-end justify-center rounded-sm border p-0.5',
                slotClass(c),
              ]}
              style:width="{c.wide ? slot * 2 + SLOT_GAP : slot}px"
              style:height="{row}px"
              {title}
            >
              {#if icon && c.device}
                <PrinterIcon
                  model={artworkOf(c.device)}
                  reported={c.device.model}
                  class="max-h-full max-w-full object-contain"
                />
              {/if}
              {@render mark(c)}
            </span>
          {/if}
        {/each}
      </span>
    {/snippet}
  </RackFrame>
{/snippet}

<div
  bind:this={box}
  class="relative overflow-auto rounded-md bg-muted"
  style:height="{height}px"
>
  <div
    bind:this={grid}
    role="application"
    aria-label={t('fleet-view.floor.label')}
    class="relative mx-auto"
    style:width="{extent.cols * cell}px"
    style:height="{extent.rows * cell}px"
    style:background-image={ui.editing ? LINES : DOTS}
    style:background-size="{cell}px {cell}px"
    style:background-position={ui.editing
      ? '0 0'
      : `-${String(cell / 2)}px -${String(cell / 2)}px`}
    ondragover={(e) => {
      if (ui.editing && grip.id) e.preventDefault();
    }}
    ondrop={drop}
  >
    {#each ui.layout.units as unit (unit.id)}
      {@const size = footprintOf(unit)}
      {@const selected = ui.selection?.unit === unit.id}
      {@const row = rowHeight(unit)}
      <div
        class="absolute"
        role="group"
        data-unit={unit.id}
        style:left="{(unit.x - extent.x) * cell + GAP / 2}px"
        style:top="{(unit.y - extent.y) * cell + GAP / 2}px"
        style:width="{size.w * cell - GAP}px"
        style:height="{size.h * cell - GAP}px"
      >
        {#if ui.editing}
          <div
            class={[
              'flex h-full flex-col gap-2 rounded-md border bg-card p-2 shadow-md',
              selected ? 'border-primary' : 'border-border',
            ]}
          >
            <div
              role="group"
              class="flex min-w-0 cursor-grab items-center gap-1"
              title={t('fleet-view.edit.moveRack')}
              draggable="true"
              ondragstart={(e) => {
                dragStart(e, unit.id);
              }}
              ondragend={() => {
                grip = { id: '', dx: 0, dy: 0 };
              }}
              ondragover={(e) => {
                if (isItemDrag(e)) e.preventDefault();
              }}
              ondrop={(e) => {
                if (!isItemDrag(e)) return;
                e.preventDefault();
                e.stopPropagation();
                putInto(unit);
              }}
            >
              <GripVerticalIcon
                class="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <Button
                variant="ghost"
                size="sm"
                class="min-w-0 px-1 font-bold"
                onclick={() => {
                  if (ui.held) putInto(unit);
                  else ui.selection = selected ? undefined : { unit: unit.id };
                }}
                ondblclick={() => {
                  ui.open({ kind: 'unit', id: unit.id });
                }}
              >
                <span class="truncate">{unit.name}</span>
              </Button>
              <span class="ms-auto">
                <Stats devices={ui.unitDevices(unit)} />
              </span>
            </div>
            <div class="min-h-0 flex-1">
              {@render miniature(unit, row, true)}
            </div>
          </div>
        {:else}
          <Tile
            size="sm"
            {selected}
            class="h-full bg-card shadow-md"
            label={t('fleet-view.floor.select', { name: unit.name })}
            onclick={() => {
              ui.selection = selected ? undefined : { unit: unit.id };
            }}
            ondblclick={() => {
              ui.open({ kind: 'unit', id: unit.id });
            }}
          >
            <span class="flex h-full flex-col gap-2">
              <span class="flex min-w-0 items-center gap-2">
                <UnitGlyph />
                <span class="truncate text-sm font-bold">{unit.name}</span>
                <span class="ms-auto">
                  <Stats devices={ui.unitDevices(unit)} />
                </span>
              </span>
              <span class="min-h-0 flex-1">
                {@render miniature(unit, row, false)}
              </span>
            </span>
          </Tile>
        {/if}
      </div>
    {/each}
  </div>
  <SelectionPill {ui} container={box} {anchor} canOpen />
</div>
