import { describe, expect, test } from 'vitest';
import {
  CAMERA_VIEWS,
  DEFAULT_CAMERA_VIEW_ID,
  framesWorkplane,
  getCameraView,
  isAboveWorkplane,
} from './cameraViews';

describe('camera views', () => {
  test('dropdown order is Top, Front, Back, Left, Right, then 3D last', () => {
    expect(CAMERA_VIEWS.map((view) => view.label)).toEqual([
      'Top',
      'Front',
      'Back',
      'Left',
      'Right',
      '3D',
    ]);
    expect(CAMERA_VIEWS.map((view) => view.id)).toEqual([
      'top',
      'front',
      'back',
      'left',
      'right',
      '3d',
    ]);
  });

  test('the app starts on the 3D view', () => {
    expect(DEFAULT_CAMERA_VIEW_ID).toBe('3d');
    expect(getCameraView(DEFAULT_CAMERA_VIEW_ID)?.label).toBe('3D');
  });

  test('Top is directly above the centre, looking straight down', () => {
    const top = getCameraView('top');
    expect(top?.position).toEqual([0, 1400, 0]);
  });

  test('Front and Back are opposite sides, slightly above the plane', () => {
    const front = getCameraView('front');
    const back = getCameraView('back');
    expect(front?.position).toEqual([0, 250, 1400]);
    expect(back?.position).toEqual([0, 250, -1400]);
  });

  test('Left and Right are opposite sides, slightly above the plane', () => {
    const left = getCameraView('left');
    const right = getCameraView('right');
    expect(left?.position).toEqual([-1400, 250, 0]);
    expect(right?.position).toEqual([1400, 250, 0]);
  });

  test('3D is the Milestone 0 framing camera on the (1, 1, 1) diagonal', () => {
    expect(getCameraView('3d')?.position).toEqual([700, 700, 700]);
  });

  test('every view sits above the workplane and far enough out to frame it', () => {
    for (const view of CAMERA_VIEWS) {
      expect(isAboveWorkplane(view.position)).toBe(true);
      expect(framesWorkplane(view.position)).toBe(true);
    }
  });

  test('unknown view id returns undefined', () => {
    expect(getCameraView('orbit' as never)).toBeUndefined();
  });
});
