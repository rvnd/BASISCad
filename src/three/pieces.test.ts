import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createPieceMesh, disposePieceMesh } from './pieces';

function outline(group: THREE.Group): THREE.BufferGeometry {
  return (group.getObjectByName('piece-outline') as THREE.LineSegments).geometry;
}

describe('shared piece outlines', () => {
  it('keeps surviving instances intact and disposes edges exactly once after the last owner', () => {
    const source = new THREE.BoxGeometry(10, 3, 20);
    const a = createPieceMesh(source, '#ffffff'),
      b = createPieceMesh(source, '#ff0000');
    const edges = outline(a);
    expect(outline(b)).toBe(edges);
    let disposed = 0,
      sourceDisposed = 0;
    edges.addEventListener('dispose', () => disposed++);
    source.addEventListener('dispose', () => sourceDisposed++);
    disposePieceMesh(a);
    disposePieceMesh(a);
    expect(disposed).toBe(0);
    expect(outline(b).getAttribute('position').count).toBeGreaterThan(0);
    disposePieceMesh(b);
    expect(disposed).toBe(1);
    expect(sourceDisposed).toBe(0);
    const c = createPieceMesh(source, '#000000');
    expect(outline(c)).not.toBe(edges);
    disposePieceMesh(c);
    source.dispose();
  });

  it('invalidates changed geometry while preserving each live outline lease', () => {
    const source = new THREE.BoxGeometry(10, 3, 20),
      a = createPieceMesh(source, '#ffffff');
    const original = outline(a);
    source.translate(20, 0, 0);
    const b = createPieceMesh(source, '#ffffff');
    expect(outline(b)).not.toBe(original);
    original.computeBoundingBox();
    outline(b).computeBoundingBox();
    expect(outline(b).boundingBox!.min.x - original.boundingBox!.min.x).toBe(20);
    disposePieceMesh(a);
    const c = createPieceMesh(source, '#ffffff');
    expect(outline(c)).toBe(outline(b));
    disposePieceMesh(b);
    disposePieceMesh(c);
    source.dispose();
  });
});
