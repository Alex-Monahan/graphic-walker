/**
 * Vite config for building the dive.tsx into a single deployable file.
 * Bundles everything EXCEPT react and @motherduck/react-sql-query
 * (which are provided by the Dive runtime).
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@motherduck/react-sql-query": path.resolve(__dirname, "src/md-sdk.tsx"),
    },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/dive.tsx"),
      formats: ["es"],
      fileName: () => "dive-bundle.js",
    },
    rollupOptions: {
      external: ["react", "react/jsx-runtime", "@motherduck/react-sql-query"],
      output: {
        globals: {
          react: "React",
          "react/jsx-runtime": "jsxRuntime",
        },
        // Inline all dynamic imports into a single chunk
        inlineDynamicImports: true,
      },
    },
    minify: false, // Keep readable for debugging
    cssCodeSplit: false, // Inline CSS
    outDir: "dist",
  },
});
