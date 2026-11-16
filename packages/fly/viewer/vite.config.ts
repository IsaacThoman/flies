import { defineConfig } from "vite";

// The fly model's own viewer: npm run fly:viewer.
export default defineConfig({
  root: import.meta.dirname,
  server: { port: 5287 },
});
