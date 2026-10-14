// Dev-server config for the workshop harness only (npx vite --config src/workshop/harness.vite.config.js).
// Serves the project root on port 5180 without hot reload, so edits other people make to the 3D engine files
// do not reload the harness page in the middle of a test. Not used by the main build.
import { fileURLToPath } from 'node:url';

export default {
  root: fileURLToPath(new URL('../..', import.meta.url)),
  server: { port: 5180, strictPort: true, hmr: false }
};
