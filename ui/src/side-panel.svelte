<!--
  The way between the floor and each rack, with what every one of them holds.
  While editing it holds the tools instead: what is still to place, taken from
  here onto any slot, the rack being shaped, and new racks.
-->
<script lang="ts">
  import MinusIcon from '@lucide/svelte/icons/minus';
  import MonitorIcon from '@lucide/svelte/icons/monitor';
  import WrenchIcon from '@lucide/svelte/icons/wrench';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import {
    Button,
    ConfirmDialog,
    Input,
    Label,
    PrinterIcon,
    Tile,
  } from '@prusa/connect-ui/primitives';

  import { artworkOf, PLACEHOLDERS, printerIdsOf, type Unit } from './fleet';
  import LayoutFile from './layout-file.svelte';
  import { heldHost } from './host';
  import { isItemDrag, source } from './grab';
  import type { PageState } from './page-state.svelte';
  import Stats from './stats.svelte';
  import UnitGlyph from './unit-glyph.svelte';

  let { ui, height }: { ui: PageState; height: number } = $props();

  let query = $state('');
  const toPlace = $derived.by(() => {
    const q = query.trim().toLowerCase();

    return q === ''
      ? ui.unplaced
      : ui.unplaced.filter((d) =>
          [d.name, d.model, d.serial].some((v) => v.toLowerCase().includes(q)),
        );
  });

  const t = heldHost().t;

  const current = $derived(ui.openUnit?.id);
  const unit = $derived(ui.editing ? ui.inspected : undefined);

  const lostSay = (lost: number): void => {
    if (lost < 0) ui.say(t('fleet-view.edit.noRoom'));
    if (lost > 0) ui.say(t('fleet-view.edit.lost', { count: lost }));
  };

  const textOf = (e: Event): string | undefined => {
    const field = e.currentTarget;

    return field instanceof HTMLInputElement ? field.value : undefined;
  };

  const rename = (u: Unit, e: Event): void => {
    const value = textOf(e);
    if (value !== undefined) u.name = value;
  };
</script>

<nav
  class="flex flex-col gap-1.5 overflow-y-auto rounded-md bg-muted p-2"
  style:max-height="{height}px"
  aria-label={t('fleet-view.panel.label')}
>
  {#if ui.layout.units.length > 1 || ui.editing}
    <Tile
      size="sm"
      pressed={ui.onFloor}
      label={t('fleet-view.panel.floor')}
      onclick={() => {
        ui.open({ kind: 'floor' });
      }}
    >
      <span class="flex min-w-0 items-center gap-2 text-sm">
        <UnitGlyph floor />
        <span class="flex-1 truncate font-medium">
          {t('fleet-view.panel.floor')}
        </span>
        <Stats devices={ui.placedDevices} />
      </span>
    </Tile>
    <div class="my-1 h-px bg-border"></div>
  {/if}

  {#each ui.layout.units as u (u.id)}
    <Tile
      size="sm"
      pressed={current === u.id}
      label={u.name}
      onclick={() => {
        ui.open({ kind: 'unit', id: u.id });
      }}
    >
      <span class="flex min-w-0 items-center gap-2 text-sm">
        <UnitGlyph />
        <span class="flex-1 truncate font-medium">{u.name}</span>
        <Stats devices={ui.unitDevices(u)} />
      </span>
    </Tile>
  {/each}

  <div class="my-1 h-px bg-border"></div>
  {#if ui.editing}
    {#if unit}
      {@const u = unit}
      <section class="flex flex-col gap-3 px-1">
        <h3 class="text-sm font-semibold">
          {t('fleet-view.edit.rack')}
        </h3>
        <div class="flex flex-col gap-1">
          <Label
            for="fleet-view-unit-name"
            class="text-xs text-muted-foreground"
          >
            {t('fleet-view.edit.name')}
          </Label>
          <Input
            id="fleet-view-unit-name"
            value={u.name}
            oninput={(e: Event) => {
              rename(u, e);
            }}
          />
        </div>

        <div class="flex items-center justify-between text-sm">
          <span>{t('fleet-view.edit.shelves')}</span>
          <span class="flex items-center gap-1">
            <Button
              variant="secondary"
              size="icon-sm"
              label={t('fleet-view.edit.shelfLess')}
              disabled={u.shelves.length <= 1}
              onclick={() => {
                lostSay(ui.setShelves(u, u.shelves.length - 1));
              }}
            >
              <MinusIcon class="size-3.5" aria-hidden="true" />
            </Button>
            <span class="w-6 text-center tabular-nums">
              {u.shelves.length}
            </span>
            <Button
              variant="secondary"
              size="icon-sm"
              label={t('fleet-view.edit.shelfMore')}
              onclick={() => {
                lostSay(ui.setShelves(u, u.shelves.length + 1));
              }}
            >
              <PlusIcon class="size-3.5" aria-hidden="true" />
            </Button>
          </span>
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-xs text-muted-foreground">
            {t('fleet-view.edit.shelfRows')}
          </span>
          {#each u.shelves
            .map((sh, i) => ({ sh, i }))
            .reverse() as { sh, i } (i)}
            <div class="flex items-center gap-1">
              <Input
                class="h-8 min-w-0 flex-1"
                aria-label={t('fleet-view.edit.shelfName')}
                value={sh.name}
                oninput={(e: Event) => {
                  const value = textOf(e);
                  if (value !== undefined) sh.name = value;
                }}
              />
              <Button
                variant="secondary"
                size="icon-sm"
                label={t('fleet-view.edit.slotLess')}
                disabled={sh.slots.length <= 1}
                onclick={() => {
                  lostSay(ui.setSlots(u, i, sh.slots.length - 1));
                }}
              >
                <MinusIcon class="size-3.5" aria-hidden="true" />
              </Button>
              <span class="w-6 text-center text-sm tabular-nums">
                {sh.slots.length}
              </span>
              <Button
                variant="secondary"
                size="icon-sm"
                label={t('fleet-view.edit.slotMore')}
                onclick={() => {
                  lostSay(ui.setSlots(u, i, sh.slots.length + 1));
                }}
              >
                <PlusIcon class="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          {/each}
        </div>

        <ConfirmDialog
          title={t('fleet-view.edit.deleteTitle', { name: u.name })}
          description={t('fleet-view.edit.deleteNote', {
            count: printerIdsOf(u).length,
          })}
          confirmLabel={t('fleet-view.edit.deleteRack')}
          onConfirm={() => {
            ui.deleteUnit(u.id);
          }}
        >
          {#snippet trigger({ props })}
            <Button
              {...props}
              variant="destructive"
              size="sm"
              class="self-start"
            >
              {t('fleet-view.edit.deleteRack')}
            </Button>
          {/snippet}
        </ConfirmDialog>
      </section>
    {/if}

    <div class="my-1 h-px bg-border"></div>
    <Button
      variant="secondary"
      size="sm"
      onclick={() => {
        if (!ui.addUnit()) ui.say(t('fleet-view.edit.noRoom'));
      }}
    >
      {t('fleet-view.edit.addRack')}
    </Button>
    <LayoutFile {ui} />
    <div class="my-1 h-px bg-border"></div>
    <section
      class="flex min-h-56 flex-1 flex-col gap-1.5"
      aria-label={t('fleet-view.edit.toPlace')}
      ondragover={(e) => {
        if (isItemDrag(e)) e.preventDefault();
      }}
      ondrop={(e) => {
        if (!isItemDrag(e)) return;
        e.preventDefault();
        ui.release();
      }}
    >
      <div
        class="flex items-center justify-between px-2 pt-1 text-sm font-semibold"
      >
        <span>{t('fleet-view.edit.toPlace')}</span>
        <span class="font-medium text-muted-foreground tabular-nums">
          {ui.unplaced.length}
        </span>
      </div>
      <p class="px-2 text-xs text-muted-foreground">
        {t('fleet-view.edit.placeHint')}
      </p>
      <ul class="grid grid-cols-2 gap-1.5">
        {#each PLACEHOLDERS as kind (kind)}
          {@const held = ui.held?.placeholder === kind && !ui.held.from}
          <li {...source(ui, { placeholder: kind })}>
            <Tile
              size="sm"
              pressed={held}
              class="cursor-grab"
              onclick={() => {
                ui.held = held ? undefined : { placeholder: kind };
              }}
            >
              <span class="flex items-center gap-2 text-sm">
                {#if kind === 'computer'}
                  <MonitorIcon class="size-4" aria-hidden="true" />
                {:else}
                  <WrenchIcon class="size-4" aria-hidden="true" />
                {/if}
                {t(`fleet-view.placeholder.${kind}`)}
              </span>
            </Tile>
          </li>
        {/each}
      </ul>
      <Input
        type="search"
        class="h-8 shrink-0"
        aria-label={t('fleet-view.edit.search')}
        placeholder={t('fleet-view.edit.search')}
        value={query}
        oninput={(e: Event) => {
          query = textOf(e) ?? '';
        }}
      />
      <ul class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {#each toPlace as device (device.id)}
          {@const held = ui.held?.printer === device.id}
          <li {...source(ui, { printer: device.id })}>
            <Tile
              size="sm"
              pressed={held}
              class="cursor-grab"
              onclick={() => {
                ui.held = held ? undefined : { printer: device.id };
              }}
            >
              <span class="flex min-w-0 items-center gap-2 text-sm">
                <PrinterIcon
                  model={artworkOf(device)}
                  reported={device.model}
                  class="size-7 shrink-0"
                />
                <span class="truncate">{device.name}</span>
              </span>
            </Tile>
          </li>
        {/each}
        {#if toPlace.length === 0 && ui.unplaced.length > 0}
          <li class="px-2 py-1 text-xs text-muted-foreground">
            {t('fleet-view.edit.noMatch')}
          </li>
        {/if}
      </ul>
    </section>
  {:else}
    <div
      class="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground"
    >
      <span>{t('fleet-view.panel.unplaced')}</span>
      <span class="font-medium tabular-nums">{ui.unplaced.length}</span>
    </div>
    <ul class="flex flex-col gap-1">
      {#each ui.unplaced as device (device.id)}
        <li class="flex min-w-0 items-center gap-2 px-2 py-1 text-sm">
          <PrinterIcon
            model={artworkOf(device)}
            reported={device.model}
            class="size-7 shrink-0"
          />
          <span class="truncate">{device.name}</span>
        </li>
      {/each}
    </ul>
  {/if}
</nav>
