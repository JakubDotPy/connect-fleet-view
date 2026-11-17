<!--
  The layout as a file: exported as YAML, and read back from a file or from
  pasted text. An import is shown as a report first and becomes the draft only
  when taken, so nothing changes until the layout is saved.
-->
<script lang="ts">
  import DownloadIcon from '@lucide/svelte/icons/download';
  import UploadIcon from '@lucide/svelte/icons/upload';
  import {
    Alert,
    AlertDescription,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    FileDropzone,
    Textarea,
  } from '@prusa/connect-ui/primitives';

  import { heldHost } from './host';
  import { fromYaml, type ImportResult, toYaml } from './layout-file';
  import type { PageState } from './page-state.svelte';

  let { ui }: { ui: PageState } = $props();

  const t = heldHost().t;

  let open = $state(false);
  let source = $state('');
  let result = $state<ImportResult>();

  const exportFile = (): void => {
    const blob = new Blob([toYaml(ui.layout, ui.device)], {
      type: 'application/yaml',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fleet-view-layout.yaml';
    link.click();
    URL.revokeObjectURL(url);
  };

  const read = (): void => {
    result = fromYaml(source, ui.devices, ui.layout);
  };

  const take = (): void => {
    if (!result?.ok) return;
    ui.takeDraft(result.layout);
    open = false;
    ui.say(t('fleet-view.file.taken'));
  };

  $effect(() => {
    if (!open) {
      source = '';
      result = undefined;
    }
  });
</script>

<div class="grid grid-cols-2 gap-2">
  <Button variant="secondary" size="sm" onclick={exportFile}>
    <DownloadIcon class="size-3.5" aria-hidden="true" />
    {t('fleet-view.file.export')}
  </Button>
  <Button
    variant="secondary"
    size="sm"
    onclick={() => {
      open = true;
    }}
  >
    <UploadIcon class="size-3.5" aria-hidden="true" />
    {t('fleet-view.file.import')}
  </Button>
</div>

<Dialog bind:open>
  <DialogContent size="lg">
    <DialogHeader>
      <DialogTitle>{t('fleet-view.file.title')}</DialogTitle>
      <DialogDescription>{t('fleet-view.file.description')}</DialogDescription>
    </DialogHeader>

    {#if result?.ok}
      {@const r = result.report}
      <div class="flex flex-col gap-3 py-2 text-sm">
        <p class="font-bold">
          {t('fleet-view.file.summary', {
            units: r.units,
            slots: r.slots,
            placed: r.placed,
          })}
        </p>
        {#each [['unknown', r.unknown], ['repeated', r.repeated], ['misfit', r.misfit], ['moved', r.moved]] as const as [kind, names] (kind)}
          {#if names.length > 0}
            <div class="flex flex-col gap-1">
              <span class="text-muted-foreground">
                {t(`fleet-view.file.report.${kind}`, { count: names.length })}
              </span>
              <span class="text-xs">{names.join(', ')}</span>
            </div>
          {/if}
        {/each}
      </div>
      <DialogFooter>
        <Button
          variant="secondary"
          onclick={() => {
            result = undefined;
          }}
        >
          {t('fleet-view.batch.back')}
        </Button>
        <Button onclick={take}>{t('fleet-view.file.take')}</Button>
      </DialogFooter>
    {:else}
      <div class="flex flex-col gap-3 py-2">
        <FileDropzone
          accept=".yaml,.yml,.json"
          label={t('fleet-view.file.drop')}
          compact
          onFiles={(files: File[]) => {
            const file = files[0];
            if (!file) return;
            void file.text().then((content) => {
              source = content;
              read();
            });
          }}
        />
        <Textarea
          rows={10}
          class="font-mono text-xs"
          aria-label={t('fleet-view.file.paste')}
          placeholder={t('fleet-view.file.paste')}
          bind:value={source}
        />
        {#if result && !result.ok}
          <Alert variant="destructive">
            <AlertDescription>
              {t(result.error.key, result.error.params)}
            </AlertDescription>
          </Alert>
        {/if}
      </div>
      <DialogFooter>
        <Button
          variant="secondary"
          onclick={() => {
            open = false;
          }}
        >
          {t('fleet-view.edit.cancel')}
        </Button>
        <Button disabled={source.trim() === ''} onclick={read}>
          {t('fleet-view.file.read')}
        </Button>
      </DialogFooter>
    {/if}
  </DialogContent>
</Dialog>
