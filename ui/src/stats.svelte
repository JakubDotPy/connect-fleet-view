<!-- The printers counted by the Overview's groups, a dot each. -->
<script lang="ts">
  import type { Device } from '@prusa/connect-ui/domain';

  import { countGroups, GROUPS } from './fleet';
  import { heldHost } from './host';
  import { GROUP_DOT as DOT } from './tones';

  let {
    devices,
    labels = false,
  }: { devices: readonly Device[]; labels?: boolean } = $props();

  const t = heldHost().t;

  const counts = $derived(countGroups(devices));
</script>

<span class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
  {#each GROUPS as group (group)}
    {#if labels || counts[group] > 0}
      <span
        class="inline-flex items-center gap-1.5"
        title={t('fleet-view.group.count', {
          group: t(`fleet-view.group.${group}`),
          count: counts[group],
        })}
      >
        <span class={['size-2 shrink-0 rounded-full', DOT[group]]}></span>
        <span class="font-medium">{counts[group]}</span>
        {#if labels}
          <span class="text-muted-foreground">
            {t(`fleet-view.group.${group}`)}
          </span>
        {/if}
      </span>
    {/if}
  {/each}
  {#if !labels && devices.length === 0}
    <span class="text-muted-foreground">{t('fleet-view.stats.empty')}</span>
  {/if}
</span>
