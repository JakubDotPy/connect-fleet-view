<!-- One printer on a shelf: its picture with the print's bar under it, then what it is doing. -->
<script lang="ts">
  import {
    activeMaterialOf,
    type Device,
    PRINTER_STATE_LABEL_KEY,
    PRINTER_STATE_TONE,
  } from '@prusa/connect-ui/domain';
  import {
    Badge,
    PrinterIcon,
    Progress,
    Tile,
  } from '@prusa/connect-ui/primitives';

  import { artworkOf, stateOf } from './fleet';
  import { heldHost } from './host';
  import { BADGE, EDGE } from './tones';

  let {
    device,
    selected = false,
    compact = false,
    onclick,
  }: {
    device: Device;
    selected?: boolean;
    /** The picture, name and bar alone: the state shows in the edge and the tooltip. */
    compact?: boolean;
    onclick: () => void;
  } = $props();

  const t = heldHost().t;

  const SNAPSHOT_ONLY = { value: (): undefined => undefined };

  const state = $derived(stateOf(device));
  const tone = $derived(PRINTER_STATE_TONE[state]);
  const job = $derived(device.job);
  const progress = $derived(
    job?.running === true && typeof job.progress === 'number'
      ? Math.round(job.progress)
      : undefined,
  );
  const left = $derived.by(() => {
    const ms = job?.time_remaining_ms;
    if (job?.running !== true || typeof ms !== 'number' || ms <= 0)
      return undefined;
    const minutes = Math.round(ms / 60000);

    return minutes >= 60
      ? t('fleet-view.tile.hours', {
          hours: Math.floor(minutes / 60),
          minutes: minutes % 60,
        })
      : t('fleet-view.tile.minutes', { minutes });
  });
  const line = $derived(
    device.issues?.[0]?.detail ??
      (job?.running === true ? job.display_name : undefined) ??
      activeMaterialOf(SNAPSHOT_ONLY, device) ??
      '',
  );
</script>

<Tile
  size="sm"
  {selected}
  {onclick}
  label={device.name}
  title={`${device.name}: ${t(PRINTER_STATE_LABEL_KEY[state])}`}
  class={[
    'h-full overflow-hidden bg-card ps-3.5',
    tone === 'quiet' && 'text-muted-foreground',
  ]}
>
  <span
    class={['absolute inset-y-0 start-0 w-1.5', EDGE[tone]]}
    aria-hidden="true"
  ></span>
  {#if compact}
    <span class="flex min-w-0 flex-col items-center gap-1">
      <PrinterIcon
        model={artworkOf(device)}
        reported={device.model}
        class={['size-12', tone === 'quiet' && 'opacity-50']}
      />
      <span class="w-full truncate text-center text-xs font-bold">
        {device.name}
      </span>
      {#if progress !== undefined}
        <Progress value={progress} max={100} class="h-1.5 w-full" />
      {/if}
    </span>
  {:else}
    <span class="flex min-w-0 flex-col gap-2">
      <span class="flex min-w-0 items-center justify-between gap-2">
        <span class="truncate text-sm font-bold">{device.name}</span>
        <Badge size="sm" variant={BADGE[tone]} class="shrink-0">
          {t(PRINTER_STATE_LABEL_KEY[state])}
        </Badge>
      </span>
      <span class="flex min-w-0 items-end gap-3">
        <span class="flex w-16 shrink-0 flex-col gap-1.5">
          <PrinterIcon
            model={artworkOf(device)}
            reported={device.model}
            class={['size-16', tone === 'quiet' && 'opacity-50']}
          />
          {#if progress !== undefined}
            <Progress value={progress} max={100} class="h-1.5" />
          {/if}
        </span>
        <span class="flex min-w-0 flex-col gap-0.5 pb-0.5 text-xs">
          {#if progress !== undefined}
            <span class="text-base font-bold tabular-nums">
              {t('fleet-view.tile.progress', { progress })}
            </span>
            {#if left}
              <span class="text-muted-foreground tabular-nums">{left}</span>
            {/if}
          {/if}
          {#if line}
            <span class="truncate text-muted-foreground" title={line}>
              {line}
            </span>
          {/if}
        </span>
      </span>
    </span>
  {/if}
</Tile>
