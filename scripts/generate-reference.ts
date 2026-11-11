import { mkdirSync, writeFileSync } from 'node:fs';
import { classroomDesign, loadFixtureLibrary } from './designFixtures';
import { serializeBackup } from '../src/app/projectBackup';
import { canPlace, geometryLookup } from '../src/three/designConstraints';
import { printBudget } from '../src/app/printBudget';

const library = loadFixtureLibrary();
const placed = classroomDesign(library);
if (!placed.every((piece) => canPlace(piece, placed, geometryLookup(library))))
  throw new Error('The classroom reference contains an invalid placement.');
mkdirSync('public/examples', { recursive: true });
writeFileSync(
  'public/examples/classroom.basiscad.json',
  serializeBackup({
    id: 'classroom-reference',
    name: 'Classroom Reference',
    updatedAt: 0,
    labelMode: 'off',
    placed,
  }) + '\n',
);
console.log('Generated public/examples/classroom.basiscad.json', printBudget(placed, library));
