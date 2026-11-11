# Portable project backups

Choose **Menu → Export Backup** to download `<name>.basiscad.json`. Choose
**Open Backup** from Menu or the startup dialog to select a file, review its name
and item count, then open it. Cancel preserves the current design. Save or export
the current project before replacing it.

Backups preserve positions, rotations, screws and hole references, groups, locks,
hinge angles, and labels. Custom STL/OBJ pieces include normalized triangle
geometry, normals, category, name, and colour. Their printed size is preserved.
Bundled library pieces are referenced by their stable IDs. Cameras and undo
history are session state and start fresh. Imported backups get a new project ID
so saving them does not overwrite an existing local copy.

Version 1 is JSON with `format: "BASISCad"`, `version: 1`, `units: "mm"`, and a
`document`. Custom mesh attributes use little-endian float32 base64. The file
limit is 64 MB. Unsupported versions, malformed geometry, missing pieces,
duplicate IDs, and invalid screw references produce an error before replacement.

Custom geometry is also included in local saves and recovery copies. Browser
storage capacity varies; a storage error is shown if a project is too large.
An exported file provides an independent copy and can be moved between computers.
Keep your own copies; this app has no online account or backup service.
