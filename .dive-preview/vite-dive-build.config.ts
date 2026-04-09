/**
 * Vite config for building the dive.tsx into a single deployable file.
 * Bundles everything EXCEPT react, react-dom, and @motherduck/react-sql-query
 * (which are provided by the Dive runtime).
 */
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Post-bundle text replacement plugin. The Dive runtime is a restricted
 * sandbox — no `process` global, no Node.js built-ins, no module
 * modification. This plugin rewrites the final output so:
 *
 * 1. `process.env.NODE_ENV` → `"production"`
 * 2. `process.env.SOMETHING` → `undefined` (via process.env → object literal)
 * 3. `typeof process` → `"undefined"` (so guarded checks short-circuit)
 * 4. `.require("util")` etc. → stripped (Node.js builtins)
 *
 * Using renderChunk (not `define`) avoids creating variables before imports
 * which would break ES module parsing in the Dive runtime.
 */
function patchForDiveRuntime(): Plugin {
  const nodeBuiltins = ["util", "buffer", "stream", "path", "fs", "os", "crypto"];
  const requirePattern = new RegExp(
    `\\.require\\(["'](${nodeBuiltins.join("|")})["']\\)`,
    "g"
  );

  return {
    name: "patch-for-dive-runtime",
    renderChunk(code) {
      let patched = code;

      // 1. Replace process.env.NODE_ENV with "production" (most specific first)
      patched = patched.replace(/process\.env\.NODE_ENV/g, '"production"');

      // 2. Replace process.env.JEST_WORKER_ID
      patched = patched.replace(/process\.env\.JEST_WORKER_ID/g, "undefined");

      // 3. Replace remaining process.env.X patterns with undefined
      //    Match process.env.IDENTIFIER but not the ones already replaced
      patched = patched.replace(/process\.env\.([A-Z_][A-Z_0-9]*)/g, "undefined");

      // 4. Replace bare `process.env` (without property access) with safe object
      //    This handles code like: `var x = process.env`
      patched = patched.replace(/process\.env(?![.\w])/g, '({})');

      // 5. Replace `typeof process` with `"undefined"` so guarded checks
      //    like `typeof process !== "undefined" && process.env` short-circuit.
      //    Must come AFTER process.env replacements above.
      patched = patched.replace(/typeof process(?!\.\w)/g, '"undefined"');

      // 6. Strip Node.js built-in dynamic requires
      if (requirePattern.test(patched)) {
        requirePattern.lastIndex = 0;
        patched = patched.replace(requirePattern, ".require(/*stripped*/)");
      }

      // 7. Patch removed React 19 APIs. findDOMNode was removed in React 19.
      //    Remove it from the import and add a shim variable.
      if (patched.includes("findDOMNode")) {
        // Remove findDOMNode from react-dom import (handles ", findDOMNode" or "findDOMNode, ")
        patched = patched.replace(/, findDOMNode/g, "");
        patched = patched.replace(/findDOMNode, /g, "");
        // Add shim right after the last import line
        const lastImportIdx = patched.lastIndexOf("\nimport ");
        if (lastImportIdx !== -1) {
          const endOfLine = patched.indexOf("\n", lastImportIdx + 1);
          patched = patched.slice(0, endOfLine + 1) +
            "var findDOMNode = function(c) { return c && c.nodeType ? c : null; };\n" +
            patched.slice(endOfLine + 1);
        }
      }

      if (code === patched) return null;
      return { code: patched, map: null };
    },
  };
}

export default defineConfig({
  plugins: [
    react({ jsxRuntime: "classic" }),
    patchForDiveRuntime(),
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
