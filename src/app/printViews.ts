export type PrintView = 'top' | 'front' | 'side' | '3d';
export const PRINT_VIEWS: readonly { id: PrintView; name: string }[] = [
  { id: 'top', name: 'Top' },
  { id: 'front', name: 'Front' },
  { id: 'side', name: 'Side' },
  { id: '3d', name: '3D' },
];
