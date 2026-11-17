<!--
  The rack card's one setting, picked from the racks of the shared layout: the
  core's settings form has no kind for a rack. The name is kept beside the id so
  the card still finds the rack after an import or a fresh start.
-->
<script lang="ts">
  import {
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@prusa/connect-ui/primitives';
  import type { CardEditorProps } from '@prusa/connect-ui/slots';

  import { heldHost } from './host';
  import { pageStateFor } from './page-state.svelte';

  let { config, onchange }: CardEditorProps = $props();

  const host = heldHost();
  const t = host.t;
  const uid = $props.id();
  const ui = pageStateFor(host);

  $effect(() => ui.follow(() => undefined));

  const racks = $derived(
    ui.layout.units.map((u) => ({ value: u.id, label: u.name })),
  );
</script>

<div class="grid gap-2">
  <Label for="{uid}-rack">{t('fleet-view.card.rack')}</Label>
  <Select
    value={typeof config.rack === 'string' ? config.rack : ''}
    items={racks}
    onValueChange={(next: string) => {
      const name = racks.find((r) => r.value === next)?.label ?? '';
      onchange({ ...config, rack: next, name });
    }}
  >
    <SelectTrigger id="{uid}-rack" class="w-full">
      <SelectValue placeholder={t('fleet-view.card.pick')} />
    </SelectTrigger>
    <SelectContent>
      {#each racks as rack (rack.value)}
        <SelectItem value={rack.value} label={rack.label}>
          {rack.label}
        </SelectItem>
      {/each}
    </SelectContent>
  </Select>
</div>
