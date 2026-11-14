import type { GravityInput, GravityRequest, GravityResponse } from '../app/gravity';

/** The worker owns physics time. Transferred geometry belongs to the worker, never the registry. */
export function startGravity(input: GravityInput, receive: (response: GravityResponse) => void) {
  const worker = new Worker(new URL('./gravity.worker.ts', import.meta.url), { type: 'module' });
  let stopped = false;
  const send = (request: GravityRequest) => {
    if (!stopped) worker.postMessage(request);
  };
  worker.onmessage = (event: MessageEvent<GravityResponse>) => {
    if (stopped) return;
    receive(event.data);
    if ('frame' in event.data) send({ type: 'ack' });
  };
  worker.onerror = () =>
    receive({ type: 'error', message: 'Gravity could not load. Reset and try again.' });
  worker.postMessage(
    { type: 'start', input } satisfies GravityRequest,
    input.shapes.map((s) => s.positionsMm.buffer),
  );
  return {
    pause: () => send({ type: 'pause' }),
    resume: () => send({ type: 'resume' }),
    gravity: (acceleration: number) => send({ type: 'gravity', acceleration }),
    stop: () => {
      stopped = true;
      worker.terminate();
    },
  };
}
