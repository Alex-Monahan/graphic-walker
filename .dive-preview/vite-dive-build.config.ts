/**
 * Vite config for building the dive.tsx into a single deployable file.
 * Bundles everything EXCEPT react and @motherduck/react-sql-query
 * (which are provided by the Dive runtime).
 */
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Custom Rollup plugin that strips references to Node.js built-in modules
 * from the output bundle. The MotherDuck Dive runtime does static analysis
 * and rejects any code that references unavailable modules — even in dead
 * code paths like `obj && obj.require && obj.require("util")`.
 *
 * This runs at the `renderChunk` phase (after bundling, before writing),
 * so it catches dynamic requires that resolve.alias cannot intercept.
 */
function stripNodeBuiltins(): Plugin {
  // Modules to strip. Pattern matches require("mod") and require('mod').
  const modules = ["util", "buffer", "stream", "path", "fs", "os", "crypto"];
  const pattern = new RegExp(
    `\\.require\\(["'](${modules.join("|")})["']\\)`,
    "g"
  );

  return {
    name: "strip-node-builtins",
    renderChunk(code) {
      if (!pattern.test(code)) return null;
      // Reset lastIndex since we used .test()
      pattern.lastIndex = 0;
      return {
        code: code.replace(pattern, ".require(/*stripped*/)"),
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [
    react({
      // Use classic JSX transform (React.createElement) instead of
      // automatic (react/jsx-runtime) since the Dive runtime doesn't
      // provide react/jsx-runtime as a separate module.
      jsxRuntime: "classic",
    }),
    stripNodeBuiltins(),
  ],
  resolve: {
    alias: {
      "@motherduck/react-sql-query": path.resolve(__dirname, "src/md-sdk.tsx"),
      // Catch any static import/require("util") during module resolution.
      util: path.resolve(__dirname, "src/util-shim.ts"),
    },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/dive.tsx"),
      formats: ["es"],
      fileName: () => "dive-bundle.js",
    },
    rollupOptions: {
      external: ["react", "@motherduck/react-sql-query"],
      output: {
        globals: {
          react: "React",
        },
        inlineDynamicImports: true,
      },
    },
    minify: false,
    cssCodeSplit: false,
    outDir: "dist",
  },
});
