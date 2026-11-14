import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { GravityFrame, GravityInput, GravitySummary, GravityVector } from '../app/gravity';
import { GRAVITY_STEP_SECONDS } from '../app/gravity';
import { WORKPLANE_HALF_MM } from '../app/constants';
import { gravityCollisionModel } from './gravityColliders';
import { supportedByFloor } from './gravitySupport';

let initialization: Promise<void> | undefined;
export function initializeGravity(): Promise<void> {
  return (initialization ??= RAPIER.init());
}
const vector = (v: GravityVector, scale = 1) =>
  new THREE.Vector3(v.x * scale, v.y * scale, v.z * scale);
const quaternion = (v: { x: number; y: number; z: number; w: number }) =>
  new THREE.Quaternion(v.x, v.y, v.z, v.w);

export function gravityComponents(input: GravityInput): Map<string, string> {
  const roots = new Map(input.pieces.filter((p) => !p.fastenerFor).map((p) => [p.id, p.id]));
  const root = (id: string): string => {
    const parent = roots.get(id);
    if (!parent) throw new Error('A screw refers to a missing piece.');
    return parent === id ? id : root(parent);
  };
  let changed = true;
  while (changed) {
    changed = false;
    const anchors = new Map<string, GravityVector[]>();
    for (const connection of input.connections) {
      for (let a = 0; a < connection.pieces.length; a++)
        for (let b = a + 1; b < connection.pieces.length; b++) {
          const first = root(connection.pieces[a]!),
            second = root(connection.pieces[b]!);
          if (first === second) continue;
          const key = [first, second].sort().join('\0');
          const points = anchors.get(key) ?? [];
          if (points.some((p) => vector(p).distanceTo(vector(connection.pivotMm)) > 0.1)) {
            roots.set(root(second), root(first));
            changed = true;
          }
          points.push(connection.pivotMm);
          anchors.set(key, points);
        }
    }
  }
  for (const id of roots.keys()) roots.set(id, root(id));
  for (const p of input.pieces) if (p.fastenerFor) roots.set(p.id, root(p.fastenerFor[0]!));
  return roots;
}

export class GravityWorld {
  readonly world: RAPIER.World;
  readonly summary: GravitySummary;
  private readonly parts: {
    body: RAPIER.RigidBody;
    offset: THREE.Vector3;
    rotation: THREE.Quaternion;
  }[];
  private readonly bodies = new Map<string, RAPIER.RigidBody>();
  private readonly initiallySupported = new Set<number>();
  private readonly radii = new Map<number, number>();
  private readonly groundContacts = new Map<
    number,
    { body: RAPIER.RigidBody; precise: RAPIER.Collider[]; support: RAPIER.Collider; mask: number }
  >();
  private seconds = 0;
  private readonly contacts = new Map<number, { id: string; attached?: readonly string[] }>();
  private readonly hooks: RAPIER.PhysicsHooks;

  constructor(input: GravityInput) {
    if (!Number.isFinite(input.acceleration) || input.acceleration < 0 || input.acceleration > 20)
      throw new Error('Gravity must be between 0 and 20 m/s².');
    const models = new Map(input.shapes.map((shape) => [shape.id, gravityCollisionModel(shape)]));
    const components = gravityComponents(input);
    this.world = new RAPIER.World({ x: 0, y: -input.acceleration, z: 0 });
    this.world.timestep = GRAVITY_STEP_SECONDS;
    const parameters = this.world.integrationParameters;
    parameters.allowedLinearError = 0.00002;
    parameters.predictionDistance = 0.0004;
    parameters.numSolverIterations = 4;
    parameters.maxCcdSubsteps = 2;
    let hinges = 0,
      colliders = 0,
      massGrams = 0;
    try {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(WORKPLANE_HALF_MM / 1000, 0.01, WORKPLANE_HALF_MM / 1000)
          .setTranslation(0, -0.01, 0)
          .setCollisionGroups((4 << 16) | 3)
          .setFriction(0.6)
          .setRestitution(0),
      );
      // A visible recovery floor catches parts falling off the workplane, one metre below it.
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(3, 0.01, 3)
          .setTranslation(0, -1.01, 0)
          .setCollisionGroups((8 << 16) | 3)
          .setFriction(0.6)
          .setRestitution(0),
      );
      const origins = new Map<string, THREE.Vector3>();
      for (const piece of input.pieces) {
        const id = components.get(piece.id)!;
        if (!origins.has(id)) origins.set(id, vector(piece.originMm, 0.001));
      }
      for (const [id, origin] of origins)
        this.bodies.set(
          id,
          this.world.createRigidBody(
            RAPIER.RigidBodyDesc.dynamic()
              .setTranslation(origin.x, origin.y, origin.z)
              .setAngularDamping(0.1),
          ),
        );
      const supportPoints = new Map<number, number[]>();
      const preciseColliders = new Map<number, RAPIER.Collider[]>();
      this.parts = input.pieces.map((piece) => {
        const id = components.get(piece.id)!,
          body = this.bodies.get(id)!;
        const offset = vector(piece.originMm, 0.001).sub(origins.get(id)!);
        const rotation = quaternion(piece.rotation);
        const vertices = input.shapes.find((shape) => shape.id === piece.shapeId)!.positionsMm;
        const points = supportPoints.get(body.handle) ?? [];
        for (let i = 0; i < vertices.length; i += 3) {
          const p = new THREE.Vector3()
            .fromArray(vertices, i)
            .multiplyScalar(0.001)
            .applyQuaternion(rotation)
            .add(offset);
          points.push(p.x, p.y, p.z);
          this.radii.set(body.handle, Math.max(this.radii.get(body.handle) ?? 0, p.length()));
        }
        supportPoints.set(body.handle, points);
        const model = models.get(piece.shapeId);
        if (!model) throw new Error('Missing gravity collision shape.');
        massGrams += model.massGrams;
        for (const box of model.boxes) {
          const center = vector(box.centerMm, 0.001).applyQuaternion(rotation).add(offset);
          const radius = center.length() + vector(box.halfMm, 0.001).length();
          this.radii.set(body.handle, Math.max(this.radii.get(body.handle) ?? 0, radius));
          const desc = RAPIER.ColliderDesc.cuboid(
            box.halfMm.x / 1000,
            box.halfMm.y / 1000,
            box.halfMm.z / 1000,
          )
            .setTranslation(center.x, center.y, center.z)
            .setRotation(rotation)
            .setDensity(box.density)
            .setFriction(0.6)
            .setRestitution(0);
          if (piece.fastenerFor) desc.setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
          const collider = this.world.createCollider(desc, body);
          const precise = preciseColliders.get(body.handle) ?? [];
          precise.push(collider);
          preciseColliders.set(body.handle, precise);
          this.contacts.set(collider.handle, { id: piece.id, attached: piece.fastenerFor });
          colliders++;
        }
        return { body, offset, rotation };
      });
      for (const body of this.bodies.values()) {
        // A flat plane touches the same extremal vertices of a solid and its hull.
        // Use a floor-only hull inside the floor boundary, retaining detailed contacts
        // near edges and for every piece-to-piece collision (including CCD).
        const hull = RAPIER.ColliderDesc.convexHull(
          new Float32Array(supportPoints.get(body.handle)!),
        );
        if (!hull) throw new Error('Could not build the gravity support shape.');
        const support = this.world.createCollider(
          hull.setDensity(0).setFriction(0.6).setRestitution(0),
          body,
        );
        this.groundContacts.set(body.handle, {
          body,
          precise: preciseColliders.get(body.handle)!,
          support,
          mask: -1,
        });
        colliders++;
      }
      const seen = new Set<string>();
      const hingedBodies = new Set<number>();
      for (const connection of input.connections) {
        const first = components.get(connection.pieces[0]!)!,
          a = this.bodies.get(first)!;
        for (const pieceId of connection.pieces.slice(1)) {
          const second = components.get(pieceId)!;
          if (first === second) continue;
          const key = [first, second].sort().join('\0');
          if (seen.has(key)) continue;
          seen.add(key);
          const b = this.bodies.get(second)!;
          const pivot = vector(connection.pivotMm, 0.001);
          const joint = this.world.createImpulseJoint(
            RAPIER.JointData.revolute(
              pivot.clone().sub(origins.get(first)!),
              pivot.clone().sub(origins.get(second)!),
              vector(connection.axis).normalize(),
            ),
            a,
            b,
            true,
          );
          (joint as RAPIER.RevoluteImpulseJoint).configureMotorVelocity(0, 0.00001);
          hingedBodies.add(a.handle);
          hingedBodies.add(b.handle);
          hinges++;
        }
      }
      for (const body of this.bodies.values()) {
        body.recomputeMassPropertiesFromColliders();
        if (
          !hingedBodies.has(body.handle) &&
          supportedByFloor(supportPoints.get(body.handle)!, body.translation(), body.worldCom())
        ) {
          this.initiallySupported.add(body.handle);
          body.sleep();
        }
      }
    } catch (error) {
      this.world.free();
      throw error;
    }
    this.summary = { bodies: this.bodies.size, hinges, colliders, massGrams };
    this.hooks = {
      filterContactPair: (a, b) => {
        const first = this.contacts.get(a),
          second = this.contacts.get(b);
        return first &&
          second &&
          (first.attached?.includes(second.id) || second.attached?.includes(first.id))
          ? null
          : RAPIER.SolverFlags.COMPUTE_IMPULSE;
      },
      filterIntersectionPair: () => true,
    };
  }
  step(count = 1): GravityFrame {
    for (let i = 0; i < count; i++) {
      for (const body of this.bodies.values()) {
        const v = body.linvel(),
          w = body.angvel();
        const predictedSpeed =
          Math.hypot(v.x, v.y, v.z) +
          Math.hypot(w.x, w.y, w.z) * (this.radii.get(body.handle) ?? 0);
        body.enableCcd(predictedSpeed * GRAVITY_STEP_SECONDS > 0.001);
        const ground = this.groundContacts.get(body.handle)!;
        const p = body.translation();
        const radius =
          (this.radii.get(body.handle) ?? 0) + predictedSpeed * GRAVITY_STEP_SECONDS + 0.002;
        const inside = (width: number) =>
          Math.abs(p.x) + radius < width && Math.abs(p.z) + radius < width;
        const mask = (inside(0.5) ? 4 : 0) | (inside(3) ? 8 : 0);
        if (mask !== ground.mask) {
          ground.mask = mask;
          ground.support.setCollisionGroups((2 << 16) | mask);
          ground.precise.forEach((c) => c.setCollisionGroups((1 << 16) | 1 | (12 & ~mask)));
        }
      }
      this.world.step(undefined, this.hooks);
      this.seconds += GRAVITY_STEP_SECONDS;
    }
    return this.frame();
  }
  setGravity(acceleration: number): void {
    if (!Number.isFinite(acceleration) || acceleration < 0 || acceleration > 20)
      throw new Error('Gravity must be between 0 and 20 m/s².');
    this.world.gravity.y = -acceleration;
    this.bodies.forEach((body) => {
      if (!body.isSleeping() || !this.initiallySupported.has(body.handle)) body.wakeUp();
    });
  }
  frame(): GravityFrame {
    const poses = new Float32Array(this.parts.length * 7);
    this.parts.forEach((part, i) => {
      const q = quaternion(part.body.rotation());
      const origin = part.offset
        .clone()
        .applyQuaternion(q)
        .add(vector(part.body.translation()))
        .multiplyScalar(1000);
      const rotation = q.multiply(part.rotation);
      poses.set(
        [origin.x, origin.y, origin.z, rotation.x, rotation.y, rotation.z, rotation.w],
        i * 7,
      );
    });
    if (!poses.every(Number.isFinite))
      throw new Error('Gravity produced an invalid pose. Reset restores your starting design.');
    return {
      poses,
      seconds: this.seconds,
      awake: [...this.bodies.values()].filter((b) => !b.isSleeping()).length,
    };
  }
  dispose(): void {
    this.world.free();
  }
}
