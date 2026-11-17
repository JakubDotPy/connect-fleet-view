<!-- The pill on the selection's top-right corner: how many printers, and what to do with them. -->
<script lang="ts">
  import XIcon from '@lucide/svelte/icons/x';
  import { Button } from '@prusa/connect-ui/primitives';

  import { heldHost } from './host';
  import type { PageState } from './page-state.svelte';

  let {
    ui,
    container,
    anchor,
    canOpen = false,
  }: {
    ui: PageState;
    /** The positioned element the pill is placed in. */
    container: HTMLElement | undefined;
    /** A selector, inside the container, for the selected element. */
    anchor: string | undefined;
    canOpen?: boolean;
  } = $props();

  const t = heldHost().t;

  let pill = $state<HTMLElement>();
  let place = $state<{ top: number; left: number }>();

  const count = $derived(ui.selected.length);

  $effect(() => {
    if (!container || !anchor || !pill) {
      place = undefined;

      return;
    }
    const box = container;
    const target = box.querySelector(anchor);
    const own = pill;
    const measure = (): void => {
      if (!target) {
        place = undefined;

        return;
      }
      const r = target.getBoundingClientRect();
      const c = box.getBoundingClientRect();
      place = {
        top: Math.max(4, r.top - c.top + box.scrollTop - own.offsetHeight / 2),
        left: Math.max(
          4,
          r.right - c.left + box.scrollLeft - own.offsetWidth + 8,
        ),
      };
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(box);
    if (target) watch.observe(target);

    return () => {
      watch.disconnect();
    };
  });
</script>

{#if anchor}
  <div
    bind:this={pill}
    class={[
      'absolute z-10 flex items-center gap-1 rounded-full border border-border bg-popover py-1 ps-3 pe-1 text-xs shadow-lg',
      !place && 'invisible',
    ]}
    style:top="{place?.top ?? 0}px"
    style:left="{place?.left ?? 0}px"
  >
    <span class="pe-1 font-medium tabular-nums">
      {t('fleet-view.pill.count', { count })}
    </span>
    {#if canOpen}
      <Button
        variant="ghost"
        size="sm"
        class="rounded-full"
        onclick={() => {
          const unit = ui.selection?.unit;
          if (unit) ui.open({ kind: 'unit', id: unit });
        }}
      >
        {t('fleet-view.pill.open')}
      </Button>
    {/if}
    <Button
      size="sm"
      class="rounded-full"
      disabled={count === 0}
      onclick={() => {
        ui.controlsOpen = true;
      }}
    >
      {t('fleet-view.pill.controls')}
    </Button>
    <Button
      variant="ghost"
      size="icon-sm"
      class="rounded-full"
      label={t('fleet-view.pill.clear')}
      onclick={() => {
        ui.selection = undefined;
      }}
    >
      <XIcon class="size-3.5" aria-hidden="true" />
    </Button>
  </div>
{/if}
