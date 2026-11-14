import { useState } from 'react';
import { PIECE_CATEGORIES, PIECE_COLOURS } from '../app/library';
import type { PieceCategory } from '../app/library';
import { isSupportedPieceFile } from '../three/loadPieceFile';

/**
 * Import Pieces — loads a .stl or .obj file into the library at its
 * original size (never rescaled). The user picks the category and
 * colour the imported piece belongs to; the file's name becomes the
 * piece name. Loading and registration happen in the App, which owns
 * the imported-piece state.
 */

interface ImportPiecesProps {
  disabled?: boolean;
  /** Called with the file and the user's category/colour choices. */
  onImport: (file: File, category: PieceCategory, colourHex: string) => void;
  /** True while an import is being loaded. */
  importing: boolean;
  /** Last import error to show, or null. */
  error: string | null;
}

export default function ImportPieces({ onImport, importing, error, disabled }: ImportPiecesProps) {
  const [category, setCategory] = useState<PieceCategory>('girders');
  const [colourHex, setColourHex] = useState<string>(PIECE_COLOURS[4]?.hex ?? '#808080');

  return (
    <div className="import-pieces">
      <label className="import-label" htmlFor="import-pieces-file">
        Import Pieces
      </label>
      <p className="panel-note">Add a .stl or .obj file. Its original size is kept.</p>
      <div className="import-row">
        <label className="import-field">
          Category
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value as PieceCategory);
            }}
          >
            {PIECE_CATEGORIES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="import-field">
          Colour
          <select
            value={colourHex}
            onChange={(event) => {
              setColourHex(event.target.value);
            }}
          >
            {PIECE_COLOURS.map((colour) => (
              <option key={colour.hex} value={colour.hex}>
                {colour.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="import-file-button">
        {importing ? 'Importing…' : 'Choose a .stl or .obj file'}
        <input
          id="import-pieces-file"
          className="import-file-input"
          type="file"
          accept=".stl,.obj"
          disabled={importing || disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file === undefined) {
              return;
            }
            if (!isSupportedPieceFile(file.name)) {
              return;
            }
            onImport(file, category, colourHex);
          }}
        />
      </label>
      {error !== null && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
