import * as THREE from 'three';
import type { LibraryPiece } from '../app/library';
import type { ImportedPieceAsset } from '../app/projectAssets';
import { measureGeometry } from './loadPieceFile';
import { getGeometry } from './libraryGeometry';

function encode(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): string {
  const bytes = new Uint8Array(attribute.count * 12),
    view = new DataView(bytes.buffer);
  for (let i = 0; i < attribute.count; i++) {
    if (![attribute.getX(i), attribute.getY(i), attribute.getZ(i)].every(Number.isFinite))
      throw new Error('The imported mesh contains invalid coordinates.');
    view.setFloat32(i * 12, attribute.getX(i), true);
    view.setFloat32(i * 12 + 4, attribute.getY(i), true);
    view.setFloat32(i * 12 + 8, attribute.getZ(i), true);
  }
  let text = '';
  for (let start = 0; start < bytes.length; start += 8192)
    text += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(text);
}

function decode(text: string): Float32Array {
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text))
    throw new Error('The backup contains invalid mesh encoding.');
  const binary = atob(text);
  if (!binary.length || binary.length % 36 !== 0)
    throw new Error('The backup mesh must contain complete triangles.');
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const view = new DataView(bytes.buffer),
    values = new Float32Array(bytes.length / 4);
  for (let i = 0; i < values.length; i++) {
    const value = view.getFloat32(i * 4, true);
    if (!Number.isFinite(value)) throw new Error('The backup mesh contains invalid coordinates.');
    values[i] = value;
  }
  return values;
}

export function captureImportedAsset(piece: LibraryPiece): ImportedPieceAsset {
  const source = piece.geometryId ? getGeometry(piece.geometryId) : undefined;
  if (!source) throw new Error(`Missing geometry for ${piece.name}.`);
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
  try {
    return {
      id: piece.id,
      name: piece.name,
      category: piece.category,
      colourName: piece.colourName,
      colourHex: piece.colourHex,
      positions: encode(geometry.getAttribute('position')),
      normals: encode(geometry.getAttribute('normal')),
    };
  } finally {
    geometry.dispose();
  }
}

/** Stage every asset before registering any of them, so failures preserve the viewport. */
export function restoreImportedAssets(assets: readonly ImportedPieceAsset[]) {
  const staged: { piece: LibraryPiece; geometry: THREE.BufferGeometry }[] = [];
  try {
    for (const asset of assets) {
      const positions = decode(asset.positions),
        normals = decode(asset.normals);
      if (positions.length !== normals.length)
        throw new Error('Mesh normals do not match vertices.');
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      const sizeMm = measureGeometry(geometry);
      staged.push({
        geometry,
        piece: {
          id: asset.id,
          name: asset.name,
          category: asset.category,
          colourName: asset.colourName,
          colourHex: asset.colourHex,
          sizeMm,
          holeCount: null,
          source: 'import',
          geometryId: asset.id,
        },
      });
      if (
        !Number.isFinite(sizeMm.x + sizeMm.y + sizeMm.z) ||
        Math.max(sizeMm.x, sizeMm.y, sizeMm.z) <= 0
      )
        throw new Error('The backup mesh has no measurable size.');
    }
    return staged;
  } catch (error) {
    staged.forEach(({ geometry }) => geometry.dispose());
    throw error;
  }
}
