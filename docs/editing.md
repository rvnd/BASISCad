# Editing a design

Select pieces on the workplane or in **Design pieces**. Use Tab and Enter/Space
to activate a list button. Shift-click adds or removes a piece; selecting a
group member selects its group. The list shows the selection, groups and locks.

Tab to the **3D workplane**, then use:

| Key                | Move mode        | Rotate mode      |
| ------------------ | ---------------- | ---------------- |
| Left / Right       | X −/+ 1 mm       | Y −/+ 22.5°      |
| Up / Down          | Z −/+ 1 mm       | X +/− 22.5°      |
| Shift + arrow      | Move 10 mm       | Rotate 22.5°     |
| Delete / Backspace | Remove selection | Remove selection |
| Escape             | Clear selection  | Clear selection  |

Each arrow press is undoable. Connected members move together, and collision
and lock constraints still apply. Keyboard editing requires workplane focus;
typing and browser shortcuts in other controls keep their ordinary behavior.

Numeric fields commit with Enter or when leaving the field. Escape cancels;
invalid text restores the current value. Coordinates display up to six decimal
places. Focusing and leaving a field preserves the exact stored value, including
older arbitrary angles. Typed angles round to 22.5°; step controls rotate by
22.5° relative to the current orientation.
