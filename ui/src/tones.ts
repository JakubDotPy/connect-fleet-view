// Static class strings per state, so Tailwind finds every one of them.
import type { PrinterStateTone } from '@prusa/connect-ui/domain';
import type { BadgeVariant } from '@prusa/connect-ui/primitives';

import type { Group } from './fleet';

/** The Printers screen's badge per tint, so a state wears the same badge here. */
export const BADGE: Readonly<Record<PrinterStateTone, BadgeVariant>> = {
  active: 'stateActive',
  attention: 'stateAttention',
  done: 'stateDone',
  fault: 'stateFault',
  idle: 'stateIdle',
  quiet: 'stateQuiet',
};

/** The edge a printer's tile carries on its left, as the queue's rows do. */
export const EDGE: Readonly<Record<PrinterStateTone, string>> = {
  active: 'bg-state-active-edge',
  attention: 'bg-state-attention-edge',
  done: 'bg-state-done-edge',
  fault: 'bg-state-fault-edge',
  idle: 'bg-state-idle-edge',
  quiet: 'bg-state-quiet-edge',
};

export const GROUP_DOT: Readonly<Record<Group, string>> = {
  printing: 'bg-state-active-edge',
  attention: 'bg-state-attention-edge',
  done: 'bg-state-done-edge',
  idle: 'bg-state-idle-edge',
  silent: 'bg-state-quiet-edge',
};

/** A slot on the floor's miniature rack: lit in the printer's group. */
export const GROUP_SLOT: Readonly<Record<Group, string>> = {
  printing: 'border-state-active-edge bg-state-active',
  attention: 'border-state-attention-edge bg-state-attention',
  done: 'border-state-done-edge bg-state-done',
  idle: 'border-state-idle-edge bg-state-idle',
  silent: 'border-state-quiet-edge bg-state-quiet opacity-60',
};
