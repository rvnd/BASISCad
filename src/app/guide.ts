export const GUIDE_SEEN_STORAGE_KEY = 'basiscad.guide-seen.v1';

export const GUIDE_STEPS = [
  {
    title: 'Add two pieces',
    text: 'In Shapes, choose Girders and click Place beside 1x6 Girder twice. Each new piece is selected.',
  },
  {
    title: 'Move a piece',
    text: 'Drag the selected piece on the workplane, or enter X, Y (height), and Z in Move and rotate. Try X = 80 mm. Drag empty space to orbit the camera.',
  },
  {
    title: 'Rotate a piece',
    text: 'Choose Rotate and drag a coloured curved handle, or enter a precise angle. Try Y = 90°. Rotation changes orientation; it keeps the printed piece size.',
  },
  {
    title: 'Connect two holes',
    text: 'Click Connect, then a hole marker on each piece. The first piece moves to the second. Use Camera view → Top and Zoom in if the markers are small. Escape cancels picking.',
  },
  {
    title: 'Add a screw and nut',
    text: 'After connecting, choose Yes to add the correctly sized screw and nut. Screw + Nut adds another pair at an empty aligned hole. One screw allows Swing; two screws fix the joint.',
  },
  {
    title: 'Save your design',
    text: 'Choose Menu → Save Design. Open Design brings it back later. Designs are saved in this browser on this device; keep using the same browser. Undo and Redo let you revise your work.',
  },
] as const;

export function readGuideSeen(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return storage.getItem(GUIDE_SEEN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markGuideSeen(storage: Pick<Storage, 'setItem'>): void {
  try {
    storage.setItem(GUIDE_SEEN_STORAGE_KEY, 'true');
  } catch {
    // Help and the current session still work when browser storage is unavailable.
  }
}
