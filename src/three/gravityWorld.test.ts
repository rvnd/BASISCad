import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { GravityWorld, gravityComponents, initializeGravity } from './gravityWorld';
import { prepareGravityInput } from './gravityInput';
import { gravityCollisionModel, COLLIDER_CELL_MM } from './gravityColliders';
import { loadFixtureLibrary, classroomDesign } from '../../scripts/designFixtures';
import type { GravityInput } from '../app/gravity';
import { GRAVITY_STEP_SECONDS } from '../app/gravity';
import { registerGeometry } from './libraryGeometry';
import { fastenStack } from './fastening';
import type { PlacedPiece } from '../app/design';

beforeAll(initializeGravity);
function cube(height = 300): GravityInput {
  const geometry = new THREE.BoxGeometry(20, 20, 20).toNonIndexed();
  const positionsMm = new Float32Array(geometry.getAttribute('position').array);
  geometry.dispose();
  return {
    acceleration: 9.81,
    connections: [],
    shapes: [{ id: 'cube', name: 'Cube', steel: false, positionsMm }],
    pieces: [
      {
        id: 'cube',
        shapeId: 'cube',
        originMm: { x: 0, y: height, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
    ],
  };
}
describe('gravity', () => {
  it('lets an unsupported overhanging stack separate despite an editor group', () => {
    const library = loadFixtureLibrary();
    const placed: PlacedPiece[] = [0, 1, 2].map((i) => ({
      id: `loose-${i}`,
      libraryId: 'girder-1x4',
      groupId: 'editor-only',
      position: { x: i * 3, y: 100 + i * library.get('girder-1x4')!.sizeMm!.x, z: 0 },
      rotation: { x: 0, y: 0, z: 90 },
    }));
    const sim = new GravityWorld(prepareGravityInput(placed, library, 9.81));
    try {
      expect(sim.summary.bodies).toBe(3);
      const first = sim.frame(),
        last = sim.step(360);
      const distance = (frame: typeof first) =>
        Math.hypot(...[0, 1, 2].map((k) => frame.poses[k]! - frame.poses[k + 14]!));
      expect(Math.abs(distance(last) - distance(first))).toBeGreaterThan(5);
      expect(last.poses[1]).toBeLessThan(30);
    } finally {
      sim.dispose();
    }
  });
  it('allows continuous gravity-driven hinge rotation while its anchor remains fixed', () => {
    const library = loadFixtureLibrary();
    const placed: PlacedPiece[] = [0, 1].map((i) => ({
      id: `hinged-${i}`,
      libraryId: 'girder-1x6',
      position: { x: 0, y: 100, z: i * 3.175 },
      rotation: { x: 90, y: 0, z: 0 },
    }));
    const fastened = fastenStack(placed, library, { pieceId: 'hinged-0', holeIndex: 0 }, 'hinge')!;
    expect(fastened).not.toBeNull();
    const input = prepareGravityInput(fastened, library, 9.81);
    const sim = new GravityWorld(input);
    try {
      const bodies: RAPIER.RigidBody[] = [];
      sim.world.forEachRigidBody((body) => bodies.push(body));
      bodies[0]!.setBodyType(RAPIER.RigidBodyType.Fixed, true); // An anchored test fixture, independent of editor locks.
      const start = sim.frame();
      const end = sim.step(120);
      const q = (f: typeof start) => new THREE.Quaternion().fromArray(f.poses, 10);
      expect(q(start).angleTo(q(end))).toBeGreaterThan(0.1);
      const point = input.connections[0]!.pivotMm;
      const local = new THREE.Vector3(point.x, point.y, point.z)
        .sub(new THREE.Vector3().copy(input.pieces[1]!.originMm))
        .applyQuaternion(new THREE.Quaternion().copy(input.pieces[1]!.rotation).invert());
      const actual = local.applyQuaternion(q(end)).add(new THREE.Vector3().fromArray(end.poses, 7));
      expect(actual.distanceTo(new THREE.Vector3(point.x, point.y, point.z))).toBeLessThan(0.3);
    } finally {
      sim.dispose();
    }
  });
  it('falls in SI units at Earth and Moon acceleration and changes gravity without teleporting', () => {
    for (const g of [1.62, 9.81]) {
      const input = cube(2000);
      input.acceleration = g;
      const sim = new GravityWorld(input);
      try {
        const frame = sim.step(Math.round(0.5 / GRAVITY_STEP_SECONDS));
        const fall = 0.5 * g * 0.5 ** 2 * 1000;
        // Bound numerical integration error to 1% of the analytical half-second fall.
        expect(Math.abs(frame.poses[1]! - (2000 - fall))).toBeLessThan(fall * 0.01);
        const before = sim.frame().poses[1]!;
        sim.setGravity(0);
        expect(sim.frame().poses[1]).toBe(before);
        expect(sim.step(6).poses[1]).toBeLessThan(before);
      } finally {
        sim.dispose();
      }
    }
  });
  it('keeps thin real pieces from tunnelling through support under strong gravity', () => {
    const library = loadFixtureLibrary();
    const input = prepareGravityInput(
      [
        {
          id: 'thin',
          libraryId: 'girder-1x4',
          position: { x: 0, y: 1000, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          locked: true,
        },
      ],
      library,
      20,
    );
    const sim = new GravityWorld(input);
    try {
      const frame = sim.step(360);
      expect(frame.poses[1]).toBeGreaterThan(-0.1);
      expect(frame.poses[1]).toBeLessThan(1);
      expect(frame.awake).toBe(0);
    } finally {
      sim.dispose();
    }
  });
  it('lets a small falling body pass through a real bore while floor support remains active', () => {
    const library = new Map(loadFixtureLibrary());
    const geometry = new THREE.BoxGeometry(2, 2, 2).translate(0, 1, 0);
    registerGeometry('bore-probe', geometry);
    library.set('bore-probe', {
      ...library.get('girder-1x4')!,
      id: 'bore-probe',
      geometryId: 'bore-probe',
    });
    const hole = library.get('girder-1x4')!.holes![0]!;
    const placed: PlacedPiece[] = [
      {
        id: 'plate',
        libraryId: 'girder-1x4',
        position: { x: 0, y: 100, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
      },
      {
        id: 'probe',
        libraryId: 'bore-probe',
        position: { x: hole.center.x, y: 150, z: hole.center.z },
        rotation: { x: 0, y: 0, z: 0 },
      },
    ];
    const sim = new GravityWorld(prepareGravityInput(placed, library, 9.81));
    try {
      const bodies: RAPIER.RigidBody[] = [];
      sim.world.forEachRigidBody((b) => bodies.push(b));
      bodies[0]!.setBodyType(RAPIER.RigidBodyType.Fixed, true);
      const frame = sim.step(240);
      expect(frame.poses[8]).toBeLessThan(1);
      expect(frame.poses[8]).toBeGreaterThan(-COLLIDER_CELL_MM);
    } finally {
      sim.dispose();
      geometry.dispose();
    }
  });
  it('catches a part falling off the finite workplane on the lower floor', () => {
    const input = cube(100);
    input.pieces[0]!.originMm.x = 600;
    const sim = new GravityWorld(input);
    try {
      expect(sim.step(240).poses[1]).toBeCloseTo(-990, 0);
    } finally {
      sim.dispose();
    }
  });
  it('keeps zero gravity stationary, resolves ground contact and settles without shaking', () => {
    const input = cube();
    input.acceleration = 0;
    const zero = new GravityWorld(input);
    try {
      expect(zero.step(120).poses[1]).toBeCloseTo(300, 3);
    } finally {
      zero.dispose();
    }
    const sim = new GravityWorld(cube());
    try {
      const end = sim.step(600);
      expect(end.poses[1]).toBeCloseTo(10, 0);
      expect(end.awake).toBe(0);
      expect(sim.step(120).poses).toEqual(end.poses);
    } finally {
      sim.dispose();
    }
  });
  it('keeps all 17 solid outlines and bores in reusable compound collision models', () => {
    const library = loadFixtureLibrary();
    for (const piece of library.values()) {
      const input = prepareGravityInput(
        [
          {
            id: 'part',
            libraryId: piece.id,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
          },
        ],
        library,
        9.81,
      );
      const model = gravityCollisionModel(input.shapes[0]!);
      expect(model.massGrams).toBeGreaterThan(0);
      expect(model.boxes.length).toBeLessThan(500);
      for (const hole of piece.holes ?? []) {
        expect(
          model.boxes.some((box) =>
            ['x', 'y', 'z'].every(
              (axis) =>
                Math.abs(hole.center[axis as 'x'] - box.centerMm[axis as 'x']) <
                box.halfMm[axis as 'x'] - 1e-5,
            ),
          ),
        ).toBe(false);
      }
    }
  });
  it('rejects flat and open imports without creating a world', () => {
    expect(() =>
      gravityCollisionModel({
        id: 'flat',
        name: 'Flat',
        steel: false,
        positionsMm: new Float32Array([0, 0, 0, 10, 0, 0, 0, 0, 10]),
      }),
    ).toThrow(/three-dimensional|closed/);
    const input = cube();
    input.shapes[0]!.positionsMm.fill(NaN);
    expect(() => new GravityWorld(input)).toThrow('finite');
  });
  it('ignores editor groups, and merges fixed joints through connected subassemblies', () => {
    const input = cube();
    input.pieces = [...input.pieces, ...['b', 'c'].map((id) => ({ ...input.pieces[0]!, id }))];
    expect(new Set(gravityComponents(input).values()).size).toBe(3);
    const connect = (id: string, a: string, b: string, x: number) => ({
      id,
      pieces: [a, b],
      pivotMm: { x, y: 0, z: 0 },
      axis: { x: 0, y: 1, z: 0 },
    });
    input.connections = [
      connect('ab0', 'cube', 'b', 0),
      connect('ab1', 'cube', 'b', 10),
      connect('ac', 'cube', 'c', 0),
      connect('bc', 'b', 'c', 10),
    ];
    expect(new Set(gravityComponents(input).values()).size).toBe(1);
  });
  it('runs the real screwed group and hinge with fasteners attached and original data intact', () => {
    const library = loadFixtureLibrary();
    const placed = classroomDesign(library);
    const saved = JSON.stringify(placed);
    const input = prepareGravityInput(placed, library, 9.81);
    const sim = new GravityWorld(input);
    try {
      expect(sim.summary.hinges).toBe(1);
      expect(sim.summary.bodies).toBe(20);
      const start = sim.frame();
      const end = sim.step(240);
      const distance = (frame: typeof start, a: string, b: string) => {
        const i = input.pieces.findIndex((p) => p.id === a) * 7,
          j = input.pieces.findIndex((p) => p.id === b) * 7;
        return Math.hypot(...[0, 1, 2].map((k) => frame.poses[i + k]! - frame.poses[j + k]!));
      };
      expect(distance(end, 'group-stock-0', 'group-screw-0')).toBeCloseTo(
        distance(start, 'group-stock-0', 'group-screw-0'),
        3,
      );
      expect(distance(end, 'group-stock-0', 'group-stock-3')).toBeCloseTo(
        distance(start, 'group-stock-0', 'group-stock-3'),
        3,
      );
      expect(JSON.stringify(placed)).toBe(saved);
      expect(end.poses.every(Number.isFinite)).toBe(true);
    } finally {
      sim.dispose();
    }
  });
  it('matches rotated editor origins without reapplying floor lift during free fall', () => {
    const geometry = new THREE.BoxGeometry(20, 10, 10).translate(0, 5, 0);
    registerGeometry('test-gravity', geometry);
    const library = new Map(loadFixtureLibrary());
    library.set('test-gravity', {
      ...library.get('girder-1x4')!,
      id: 'test-gravity',
      geometryId: 'test-gravity',
    });
    const input = prepareGravityInput(
      [
        {
          id: 'a',
          libraryId: 'test-gravity',
          position: { x: 30, y: 50, z: 40 },
          rotation: { x: 90, y: 0, z: 0 },
        },
      ],
      library,
      9.81,
    );
    const sim = new GravityWorld(input);
    try {
      expect(sim.frame().poses[1]).toBeCloseTo(input.pieces[0]!.originMm.y, 4);
      expect(sim.step(12).poses[1]).toBeLessThan(input.pieces[0]!.originMm.y);
    } finally {
      sim.dispose();
      geometry.dispose();
    }
  });
});
