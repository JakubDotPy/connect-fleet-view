<script lang="ts">
  import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
  import {
    Button,
    ConfirmDialog,
    EmptyState,
    PageHeader,
  } from '@prusa/connect-ui/primitives';

  import BatchDialog from './batch-dialog.svelte';
  import Floor from './floor.svelte';
  import { heldHost } from './host';
  import { pageStateFor } from './page-state.svelte';
  import SidePanel from './side-panel.svelte';
  import Stats from './stats.svelte';
  import UnitView from './unit-view.svelte';

  // A page takes no props: the route is the whole context.
  const host = heldHost();
  const t = host.t;

  const ui = pageStateFor(host);

  $effect(() => {
    ui.seedWhenLoaded();
  });

  $effect(() =>
    ui.follow(() => {
      ui.say(t('fleet-view.layout.loadFailed'));
    }),
  );

  let conflict = $state(false);
  let saving = $state(false);
  const save = async (): Promise<void> => {
    saving = true;
    try {
      if ((await ui.save()) === 'changed') conflict = true;
      else ui.say(t('fleet-view.edit.saved'));
    } catch {
      ui.say(t('fleet-view.layout.saveFailed'));
    } finally {
      saving = false;
    }
  };

  const unit = $derived(ui.openUnit);

  // The stage takes the height left under it, as the queue's board does.
  let stage = $state<HTMLElement>();
  let height = $state(480);
  $effect(() => {
    if (!stage) return;
    const el = stage;
    const measure = (): void => {
      height = Math.max(
        360,
        window.innerHeight - el.getBoundingClientRect().top - 56,
      );
    };
    measure();
    window.addEventListener('resize', measure);

    return () => {
      window.removeEventListener('resize', measure);
    };
  });

  $effect(() => {
    const clear = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || ui.controlsOpen) return;
      if (ui.held) ui.held = undefined;
      else ui.selection = undefined;
    };
    window.addEventListener('keydown', clear);

    return () => {
      window.removeEventListener('keydown', clear);
    };
  });
</script>

<div class="flex flex-col gap-3">
  <PageHeader title={t('fleet-view.page.title')}>
    {#snippet actions()}
      {#if ui.editing}
        <span class="text-sm font-semibold text-primary">
          {t('fleet-view.edit.mode')}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onclick={() => {
            ui.reset();
          }}
        >
          {t('fleet-view.page.reset')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onclick={() => {
            ui.cancel();
          }}
        >
          {t('fleet-view.edit.cancel')}
        </Button>
        <Button
          size="sm"
          disabled={saving}
          onclick={() => {
            void save();
          }}
        >
          {t('fleet-view.edit.save')}
        </Button>
      {:else}
        <Button
          variant="secondary"
          size="sm"
          disabled={!ui.ready}
          onclick={() => {
            ui.edit();
          }}
        >
          <SlidersHorizontalIcon class="size-3.5" aria-hidden="true" />
          {t('fleet-view.edit.start')}
        </Button>
      {/if}
    {/snippet}
  </PageHeader>

  <Stats devices={ui.placedDevices} labels />

  <div bind:this={stage} class="flex flex-col items-start gap-4 lg:flex-row">
    <div class="w-full min-w-0 flex-1">
      {#if ui.layout.units.length === 0 && !ui.editing}
        <EmptyState
          size="sm"
          heading={t('fleet-view.empty.title')}
          description={t('fleet-view.empty.body')}
        />
      {:else if ui.onFloor}
        <Floor {ui} {height} />
      {:else if unit}
        <UnitView {ui} {unit} {height} />
      {/if}
    </div>
    <div class="w-full shrink-0 lg:w-72">
      <SidePanel {ui} {height} />
    </div>
  </div>
</div>

<BatchDialog {ui} />

<ConfirmDialog
  bind:open={conflict}
  title={t('fleet-view.layout.changedTitle')}
  description={t('fleet-view.layout.changedNote', {
    // The host names a person as user:<login>.
    who: ui.savedBy?.replace(/^user:/, '') ?? t('fleet-view.layout.someone'),
  })}
  confirmLabel={t('fleet-view.layout.overwrite')}
  onConfirm={() => {
    conflict = false;
    void save();
  }}
/>

<div
  role="status"
  aria-live="polite"
  class={[
    'fixed start-1/2 bottom-6 z-50 -translate-x-1/2 rounded-md border border-border bg-popover px-4 py-2 text-sm shadow-lg',
    !ui.notice && 'invisible',
  ]}
>
  {ui.notice}
</div>
