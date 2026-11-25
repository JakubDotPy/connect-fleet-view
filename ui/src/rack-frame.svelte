<!--
  The shelves of one unit, top shelf first, in one outlined cabinet. Each
  shelf has a rail on its left for its name and, under its slots, whatever the
  caller sets there (the slots' labels). Neutral throughout, so the only colour
  is the printers' state.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { Shelf } from './fleet';

  let {
    shelves,
    small = false,
    selected = false,
    shelf,
    side,
    board,
  }: {
    /** Bottom shelf first, as stored. */
    shelves: readonly Shelf[];
    small?: boolean;
    /** Draws the frame's edge in the selection colour. */
    selected?: boolean;
    shelf: Snippet<[Shelf, number]>;
    /** Set on the left of the shelf, such as its name. */
    side?: Snippet<[Shelf, number]>;
    /** Set under the slots, such as their labels. */
    board?: Snippet<[Shelf, number]>;
  } = $props();

  const top = $derived(shelves.map((s, index) => ({ s, index })).reverse());
</script>

<div
  class={[
    'flex h-full min-h-0 flex-col',
    !small && 'w-max max-w-full overflow-hidden rounded-md border-2',
    !small && (selected ? 'border-primary' : 'border-border'),
    small && 'gap-0.5',
  ]}
>
  {#each top as { s, index } (index)}
    {#if small}
      <div class="flex min-h-0 flex-1 border-b border-border pb-0.5">
        {@render shelf(s, index)}
      </div>
    {:else}
      <div class="flex min-h-0 flex-1 border-t border-border first:border-t-0">
        <div
          class="relative flex w-11 shrink-0 flex-col border-e border-border bg-background/60"
        >
          {#if side}
            {@render side(s, index)}
          {/if}
        </div>
        <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 px-3 pt-3">
          <div class="flex min-h-0 flex-1">
            {@render shelf(s, index)}
          </div>
          {#if board}
            {@render board(s, index)}
          {/if}
        </div>
      </div>
    {/if}
  {/each}
</div>
