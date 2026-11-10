import * as THREE from 'three';

/** Numerical tolerance in millimetres; touching surfaces are allowed. */
export const COLLISION_EPS_MM = 0.00001;

interface Face {
  triangle: THREE.Triangle;
  box: THREE.Box3;
}
interface Node {
  box: THREE.Box3;
  faces?: readonly Face[];
  children?: readonly Node[];
}
interface Solid {
  faces: readonly Face[];
  root: Node;
}
const solids = new WeakMap<THREE.BufferGeometry, Solid>();
const RAY_DIRECTION = new THREE.Vector3(1, 0.371390676, 0.694746591).normalize();

function tree(faces: readonly Face[], depth = 0): Node {
  const box = new THREE.Box3();
  for (const face of faces) box.union(face.box);
  if (faces.length <= 12 || depth >= 32) return { box, faces };
  // Binned surface-area splits keep broad top/bottom faces separate from
  // bore walls. Longest-axis median splits made ray queries visit both.
  let bestCost = Infinity;
  let bestAxis: 'x' | 'y' | 'z' = 'x';
  let bestCut = 0;
  const area = (bounds: THREE.Box3): number => {
    if (bounds.isEmpty()) return 0;
    const x = bounds.max.x - bounds.min.x,
      y = bounds.max.y - bounds.min.y,
      z = bounds.max.z - bounds.min.z;
    return x * y + x * z + y * z;
  };
  for (const axis of ['x', 'y', 'z'] as const) {
    let min = Infinity,
      max = -Infinity;
    for (const face of faces) {
      const centre = (face.box.min[axis] + face.box.max[axis]) / 2;
      min = Math.min(min, centre);
      max = Math.max(max, centre);
    }
    if (max - min < 1e-12) continue;
    const bins = Array.from({ length: 8 }, () => ({ box: new THREE.Box3(), count: 0 }));
    for (const face of faces) {
      const centre = (face.box.min[axis] + face.box.max[axis]) / 2;
      const bin = bins[Math.min(7, Math.floor(((centre - min) / (max - min)) * 8))]!;
      bin.box.union(face.box);
      bin.count++;
    }
    for (let cut = 1; cut < 8; cut++) {
      const left = new THREE.Box3(),
        right = new THREE.Box3();
      let leftCount = 0,
        rightCount = 0;
      bins.forEach((bin, i) => {
        if (i < cut) {
          left.union(bin.box);
          leftCount += bin.count;
        } else {
          right.union(bin.box);
          rightCount += bin.count;
        }
      });
      if (!leftCount || !rightCount) continue;
      const cost = area(left) * leftCount + area(right) * rightCount;
      if (cost < bestCost) {
        bestCost = cost;
        bestAxis = axis;
        bestCut = min + ((max - min) * cut) / 8;
      }
    }
  }
  if (!Number.isFinite(bestCost)) return { box, faces };
  const left: Face[] = [],
    right: Face[] = [];
  for (const face of faces) {
    ((face.box.min[bestAxis] + face.box.max[bestAxis]) / 2 < bestCut ? left : right).push(face);
  }
  if (!left.length || !right.length) return { box, faces };
  return { box, children: [tree(left, depth + 1), tree(right, depth + 1)] };
}

function solid(geometry: THREE.BufferGeometry): Solid {
  const cached = solids.get(geometry);
  if (cached) return cached;
  const positions = geometry.getAttribute('position');
  const indices = geometry.index;
  const count = indices?.count ?? positions.count;
  const faces: Face[] = [];
  for (let i = 0; i + 2 < count; i += 3) {
    const vertices = [0, 1, 2].map((offset) =>
      new THREE.Vector3().fromBufferAttribute(positions, indices?.getX(i + offset) ?? i + offset),
    );
    const triangle = new THREE.Triangle(vertices[0]!, vertices[1]!, vertices[2]!);
    if (triangle.getArea() > 1e-12)
      faces.push({ triangle, box: new THREE.Box3().setFromPoints(vertices) });
  }
  const result = { faces, root: tree(faces) };
  solids.set(geometry, result);
  return result;
}

function rayHits(node: Node, ray: THREE.Ray, limit = Infinity): number[] {
  const result: number[] = [];
  const point = new THREE.Vector3();
  const inverseX = 1 / ray.direction.x;
  const inverseY = 1 / ray.direction.y;
  const inverseZ = 1 / ray.direction.z;
  const origin = ray.origin;
  // Check slab intervals directly, without calculating unused hit coordinates.
  // Finite edge queries prune boxes beyond the segment's end.
  const intersectsBox = (box: THREE.Box3): boolean => {
    let near = ((inverseX >= 0 ? box.min.x : box.max.x) - origin.x) * inverseX;
    let far = ((inverseX >= 0 ? box.max.x : box.min.x) - origin.x) * inverseX;
    const nearY = ((inverseY >= 0 ? box.min.y : box.max.y) - origin.y) * inverseY;
    const farY = ((inverseY >= 0 ? box.max.y : box.min.y) - origin.y) * inverseY;
    if (near > farY || nearY > far) return false;
    // A parallel ray exactly on a box face produces 0 * Infinity.
    if (nearY > near || Number.isNaN(near)) near = nearY;
    if (farY < far || Number.isNaN(far)) far = farY;
    const nearZ = ((inverseZ >= 0 ? box.min.z : box.max.z) - origin.z) * inverseZ;
    const farZ = ((inverseZ >= 0 ? box.max.z : box.min.z) - origin.z) * inverseZ;
    if (near > farZ || nearZ > far) return false;
    if (nearZ > near || Number.isNaN(near)) near = nearZ;
    if (farZ < far || Number.isNaN(far)) far = farZ;
    return far >= 0 && near <= limit + COLLISION_EPS_MM;
  };
  function visit(current: Node): void {
    if (!intersectsBox(current.box)) return;
    for (const child of current.children ?? []) visit(child);
    for (const face of current.faces ?? []) {
      if (!intersectsBox(face.box)) continue;
      if (ray.intersectTriangle(face.triangle.a, face.triangle.b, face.triangle.c, false, point)) {
        const distance =
          (point.x - ray.origin.x) * ray.direction.x +
          (point.y - ray.origin.y) * ray.direction.y +
          (point.z - ray.origin.z) * ray.direction.z;
        if (distance <= limit + COLLISION_EPS_MM) result.push(distance);
      }
    }
  }
  visit(node);
  result.sort((a, b) => a - b);
  // A shared triangle edge is one crossing, not two.
  return result.filter((distance, i) => i === 0 || distance - result[i - 1]! > COLLISION_EPS_MM);
}

function inside(point: THREE.Vector3, other: Solid): boolean {
  if (!other.root.box.containsPoint(point)) return false;
  const hits = rayHits(other.root, new THREE.Ray(point, RAY_DIRECTION));
  if (hits[0] !== undefined && hits[0] <= COLLISION_EPS_MM) return false;
  return hits.length % 2 === 1;
}

/** Probe inside a face, including intervals where an edge crosses the other solid. */
function penetrates(source: Solid, matrix: THREE.Matrix4, target: Solid): boolean {
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const elements = matrix.elements;
  const targetBox = target.root.box;
  const boundsIntersect = (box: THREE.Box3): boolean => {
    const x = (box.min.x + box.max.x) / 2,
      y = (box.min.y + box.max.y) / 2,
      z = (box.min.z + box.max.z) / 2;
    const hx = (box.max.x - box.min.x) / 2,
      hy = (box.max.y - box.min.y) / 2,
      hz = (box.max.z - box.min.z) / 2;
    const cx = elements[0]! * x + elements[4]! * y + elements[8]! * z + elements[12]!;
    const cy = elements[1]! * x + elements[5]! * y + elements[9]! * z + elements[13]!;
    const cz = elements[2]! * x + elements[6]! * y + elements[10]! * z + elements[14]!;
    const ex =
      Math.abs(elements[0]!) * hx + Math.abs(elements[4]!) * hy + Math.abs(elements[8]!) * hz;
    const ey =
      Math.abs(elements[1]!) * hx + Math.abs(elements[5]!) * hy + Math.abs(elements[9]!) * hz;
    const ez =
      Math.abs(elements[2]!) * hx + Math.abs(elements[6]!) * hy + Math.abs(elements[10]!) * hz;
    return (
      cx + ex >= targetBox.min.x - COLLISION_EPS_MM &&
      cx - ex <= targetBox.max.x + COLLISION_EPS_MM &&
      cy + ey >= targetBox.min.y - COLLISION_EPS_MM &&
      cy - ey <= targetBox.max.y + COLLISION_EPS_MM &&
      cz + ez >= targetBox.min.z - COLLISION_EPS_MM &&
      cz - ez <= targetBox.max.z + COLLISION_EPS_MM
    );
  };
  const facePenetrates = (face: Face): boolean => {
    const vertices = [face.triangle.a, face.triangle.b, face.triangle.c].map((point) =>
      point.clone().applyMatrix4(matrix),
    );
    if (!new THREE.Box3().setFromPoints(vertices).intersectsBox(target.root.box)) return false;
    const centre = vertices[0]!
      .clone()
      .add(vertices[1]!)
      .add(vertices[2]!)
      .multiplyScalar(1 / 3);
    const inward = face.triangle
      .getNormal(new THREE.Vector3())
      .applyMatrix3(normalMatrix)
      .normalize()
      .multiplyScalar(-COLLISION_EPS_MM * 2);
    const probe = (point: THREE.Vector3): boolean =>
      inside(point.clone().lerp(centre, 0.00001).add(inward), target);
    if ([centre, ...vertices].some(probe)) return true;
    for (let i = 0; i < 3; i += 1) {
      const start = vertices[i]!;
      const end = vertices[(i + 1) % 3]!;
      const direction = end.clone().sub(start);
      const length = direction.length();
      if (length <= COLLISION_EPS_MM) continue;
      direction.divideScalar(length);
      const hits = rayHits(target.root, new THREE.Ray(start, direction), length);
      if (!hits.length) continue;
      const stops = [0, ...hits, length];
      for (let j = 1; j < stops.length; j += 1) {
        if (stops[j]! - stops[j - 1]! <= COLLISION_EPS_MM * 2) continue;
        if (probe(start.clone().addScaledVector(direction, (stops[j]! + stops[j - 1]!) / 2)))
          return true;
      }
    }
    return false;
  };
  const visit = (node: Node): boolean => {
    if (!boundsIntersect(node.box)) return false;
    for (const child of node.children ?? []) if (visit(child)) return true;
    for (const face of node.faces ?? []) if (facePenetrates(face)) return true;
    return false;
  };
  return visit(source.root);
}

/** Closed triangle meshes, including bores and concave braces. No bounding-box false positives. */
export function meshesOverlap(
  a: THREE.BufferGeometry,
  matrixA: THREE.Matrix4,
  b: THREE.BufferGeometry,
  matrixB: THREE.Matrix4,
): boolean {
  const solidA = solid(a);
  const solidB = solid(b);
  const boxA = solidA.root.box.clone().applyMatrix4(matrixA);
  const boxB = solidB.root.box.clone().applyMatrix4(matrixB);
  const intersection = boxA.intersect(boxB).getSize(new THREE.Vector3());
  if (Math.min(intersection.x, intersection.y, intersection.z) <= COLLISION_EPS_MM) return false;
  return (
    penetrates(solidA, matrixB.clone().invert().multiply(matrixA), solidB) ||
    penetrates(solidB, matrixA.clone().invert().multiply(matrixB), solidA)
  );
}
