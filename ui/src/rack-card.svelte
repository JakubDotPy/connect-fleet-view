<!--
  One rack on a dashboard: its front view, read only, where a press picks the
  whole rack, a shelf or a printer and the pill sends them commands. The rack is
  found by its id, and by its name when the layout was rebuilt since.
-->
<script lang="ts">
  import { EmptyState } from '@prusa/connect-ui/primitives';
  import type { CardProps } from '@prusa/connect-ui/slots';

  import BatchDialog from './batch-dialog.svelte';
  import { heldHost } from './host';
  import { pageStateFor } from './page-state.svelte';
  import UnitView from './unit-view.svelte';

  let { config, title, editing }: CardProps = $props();

  const host = heldHost();
  const t = host.t;
  const ui = pageStateFor(host);

  $effect(() => ui.follow(() => undefined));

  const unit = $derived(
    ui.layout.units.find((u) => u.id === config.rack) ??
      ui.layout.units.find((u) => u.name === config.name),
  );

  let height = $state(0);
</script>

<div
  class={['h-full min-h-0', editing && 'pointer-events-none']}
  bind:clientHeight={height}
>
  {#if unit}
    <UnitView
      {ui}
      {unit}
      {height}
      card
      heading={title === '' ? undefined : title}
    />
  {:else if ui.ready}
    <EmptyState
      size="sm"
      heading={t('fleet-view.card.missing')}
      description={t('fleet-view.card.missingBody')}
    />
  {/if}
</div>

<BatchDialog {ui} />
