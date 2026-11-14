import { GravityWorld, initializeGravity } from './gravityWorld';
import { GRAVITY_MAX_SECONDS, GRAVITY_STEP_SECONDS } from '../app/gravity';
import type { GravityRequest, GravityResponse } from '../app/gravity';

let simulation: GravityWorld | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false,
  waiting = false,
  previous = 0,
  accumulated = 0;
let pauseAt = GRAVITY_MAX_SECONDS;
const post = (response: GravityResponse, transfer: Transferable[] = []) =>
  self.postMessage(response, { transfer });
const stop = () => {
  running = false;
  clearTimeout(timer);
};
const publish = (type: 'frame' | 'paused' | 'settled') => {
  if (!simulation || (waiting && type === 'frame')) return;
  const frame = simulation.frame();
  waiting = true;
  post({ type, frame }, [frame.poses.buffer]);
};
const tick = () => {
  if (!running || !simulation) return;
  try {
    const now = performance.now();
    accumulated += Math.min(0.05, (now - previous) / 1000);
    previous = now;
    const steps = Math.floor(accumulated / GRAVITY_STEP_SECONDS);
    if (steps > 0) {
      const frame = simulation.step(steps);
      accumulated -= steps * GRAVITY_STEP_SECONDS;
      if (!frame.awake && frame.seconds > 1) {
        stop();
        publish('settled');
        return;
      }
      if (frame.seconds >= pauseAt) {
        stop();
        publish('paused');
        return;
      }
      publish('frame');
    }
    timer = setTimeout(tick, Math.max(0, GRAVITY_STEP_SECONDS * 1000 - (performance.now() - now)));
  } catch (error) {
    stop();
    post({
      type: 'error',
      message: error instanceof Error ? error.message : 'Gravity stopped unexpectedly.',
    });
  }
};
const resume = () => {
  if (running || !simulation) return;
  running = true;
  pauseAt = simulation.frame().seconds + GRAVITY_MAX_SECONDS;
  previous = performance.now();
  timer = setTimeout(tick, 0);
};
self.onmessage = async (event: MessageEvent<GravityRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'start') {
      stop();
      simulation?.dispose();
      await initializeGravity();
      simulation = new GravityWorld(request.input);
      post({ type: 'ready', summary: simulation.summary });
      publish('frame');
      resume();
    } else if (request.type === 'pause') {
      stop();
      publish('paused');
    } else if (request.type === 'resume') resume();
    else if (request.type === 'gravity') simulation?.setGravity(request.acceleration);
    else waiting = false;
  } catch (error) {
    stop();
    post({
      type: 'error',
      message: error instanceof Error ? error.message : 'Could not start gravity.',
    });
  }
};
