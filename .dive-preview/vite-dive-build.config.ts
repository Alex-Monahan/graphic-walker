/**
 * Vite config for building the dive.tsx into a single deployable file.
 * Bundles everything EXCEPT react, react-dom, and @motherduck/react-sql-query
 * (which are provided by the Dive runtime).
 */
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync, writeFileSync } from "fs";

/**
 * Post-write plugin that patches the output file on disk.
 * This is the most reliable approach because it runs after ALL Rollup
 * processing (including external import generation) is complete.
 */
function patchForDiveRuntime(): Plugin {
  const nodeBuiltins = ["util", "buffer", "stream", "path", "fs", "os", "crypto"];
  const requirePattern = new RegExp(
    `\\.require\\(["'](${nodeBuiltins.join("|")})["']\\)`,
    "g"
  );

  return {
    name: "patch-for-dive-runtime",
    closeBundle() {
      const filePath = path.resolve(__dirname, "dist/dive-bundle.js");
      let code: string;
      try {
        code = readFileSync(filePath, "utf-8");
      } catch {
        console.error("[patch] Could not read", filePath);
        return;
      }
      let patched = code;

      // 1. process.env.NODE_ENV → "production"
      patched = patched.replace(/process\.env\.NODE_ENV/g, '"production"');

      // 2. process.env.JEST_WORKER_ID → undefined
      patched = patched.replace(/process\.env\.JEST_WORKER_ID/g, "undefined");

      // 3. Remaining process.env.IDENTIFIER → undefined
      patched = patched.replace(/process\.env\.([A-Z_][A-Z_0-9]*)/g, "undefined");

      // 4. Bare process.env → safe empty object
      patched = patched.replace(/process\.env(?![.\w])/g, "({})");

      // 5. typeof process → "undefined" (must come AFTER process.env replacements)
      patched = patched.replace(/typeof process(?!\.\w)/g, '"undefined"');

      // 6. Strip Node.js built-in dynamic requires
      requirePattern.lastIndex = 0;
      patched = patched.replace(requirePattern, ".require(/*stripped*/)");

      // 7. Remove import "react-dom/client" (bare side-effect, not available in Dive)
      patched = patched.replace(/import\s*"react-dom\/client"\s*;\n?/g, "");

      // 8. Remove unstable_batchedUpdates from react-dom import
      patched = patched.replace(/, unstable_batchedUpdates/g, "");
      patched = patched.replace(/unstable_batchedUpdates, /g, "");

      // 9. Remove findDOMNode from react-dom import
      patched = patched.replace(/, findDOMNode/g, "");
      patched = patched.replace(/findDOMNode, /g, "");

      // 10. Inject shims after the last import statement
      const lastImportIdx = patched.lastIndexOf("\nimport ");
      if (lastImportIdx !== -1) {
        const endOfLine = patched.indexOf("\n", lastImportIdx + 1);
        const shims = [
          "var findDOMNode = function(c) { return c && c.nodeType ? c : null; };",
          "var unstable_batchedUpdates = function(fn) { fn(); };",
        ].join("\n");
        patched =
          patched.slice(0, endOfLine + 1) +
          shims +
          "\n" +
          patched.slice(endOfLine + 1);
      }

      writeFileSync(filePath, patched);
      const delta = code.length - patched.length;
      console.log(`[patch] Patched ${filePath} (${delta > 0 ? "-" : "+"}${Math.abs(delta)} bytes)`);
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
      "react-dom/client": path.resolve(__dirname, "src/react-dom-client-shim.ts"),
    },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/dive.tsx"),
      formats: ["es"],
      fileName: () => "dive-bundle.js",
    },
    rollupOptions: {
      external: (id) => {
        if (id === "react" || id === "react-dom") return true;
        if (id === "@motherduck/react-sql-query") return true;
        return false;
      },
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
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
