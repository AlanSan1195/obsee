import { rm } from 'fs/promises';

await Promise.all([
  rm('dist/main', { recursive: true, force: true }),
  rm('dist/shared', { recursive: true, force: true }),
]);
