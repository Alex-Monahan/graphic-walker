/**
 * Vite config for building the dive.tsx into a single deployable file.
 *
 * The MotherDuck Dive runtime provides EXACTLY these modules:
 *   react, React, react-dom, react-dom/client, d3, lucide-react,
 *   recharts, @motherduck/react-sql-query
 *
 * EVERYTHING else must be inlined. The runtime does full-text scanning
 * and rejects any import/require referencing unavailable modules.
 */
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync, writeFileSync, rmSync } from "fs";

// Modules the Dive runtime provides — these are the ONLY allowed externals.
const DIVE_RUNTIME_MODULES = new Set([
  "react",
  "react-dom",
  "react-dom/client",
  "d3",
  "lucide-react",
  "recharts",
  "@motherduck/react-sql-query",
]);

/**
 * Post-write plugin that patches the output file on disk.
 * This runs AFTER Rollup finishes all processing.
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

      // ── Process/env replacements ──
      patched = patched.replace(/process\.env\.NODE_ENV/g, '"production"');
      patched = patched.replace(/process\.env\.JEST_WORKER_ID/g, "undefined");
      patched = patched.replace(/process\.env\.([A-Z_][A-Z_0-9]*)/g, "undefined");
      patched = patched.replace(/process\.env(?![.\w])/g, "({})");
      patched = patched.replace(/typeof process(?!\.\w)/g, '"undefined"');

      // ── Node.js built-in requires ──
      requirePattern.lastIndex = 0;
      patched = patched.replace(requirePattern, ".require(/*stripped*/)");

      // ── React 19 compat: remove deprecated exports from react-dom import ──
      patched = patched.replace(/, unstable_batchedUpdates/g, "");
      patched = patched.replace(/unstable_batchedUpdates, /g, "");
      patched = patched.replace(/, findDOMNode/g, "");
      patched = patched.replace(/findDOMNode, /g, "");

      // ── Inject shims after the last import statement ──
      const lastImportIdx = patched.lastIndexOf("\nimport ");
      if (lastImportIdx !== -1) {
        const endOfLine = patched.indexOf("\n", lastImportIdx + 1);
        const shims = [
          "var findDOMNode = function(c) { return c && c.nodeType ? c : null; };",
          "var unstable_batchedUpdates = function(fn) { fn(); };",
        ].join("\n");
        patched = patched.slice(0, endOfLine + 1) + shims + "\n" + patched.slice(endOfLine + 1);
      }

      // ── Strip Leaflet external CSS injection (blocked by sandbox CSP) ──
      patched = patched.replace(
        /v__default\.createElement\("link"[^)]*leaflet[^)]*\)/g,
        "null"
      );

      // ── Strip dead-code strings that contain module-like references ──
      // styled-components has React Native warnings with module-like strings
      patched = patched.replace(/imported 'styled-components'/g, "imported styled-components");
      patched = patched.replace(/import 'styled-components\/native'/g, "use styled-components/native");
      patched = patched.replace(/import 'styled-components'/g, "use styled-components");
      // MobX has debug messages mentioning "from 'mobx'"
      patched = patched.replace(/from 'mobx'/g, "from mobx");

      // ── Final validation: scan for any module references the runtime would reject ──
      const importPattern = /(?:from\s+["']|import\s+["']|require\s*\(\s*["'])([^"']+)["']/g;
      let match;
      const problems: string[] = [];
      while ((match = importPattern.exec(patched)) !== null) {
        const mod = match[1];
        if (!DIVE_RUNTIME_MODULES.has(mod) && !mod.startsWith("./") && !mod.startsWith("../") && !mod.startsWith("/")) {
          problems.push(`  Line ~${patched.substring(0, match.index).split("\n").length}: ${match[0]}`);
        }
      }
      if (problems.length > 0) {
        console.error(`[patch] WARNING: Found ${problems.length} references to unavailable modules:`);
        problems.forEach((p) => console.error(p));
      } else {
        console.log("[patch] All module references are valid.");
      }

      writeFileSync(filePath, patched);
      console.log(`[patch] Patched (${code.length} → ${patched.length} bytes)`);
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
      // Leaflet tries to inject external CSS which violates the sandbox CSP.
      // Map features aren't needed in a Dive.
      "leaflet": path.resolve(__dirname, "src/leaflet-shim.ts"),
      "react-leaflet": path.resolve(__dirname, "src/react-leaflet-shim.ts"),
    },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/dive.tsx"),
      formats: ["es"],
      fileName: () => "dive-bundle.js",
    },
    rollupOptions: {
      external: (id) => DIVE_RUNTIME_MODULES.has(id),
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
