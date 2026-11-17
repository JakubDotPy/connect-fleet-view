<!--
  One rack from the front: its shelves top to bottom, a tile per
  slot, each shelf's name on its board. A press on a printer takes its shelf
  first and the printer second. While editing, printers are dragged between
  slots and from the unplaced list, and every slot's name can be changed.
-->
<script lang="ts">
  import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
  import MonitorIcon from '@lucide/svelte/icons/monitor';
  import WrenchIcon from '@lucide/svelte/icons/wrench';
  import XIcon from '@lucide/svelte/icons/x';
  import { Button, Input, Tile } from '@prusa/connect-ui/primitives';

  import { cellsOf, type Shelf, type SlotCell, type Unit } from './fleet';
  import { heldHost } from './host';
  import { type Held, type PageState } from './page-state.svelte';
  import { slotTarget, source } from './grab';
  import PrinterTile from './printer-tile.svelte';
  import RackFrame from './rack-frame.svelte';
  import SelectionPill from './selection-pill.svelte';
  import Stats from './stats.svelte';
  import UnitGlyph from './unit-glyph.svelte';

  let {
    ui,
    unit,
    height,
    card = false,
    heading,
  }: {
    ui: PageState;
    unit: Unit;
    height: number;
    /** On a dashboard: small tiles, no way to the floor, and the card's own heading. */
    card?: boolean;
    heading?: string | undefined;
  } = $props();

  const t = heldHost().t;

  let box = $state<HTMLElement>();

  // A long shelf trades a tile's detail for width, so twenty slots stay usable.
  const longest = $derived(
    Math.max(...unit.shelves.map((x) => x.slots.length)),
  );
  const compact = $derived(card || longest > 12);
  const slotRem = $derived.by(() => {
    if (card || longest > 12) return 7.5;

    return longest > 6 ? 10 : 13;
  });
  const columns = (shelf: Shelf): string =>
    `repeat(${String(shelf.slots.length)}, ${String(slotRem)}rem)`;

  const slotLabel = (shelf: Shelf, c: SlotCell): string =>
    c.wide
      ? t('fleet-view.slot.pair', {
          first: c.slot.name,
          second: shelf.slots[c.index + 1]?.name ?? '',
        })
      : c.slot.name;

  const s = $derived(
    ui.selection?.unit === unit.id && !ui.editing ? ui.selection : undefined,
  );
  const wholeUnit = $derived(
    s !== undefined && s.shelf === undefined && s.printer === undefined,
  );

  const anchor = $derived.by(() => {
    if (!s) return undefined;
    if (s.printer !== undefined) return `[data-printer="${s.printer}"]`;
    if (s.shelf !== undefined) return `[data-shelf="${String(s.shelf)}"]`;

    return '[data-frame]';
  });

  // The shelf whose name is being typed, on the rack's upright.
  let renaming = $state<number>();
  $effect(() => {
    if (renaming === undefined || !box) return;
    const field = box.querySelector('[data-shelf-name]');
    if (field instanceof HTMLInputElement) {
      field.focus();
      field.select();
    }
  });
  $effect(() => {
    if (!ui.editing) renaming = undefined;
  });

  const refuse = (): void => {
    ui.say(t('fleet-view.edit.noFit'));
  };

  const itemOf = (sh: Shelf, c: SlotCell): Held | undefined => {
    if (c.device) return { printer: c.device.id };
    if (c.slot.placeholder)
      return {
        placeholder: c.slot.placeholder,
        from: { shelf: sh, index: c.index },
      };

    return undefined;
  };

  const nameOf = (c: SlotCell): string => {
    if (c.device) return c.device.name;

    return c.slot.placeholder
      ? t(`fleet-view.placeholder.${c.slot.placeholder}`)
      : c.slot.name;
  };

  const heldName = $derived.by(() => {
    const h = ui.held;
    if (h?.placeholder) return t(`fleet-view.placeholder.${h.placeholder}`);

    return h?.printer === undefined ? undefined : ui.device(h.printer)?.name;
  });
</script>

<div
  bind:this={box}
  class="relative flex flex-col gap-4 overflow-auto rounded-md bg-muted p-4"
  style:height="{height}px"
>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <span class="flex items-center gap-2">
      <UnitGlyph />
      {#if ui.editing}
        <Input
          class="h-8 text-lg font-bold"
          style="width: 12rem"
          aria-label={t('fleet-view.edit.name')}
          value={unit.name}
          oninput={(e: Event) => {
            const field = e.currentTarget;
            if (field instanceof HTMLInputElement) unit.name = field.value;
          }}
        />
      {:else}
        <h2 class="text-lg font-bold">{heading ?? unit.name}</h2>
      {/if}
    </span>
    <Stats devices={ui.unitDevices(unit)} labels />
    <span class="ms-auto flex items-center gap-2">
      {#if !card && (ui.layout.units.length > 1 || ui.editing)}
        <Button
          variant="secondary"
          size="sm"
          onclick={() => {
            ui.open({ kind: 'floor' });
          }}
        >
          <ArrowLeftIcon class="size-4" aria-hidden="true" />
          {t('fleet-view.unit.back')}
        </Button>
      {/if}
      {#if !ui.editing}
        <Button
          variant={wholeUnit ? 'default' : 'secondary'}
          size="sm"
          onclick={() => {
            ui.selection = wholeUnit ? undefined : { unit: unit.id };
          }}
        >
          {t('fleet-view.unit.selectRack')}
        </Button>
      {/if}
    </span>
  </div>

  <div data-frame class="self-start">
    <RackFrame shelves={unit.shelves} selected={wholeUnit}>
      {#snippet shelf(sh: Shelf, index: number)}
        {@const shelfSelected = s?.shelf === index && s.printer === undefined}
        <div
          data-shelf={index}
          class={[
            'grid gap-2 rounded-md pb-2',
            shelfSelected &&
              'ring-2 ring-primary ring-offset-2 ring-offset-muted',
          ]}
          style:grid-template-columns={columns(sh)}
        >
          {#each cellsOf(sh, ui.device) as c (c.index)}
            {@const item = itemOf(sh, c)}
            {@const target = slotTarget(ui, sh, c.index, item, refuse)}
            {@const fit =
              ui.editing && ui.held !== undefined && ui.fitsAt(sh, c.index)}
            {@const dim = ui.editing && ui.held !== undefined && !fit}
            <div
              role="listitem"
              class={[
                'relative flex min-w-0 flex-col rounded-sm',
                fit && 'ring-2 ring-primary',
                dim && 'opacity-40',
                ui.editing && item && 'cursor-grab',
              ]}
              style:grid-column={c.wide ? 'span 2' : undefined}
              data-printer={c.device?.id}
              {...ui.editing && item ? source(ui, item) : {}}
              ondragover={ui.editing ? target.ondragover : undefined}
              ondrop={ui.editing ? target.ondrop : undefined}
            >
              {#if c.device}
                {@const id = c.device.id}
                <PrinterTile
                  device={c.device}
                  {compact}
                  selected={s?.printer === id || ui.held?.printer === id}
                  onclick={() => {
                    if (ui.editing) target.onclick();
                    else ui.pressPrinter(unit.id, index, id);
                  }}
                />
              {:else if c.slot.placeholder}
                {@const kind = c.slot.placeholder}
                <Tile
                  size="sm"
                  selected={ui.held?.from?.shelf === sh &&
                    ui.held.from.index === c.index}
                  disabled={!ui.editing}
                  label={t(`fleet-view.placeholder.${kind}`)}
                  class="h-full min-h-28 bg-card"
                  onclick={target.onclick}
                >
                  <span
                    class="flex flex-col items-center gap-2 text-sm text-muted-foreground"
                  >
                    {#if kind === 'computer'}
                      <MonitorIcon class="size-8" aria-hidden="true" />
                    {:else}
                      <WrenchIcon class="size-8" aria-hidden="true" />
                    {/if}
                    {t(`fleet-view.placeholder.${kind}`)}
                  </span>
                </Tile>
              {:else if ui.editing}
                <Tile
                  size="sm"
                  label={heldName
                    ? t('fleet-view.edit.placeHere', { name: heldName })
                    : t('fleet-view.edit.dropHere')}
                  class="h-full min-h-28 border-dashed text-xs text-muted-foreground"
                  onclick={target.onclick}
                >
                  <span class="text-center">
                    {heldName
                      ? t('fleet-view.edit.placeHere', { name: heldName })
                      : t('fleet-view.edit.dropHere')}
                  </span>
                </Tile>
              {:else}
                <div
                  class={[
                    'flex h-full min-h-28 items-center justify-center rounded-sm border border-dashed text-xs text-muted-foreground',
                    c.missing && 'border-destructive',
                  ]}
                >
                  {c.missing
                    ? t('fleet-view.slot.missing')
                    : t('fleet-view.slot.empty')}
                </div>
              {/if}
              {#if ui.editing && item}
                <Button
                  variant="secondary"
                  size="icon-sm"
                  class="absolute end-1 bottom-1 rounded-full"
                  label={t('fleet-view.edit.unplace', { name: nameOf(c) })}
                  onclick={() => {
                    ui.held = item;
                    ui.release();
                  }}
                >
                  <XIcon class="size-3.5" aria-hidden="true" />
                </Button>
              {/if}
            </div>
          {/each}
        </div>
      {/snippet}
      {#snippet side(sh: Shelf, index: number)}
        {@const shelfSelected = s?.shelf === index && s.printer === undefined}
        {#if renaming === index}
          <Input
            data-shelf-name
            class="absolute start-0 z-10 h-7 px-2 text-xs shadow-md"
            style="width: 9rem; background-color: var(--card)"
            aria-label={t('fleet-view.edit.shelfName')}
            value={sh.name}
            oninput={(e: Event) => {
              const field = e.currentTarget;
              if (field instanceof HTMLInputElement) sh.name = field.value;
            }}
            onblur={() => {
              renaming = undefined;
            }}
            onkeydown={(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === 'Escape') renaming = undefined;
            }}
          />
        {/if}
        <Button
          variant={shelfSelected ? 'default' : 'ghost'}
          size="sm"
          class="h-auto w-5 px-0 py-2 text-xs text-muted-foreground"
          title={ui.editing ? t('fleet-view.edit.shelfName') : undefined}
          onclick={() => {
            if (ui.editing) renaming = index;
            else
              ui.selection = shelfSelected
                ? undefined
                : { unit: unit.id, shelf: index };
          }}
        >
          <span class="rotate-180 truncate" style:writing-mode="vertical-rl">
            {sh.name}
          </span>
        </Button>
      {/snippet}
      {#snippet board(sh: Shelf)}
        <div
          class="grid w-full gap-2"
          style:grid-template-columns={columns(sh)}
        >
          {#each cellsOf(sh, ui.device) as c (c.index)}
            <span
              class="flex min-w-0 justify-center"
              style:grid-column={c.wide ? 'span 2' : undefined}
            >
              {#if ui.editing}
                <Input
                  class="h-5 w-24 px-1 text-center text-xs"
                  aria-label={t('fleet-view.edit.slotName')}
                  value={c.slot.name}
                  oninput={(e: Event) => {
                    const field = e.currentTarget;
                    if (field instanceof HTMLInputElement)
                      c.slot.name = field.value;
                  }}
                />
              {:else}
                <span class="truncate text-xs text-muted-foreground">
                  {slotLabel(sh, c)}
                </span>
              {/if}
            </span>
          {/each}
        </div>
      {/snippet}
    </RackFrame>
  </div>

  <SelectionPill {ui} container={box} {anchor} />
</div>
