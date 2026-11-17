<!-- A rack's uprights and shelves, or the floor with racks on it. -->
<script lang="ts">
  let { floor = false }: { floor?: boolean } = $props();
</script>

<svg
  class="size-4 shrink-0 text-muted-foreground"
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  aria-hidden="true"
>
  {#if floor}
    <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" />
    <path d="M4 4.5h3v3H4zM9 4.5h3v7H9z" />
  {:else}
    <path d="M3 1.5v13M13 1.5v13M3 5.5h10M3 10h10M3 14.5h10" />
  {/if}
</svg>
