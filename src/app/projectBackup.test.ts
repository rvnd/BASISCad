import { describe, expect, it } from 'vitest';
import { backupFilename, parseBackup, serializeBackup } from './projectBackup';
import type { DesignDocument } from './projects';

const design: DesignDocument = {
  id: 'project',
  name: 'Class Bridge',
  updatedAt: 100,
  labelMode: 'measurements',
  placed: [
    {
      id: 'base',
      libraryId: 'girder-1x6',
      position: { x: 3.175, y: 0, z: -10 },
      rotation: { x: 15, y: 22.5, z: 0 },
      groupId: 'group',
      groupRotation: { x: 0, y: 45, z: 0 },
      locked: true,
      label: { hidden: true, offset: { x: 18, y: -4 } },
    },
    {
      id: 'arm',
      libraryId: 'girder-1x6',
      position: { x: 3.175, y: 3.175, z: -10 },
      rotation: { x: 0, y: 0, z: 0 },
      hingeAngleDeg: -22.5,
    },
    {
      id: 'screw',
      libraryId: 'fastener',
      position: { x: 3.175, y: 0, z: -10 },
      rotation: { x: 0, y: 0, z: 0 },
      fastener: {
        holes: [
          { pieceId: 'base', holeIndex: 0 },
          { pieceId: 'arm', holeIndex: 0 },
        ],
        lengthInches: 0.375,
        stackDepthMm: 6.35,
      },
    },
  ],
};

describe('portable project format', () => {
  it('round-trips every design field without changing legacy angles or millimetres', () => {
    expect(parseBackup(serializeBackup(design))).toEqual(design);
    expect(parseBackup(serializeBackup({ ...design, placed: [] })).placed).toEqual([]);
    expect(backupFilename(' Bridge / 1 ')).toBe('Bridge-1.basiscad.json');
  });

  it('rejects malformed versions, missing meshes, duplicate IDs and broken connections', () => {
    const file = JSON.parse(serializeBackup(design));
    for (const value of [
      '{',
      'null',
      '{}',
      JSON.stringify({ ...file, version: 2 }),
      JSON.stringify({ ...file, units: 'inches' }),
    ])
      expect(() => parseBackup(value)).toThrow();
    const invalid: DesignDocument[] = [
      { ...design, placed: [...design.placed, design.placed[0]!] },
      { ...design, placed: [{ ...design.placed[0]!, libraryId: 'missing-mesh' }] },
      { ...design, placed: design.placed.filter((piece) => piece.id !== 'arm') },
      {
        ...design,
        placed: design.placed.map((piece) =>
          piece.fastener
            ? {
                ...piece,
                fastener: {
                  ...piece.fastener,
                  holes: [
                    { pieceId: 'base', holeIndex: 50 },
                    { pieceId: 'arm', holeIndex: 0 },
                  ],
                },
              }
            : piece,
        ),
      },
      { ...design, placed: [{ ...design.placed[0]!, position: { x: Infinity, y: 0, z: 0 } }] },
    ];
    for (const document of invalid) expect(() => serializeBackup(document)).toThrow();
    expect(design.placed[0]!.rotation.x).toBe(15);
  });
});
