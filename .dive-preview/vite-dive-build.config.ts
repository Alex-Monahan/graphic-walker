/**
 * Vite config for building the dive.tsx into a single deployable file.
 * Bundles everything EXCEPT react, react-dom, and @motherduck/react-sql-query
 * (which are provided by the Dive runtime).
 */
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Strips dynamic require() calls for Node.js built-in modules.
 * The Dive runtime does static analysis and rejects unavailable modules.
 */
function stripNodeBuiltins(): Plugin {
  const modules = ["util", "buffer", "stream", "path", "fs", "os", "crypto"];
  const pattern = new RegExp(
    `\\.require\\(["'](${modules.join("|")})["']\\)`,
    "g"
  );
  return {
    name: "strip-node-builtins",
    renderChunk(code) {
      if (!pattern.test(code)) return null;
      pattern.lastIndex = 0;
      return { code: code.replace(pattern, ".require(/*stripped*/)"), map: null };
    },
  };
}

/**
 * Injects a `process` shim at the very top of the bundle so that any
 * reference to `process.env.X` works without error. This is simpler and
 * more robust than Vite's `define` which can produce unexpected output
 * (empty objects, wrong scoping) in library mode.
 */
function injectProcessShim(): Plugin {
  return {
    name: "inject-process-shim",
    renderChunk(code) {
      const shim = [
        "// Process shim for Dive runtime (no Node.js globals)",
        'if(typeof process==="undefined"){globalThis.process={env:{NODE_ENV:"production"}};}',
        'if(!process.env){process.env={NODE_ENV:"production"};}',
        'if(!process.env.NODE_ENV){process.env.NODE_ENV="production";}',
        "",
      ].join("\n");
      return { code: shim + code, map: null };
    },
  };
}

export default defineConfig({
  plugins: [
    react({ jsxRuntime: "classic" }),
    stripNodeBuiltins(),
    injectProcessShim(),
  ],
  resolve: {
    alias: {
      "@motherduck/react-sql-query": path.resolve(__dirname, "src/md-sdk.tsx"),
      util: path.resolve(__dirname, "src/util-shim.ts"),
      "react-dom/server": path.resolve(__dirname, "src/react-dom-server-shim.ts"),
    },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/dive.tsx"),
      formats: ["es"],
      fileName: () => "dive-bundle.js",
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react-dom/client",
        "@motherduck/react-sql-query",
      ],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react-dom/client": "ReactDOMClient",
        },
        inlineDynamicImports: true,
      },
    },
    minify: false,
    commonjsOptions: { transformMixedEsModules: true },
    cssCodeSplit: false,
    outDir: "dist",
  },
});
