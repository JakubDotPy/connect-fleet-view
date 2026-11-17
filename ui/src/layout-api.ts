// The shared floor plan, read from and saved to this module's own process.
// Two routes do not earn a generated client, so the operations are written out.
import { ApiError, type Operation } from '@prusa/connect';
import type { ModuleHost } from '@prusa/connect-ui/slots';

import type { Layout } from './fleet';

// The namespace the host derives from the repository address; faults.go names it too.
const MOUNT = '/api/v1/modules/com.github.aux.jakubdotpy.connect-fleet-view';

const READ: Operation = {
  id: 'read-layout',
  method: 'GET',
  path: `${MOUNT}/layout`,
  response: 'json',
  anonymous: false,
};
const SAVE: Operation = {
  id: 'save-layout',
  method: 'PUT',
  path: `${MOUNT}/layout`,
  body: 'application/json',
  response: 'json',
  anonymous: false,
};

/** The layout as the server holds it; version 0 and a null layout before the first save. */
export interface Saved {
  version: number;
  layout: Layout | null;
  saved_by?: string;
}

export interface LayoutApi {
  read(): Promise<Saved>;
  /** The saved layout, or undefined when someone saved over `version` first. */
  save(version: number, layout: Layout): Promise<Saved | undefined>;
}

const CHANGED = 'com.github.aux.jakubdotpy.connect-fleet-view/LAYOUT_CHANGED';

export const layoutApi = (host: ModuleHost): LayoutApi => ({
  read: async () =>
    await host.client.transport.call<Saved>(READ, {}, host.signal),
  save: async (version, layout) => {
    try {
      return await host.client.transport.call<Saved>(
        SAVE,
        { body: { version, layout } },
        host.signal,
      );
    } catch (e) {
      if (e instanceof ApiError && e.code === CHANGED) return undefined;
      throw e;
    }
  },
});
