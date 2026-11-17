<!--
  Controls for every printer selected at once. Each action says how many
  printers it reaches; one that reaches none is switched off with the reason.
  Every printer is sent its own command, and the result is shown per printer.
-->
<script lang="ts">
  import { createDeviceCommands } from '@prusa/connect-ui/data';
  import { type Device, PREHEAT_PRESETS } from '@prusa/connect-ui/domain';
  import {
    Button,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    PrinterIcon,
  } from '@prusa/connect-ui/primitives';

  import { type Action, ACTION_GROUPS, ACTIONS, reached } from './actions';
  import { artworkOf, groupOf } from './fleet';
  import { heldHost } from './host';
  import type { PageState } from './page-state.svelte';
  import Stats from './stats.svelte';
  import { GROUP_DOT } from './tones';

  let { ui }: { ui: PageState } = $props();

  const host = heldHost();
  const t = host.t;

  const PRESETS = PREHEAT_PRESETS.slice(0, 4).map((p) => p.material);

  interface Outcome {
    device: Device;
    ok: boolean;
  }

  let preset = $state('PLA');
  let asking = $state<Action>();
  let running = $state<Action>();
  let outcomes = $state<Outcome[]>();

  const devices = $derived(ui.selected);

  const title = $derived.by(() => {
    const sel = ui.selection;
    const unit = sel ? ui.unit(sel.unit) : undefined;
    if (!sel || !unit) return '';
    const shelf =
      sel.shelf === undefined ? undefined : unit.shelves[sel.shelf]?.name;
    const printer =
      sel.printer === undefined ? undefined : ui.device(sel.printer)?.name;

    return [unit.name, shelf, printer]
      .filter((x) => x !== undefined)
      .join(' › ');
  });

  $effect(() => {
    if (!ui.controlsOpen) {
      asking = undefined;
      outcomes = undefined;
    }
  });

  const run = async (action: Action): Promise<void> => {
    asking = undefined;
    running = action;
    const targets = reached(action, devices);
    outcomes = await Promise.all(
      targets.map(async (device): Promise<Outcome> => {
        const commands = createDeviceCommands(host.client, device.id);
        for (const step of action.steps(preset)) {
          const sent = await commands.send(step.verb, step.args, {
            quiet: true,
          });
          if (sent.kind !== 'accepted') return { device, ok: false };
        }

        return { device, ok: true };
      }),
    );
    running = undefined;
  };

  const press = (action: Action): void => {
    if (action.confirm) asking = action;
    else void run(action);
  };
</script>

<Dialog bind:open={ui.controlsOpen}>
  <DialogContent size="lg">
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>
        {t('fleet-view.batch.count', { count: devices.length })}
      </DialogDescription>
      <Stats {devices} labels />
    </DialogHeader>

    {#if asking}
      {@const n = reached(asking, devices).length}
      <div class="flex flex-col gap-2 py-2">
        <p class="font-bold">
          {t(`fleet-view.batch.confirm.${asking.id}`, { count: n })}
        </p>
        <p class="text-sm text-muted-foreground">
          {t(`fleet-view.batch.confirmNote.${asking.id}`)}
        </p>
      </div>
      <DialogFooter>
        <Button
          variant="secondary"
          onclick={() => {
            asking = undefined;
          }}
        >
          {t('fleet-view.batch.back')}
        </Button>
        <Button
          variant="destructive"
          onclick={() => {
            if (asking) void run(asking);
          }}
        >
          {t(`fleet-view.batch.action.${asking.id}`)}
        </Button>
      </DialogFooter>
    {:else if outcomes}
      {@const done = outcomes.filter((o) => o.ok).length}
      <div class="flex flex-col gap-3 py-2">
        <p class="font-bold">
          {t('fleet-view.batch.result', { done, count: outcomes.length })}
        </p>
        <ul class="flex max-h-72 flex-col gap-1 overflow-auto">
          {#each outcomes as o (o.device.id)}
            <li class="flex items-center gap-2 text-sm">
              <PrinterIcon
                model={artworkOf(o.device)}
                reported={o.device.model}
                class="size-6"
              />
              <span class="flex-1 truncate">{o.device.name}</span>
              <span class={o.ok ? 'text-success' : 'text-destructive'}>
                {o.ok
                  ? t('fleet-view.batch.sent')
                  : t('fleet-view.batch.refused')}
              </span>
            </li>
          {/each}
        </ul>
      </div>
      <DialogFooter>
        <Button
          variant="secondary"
          onclick={() => {
            outcomes = undefined;
          }}
        >
          {t('fleet-view.batch.more')}
        </Button>
        <Button
          onclick={() => {
            ui.controlsOpen = false;
          }}
        >
          {t('fleet-view.batch.done')}
        </Button>
      </DialogFooter>
    {:else}
      <div class="flex flex-col gap-4 py-2">
        {#each ACTION_GROUPS as group (group)}
          <section class="flex flex-col gap-2">
            <h3 class="text-sm font-semibold text-muted-foreground">
              {t(`fleet-view.batch.group.${group}`)}
            </h3>
            <div class="flex flex-wrap items-center gap-2">
              {#if group === 'temperature'}
                <span class="flex rounded-md border border-border p-0.5">
                  {#each PRESETS as material (material)}
                    <Button
                      size="sm"
                      variant={preset === material ? 'default' : 'ghost'}
                      onclick={() => {
                        preset = material;
                      }}
                    >
                      {material}
                    </Button>
                  {/each}
                </span>
              {/if}
              {#each ACTIONS.filter((a) => a.group === group) as action (action.id)}
                {@const n = reached(action, devices).length}
                <Button
                  variant={action.confirm && n > 0
                    ? 'destructive'
                    : 'secondary'}
                  disabled={n === 0 || running !== undefined}
                  pending={running === action}
                  title={n === 0
                    ? t(`fleet-view.batch.none.${action.id}`)
                    : undefined}
                  onclick={() => {
                    press(action);
                  }}
                >
                  {t('fleet-view.batch.button', {
                    action: t(`fleet-view.batch.action.${action.id}`),
                    count: n,
                  })}
                </Button>
              {/each}
            </div>
          </section>
        {/each}

        <Collapsible class="text-sm">
          <CollapsibleTrigger>
            {t('fleet-view.batch.list')}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul class="mt-2 flex max-h-56 flex-col gap-1 overflow-auto">
              {#each devices as d (d.id)}
                <li class="flex items-center gap-2">
                  <span class={['size-2 rounded-full', GROUP_DOT[groupOf(d)]]}
                  ></span>
                  <span class="flex-1 truncate">{d.name}</span>
                  <span class="text-muted-foreground">{d.model}</span>
                </li>
              {/each}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </div>
    {/if}
  </DialogContent>
</Dialog>
