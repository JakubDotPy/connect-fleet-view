<!--
  The rack a unit's shelves stand in, drawn as a flat elevation: two uprights,
  a board under every shelf and feet.
  Neutral throughout, so the only colour is the printers' state. A shelf's name
  sits on the left upright beside it; what the caller sets on a board's front
  edge (the slots' names) sits under the slots.
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
    /** Set on the left upright beside the shelf, such as its name. */
    side?: Snippet<[Shelf, number]>;
    /** Set on the board's front edge, under the slots. */
    board?: Snippet<[Shelf, number]>;
  } = $props();

  const post = $derived(small ? 'w-1 rounded-full' : 'w-5 rounded-sm');
  const top = $derived(shelves.map((s, index) => ({ s, index })).reverse());
</script>

<div
  class={[
    'flex h-full min-h-0 flex-col',
    !small && 'rounded-md border-2 p-1',
    !small && (selected ? 'border-primary' : 'border-transparent'),
  ]}
>
  <div class={['flex min-h-0 flex-1', small ? 'gap-0.5' : 'gap-1']}>
    <div class={['flex shrink-0 flex-col bg-border', post]}>
      {#each top as { s, index } (index)}
        <div class="relative flex min-h-0 flex-1 items-center justify-center">
          {#if side && !small}
            {@render side(s, index)}
          {/if}
        </div>
      {/each}
    </div>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      {#each top as { s, index } (index)}
        <div class="flex min-h-0 flex-1 flex-col">
          <div class={['flex min-h-0 flex-1', small ? 'pt-0.5' : 'px-2 pt-2']}>
            {@render shelf(s, index)}
          </div>
          {#if small}
            <div class="h-1 rounded-full bg-border"></div>
          {:else}
            <div
              class="flex h-6 items-center rounded-sm border-t-2 border-muted-foreground bg-border px-2"
            >
              {#if board}
                {@render board(s, index)}
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
    <div class={['shrink-0 bg-border', post]}></div>
  </div>
  <div class={['flex justify-between', small ? 'h-0.5' : 'h-2']}>
    {#each [0, 1] as leg (leg)}
      <div class={['rounded-b-sm bg-border', post]}></div>
    {/each}
  </div>
</div>
