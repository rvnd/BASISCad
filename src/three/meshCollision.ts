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

function tree(faces: readonly Face[]): Node {
  const box = new THREE.Box3();
  for (const face of faces) box.union(face.box);
  if (faces.length <= 12) return { box, faces };
  const size = box.getSize(new THREE.Vector3());
  const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  const sorted = [...faces].sort(
    (a, b) => a.box.min[axis] + a.box.max[axis] - b.box.min[axis] - b.box.max[axis],
  );
  const middle = Math.floor(sorted.length / 2);
  return { box, children: [tree(sorted.slice(0, middle)), tree(sorted.slice(middle))] };
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
  function visit(current: Node): void {
    if (!ray.intersectsBox(current.box)) return;
    for (const child of current.children ?? []) visit(child);
    for (const face of current.faces ?? []) {
      if (!ray.intersectsBox(face.box)) continue;
      if (ray.intersectTriangle(face.triangle.a, face.triangle.b, face.triangle.c, false, point)) {
        const distance = point.clone().sub(ray.origin).dot(ray.direction);
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
  for (const face of source.faces) {
    const vertices = [face.triangle.a, face.triangle.b, face.triangle.c].map((point) =>
      point.clone().applyMatrix4(matrix),
    );
    if (!new THREE.Box3().setFromPoints(vertices).intersectsBox(target.root.box)) continue;
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
  }
  return false;
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
