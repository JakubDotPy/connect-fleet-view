// What the batch dialog can do to the printers selected, and which of them
// each action reaches. Every verb is one the core publishes as a capability.
import {
  type Device,
  PREHEAT_PRESETS,
  type PrinterState,
} from '@prusa/connect-ui/domain';

import { stateOf } from './fleet';

export type ActionGroup = 'print' | 'readiness' | 'temperature' | 'motion';

export interface Step {
  verb: string;
  /** As the command endpoint takes them: every value a string. */
  args?: Record<string, string>;
}

export interface Action {
  id: string;
  group: ActionGroup;
  /** Asks before it runs: what it does cannot be undone. */
  confirm?: boolean;
  /** The states a printer must be in for the action to reach it. */
  states: readonly PrinterState[];
  steps: (preset: string) => Step[];
}

const AT_REST: readonly PrinterState[] = [
  'IDLE',
  'READY',
  'FINISHED',
  'STOPPED',
];

const heat = (preset: string): Step[] => {
  const p =
    PREHEAT_PRESETS.find((x) => x.material === preset) ?? PREHEAT_PRESETS[0];

  return p
    ? [
        {
          verb: 'core.command.set_nozzle_temperature',
          args: { nozzle_temperature: String(p.nozzleCelsius) },
        },
        {
          verb: 'core.command.set_bed_temperature',
          args: { bed_temperature: String(p.bedCelsius) },
        },
      ]
    : [];
};

export const ACTIONS: readonly Action[] = [
  {
    id: 'pause',
    group: 'print',
    states: ['PRINTING'],
    steps: () => [{ verb: 'core.command.pause_print' }],
  },
  {
    id: 'resume',
    group: 'print',
    states: ['PAUSED'],
    steps: () => [{ verb: 'core.command.resume_print' }],
  },
  {
    id: 'stop',
    group: 'print',
    confirm: true,
    states: ['PRINTING', 'PAUSED'],
    steps: () => [{ verb: 'core.command.stop_print' }],
  },
  {
    id: 'ready',
    group: 'readiness',
    states: ['IDLE', 'FINISHED', 'STOPPED'],
    steps: () => [{ verb: 'core.command.set_printer_ready' }],
  },
  {
    id: 'unready',
    group: 'readiness',
    states: ['READY'],
    steps: () => [{ verb: 'core.command.cancel_printer_ready' }],
  },
  {
    id: 'preheat',
    group: 'temperature',
    states: AT_REST,
    steps: heat,
  },
  {
    id: 'cool',
    group: 'temperature',
    states: AT_REST,
    steps: () => [
      {
        verb: 'core.command.set_nozzle_temperature',
        args: { nozzle_temperature: '0' },
      },
      {
        verb: 'core.command.set_bed_temperature',
        args: { bed_temperature: '0' },
      },
    ],
  },
  {
    id: 'home',
    group: 'motion',
    states: AT_REST,
    steps: () => [{ verb: 'core.command.home' }],
  },
];

export const ACTION_GROUPS: readonly ActionGroup[] = [
  'print',
  'readiness',
  'temperature',
  'motion',
];

/** The printers an action reaches: in a state it applies to, and able to take its verbs. */
export const reached = (action: Action, devices: readonly Device[]): Device[] =>
  devices.filter((d) => {
    if (!action.states.includes(stateOf(d))) return false;
    const caps = d.capabilities;

    return (
      caps === null ||
      action.steps('PLA').every((step) => caps.includes(step.verb))
    );
  });
