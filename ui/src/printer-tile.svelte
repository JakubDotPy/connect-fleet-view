<!-- One printer on a shelf: its picture, what it is doing, and the print's bar across the foot. -->
<script lang="ts">
  import {
    activeMaterialOf,
    type Device,
    PRINTER_STATE_LABEL_KEY,
    PRINTER_STATE_TONE,
  } from '@prusa/connect-ui/domain';
  import { deviceThumbnailUrlOf } from '@prusa/connect-ui/data';
  import {
    Badge,
    PrinterIcon,
    Progress,
    Tile,
  } from '@prusa/connect-ui/primitives';

  import { artworkOf, groupOf, stateOf } from './fleet';
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

  const printerState = $derived(stateOf(device));
  const tone = $derived(PRINTER_STATE_TONE[printerState]);
  const attention = $derived(groupOf(device) === 'attention');
  // Static strings so Tailwind finds both.
  const ALERT = {
    fault: 'border-state-fault-edge text-state-fault-edge',
    other: 'border-state-attention-edge text-state-attention-edge',
  };
  const alert = $derived(tone === 'fault' ? ALERT.fault : ALERT.other);
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
  const thumbnail = $derived(
    job?.running === true && job.path
      ? deviceThumbnailUrlOf(heldHost().client, device.id, job.path)
      : undefined,
  );
  // The failed URL, not a flag, so the next job's picture is tried again.
  let brokenUrl = $state<string>();
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
  title={`${device.name}: ${t(PRINTER_STATE_LABEL_KEY[printerState])}`}
  class={[
    'h-full overflow-hidden bg-card ps-3.5',
    attention && !selected && ['border-2', alert],
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
        {#if job?.running === true}
          <PrinterIcon
            model={artworkOf(device)}
            reported={device.model}
            class="size-6 shrink-0"
          />
        {/if}
      </span>
      <span class="flex min-w-0 items-end gap-3">
        <span class="size-16 shrink-0">
          {#if thumbnail && thumbnail !== brokenUrl}
            <img
              src={thumbnail}
              alt=""
              loading="lazy"
              class="rounded size-16 bg-muted object-contain"
              onerror={() => (brokenUrl = thumbnail)}
            />
          {:else}
            <PrinterIcon
              model={artworkOf(device)}
              reported={device.model}
              class={['size-16', tone === 'quiet' && 'opacity-50']}
            />
          {/if}
        </span>
        <span class="flex min-w-0 flex-col items-start gap-0.5 pb-0.5 text-xs">
          {#if printerState !== 'PRINTING'}
            <Badge
              size="sm"
              variant={BADGE[tone]}
              class="max-w-full font-mono tracking-wider uppercase"
            >
              {t(PRINTER_STATE_LABEL_KEY[printerState])}
            </Badge>
          {/if}
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
      {#if progress !== undefined}
        <Progress value={progress} max={100} class="h-1.5 w-full" />
      {/if}
    </span>
  {/if}
</Tile>
