import { useState, useMemo, useRef, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { useSQLQuery } from "@motherduck/react-sql-query";
import { GraphicWalker } from "@kanaries/graphic-walker";
import type { IMutField, IRow } from "@kanaries/graphic-walker";
import { Loader2 } from "lucide-react";
import "@kanaries/graphic-walker/dist/style.css";

const N = (v: unknown): number => (v != null ? Number(v) : 0);

// BigInt JSON safety — wrapped in try/catch for sandboxed environments
// that may block built-in prototype modification.
try { (BigInt.prototype as any).toJSON = function () { return Number(this); }; } catch {}

// ── Debug log panel ───────────────────────────────────────────────
const debugLines: string[] = [];
function dlog(msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  debugLines.push(`${ts} ${msg}`);
  if (debugLines.length > 500) debugLines.shift();
}

// Capture ALL uncaught errors — including async, event handlers, and
// errors inside ShadowDom that React ErrorBoundary can't reach.
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    dlog(`[UNCAUGHT] ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`);
    if (e.error?.stack) dlog(`[STACK] ${e.error.stack}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const msg = e.reason?.message || e.reason?.toString?.() || String(e.reason);
    dlog(`[UNHANDLED PROMISE] ${msg}`);
    if (e.reason?.stack) dlog(`[STACK] ${e.reason.stack}`);
  });
}

function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [, forceRender] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = debugLines.join("\n");
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      // Fallback for contexts without clipboard API
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 99999, fontFamily: "monospace", fontSize: 11 }}>
      <div style={{ display: "flex", gap: 4 }}>
        <button
          onClick={() => { setOpen(!open); forceRender((n) => n + 1); }}
          style={{ background: "#231f20", color: "#fff", border: "none", padding: "4px 12px", cursor: "pointer" }}
        >
          {open ? "▼ Hide debug" : "▲ Show debug"} ({debugLines.length} lines)
        </button>
        {open && (
          <button
            onClick={handleCopy}
            style={{ background: "#0777b3", color: "#fff", border: "none", padding: "4px 12px", cursor: "pointer" }}
          >
            {copied ? "Copied!" : "Copy logs"}
          </button>
        )}
      </div>
      {open && (
        <div style={{ background: "#111", color: "#0f0", padding: 8, maxHeight: 300, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {debugLines.join("\n") || "(no logs yet)"}
        </div>
      )}
    </div>
  );
}

// ── Error boundary ────────────────────────────────────────────────
class ErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { error: Error | null; info: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null, info: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    const stack = info.componentStack || "";
    dlog(`ERROR in ${this.props.label}: ${error.message}`);
    dlog(error.stack || "");
    this.setState({ info: stack });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "#bc1200", fontFamily: "monospace", fontSize: 13 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Error in {this.props.label}</h2>
          <p style={{ fontWeight: "bold" }}>{this.state.error.message}</p>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 8, fontSize: 11, color: "#666" }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Type helpers ──────────────────────────────────────────────────
function classifyColumn(colName: string, colType: string): {
  semanticType: IMutField["semanticType"];
  analyticType: IMutField["analyticType"];
} {
  const t = colType.toUpperCase();
  if (
    t.includes("INT") || t.includes("FLOAT") || t.includes("DOUBLE") ||
    t.includes("DECIMAL") || t.includes("NUMERIC") || t.includes("REAL")
  ) {
    return { semanticType: "quantitative", analyticType: "measure" };
  }
  if (t.includes("DATE") || t.includes("TIME") || t.includes("TIMESTAMP")) {
    return { semanticType: "temporal", analyticType: "dimension" };
  }
  if (t === "BOOLEAN" || t === "BOOL") {
    return { semanticType: "nominal", analyticType: "dimension" };
  }
  return { semanticType: "nominal", analyticType: "dimension" };
}

/** Deep-convert every value in a row to a JSON-safe primitive */
function safeValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v;
  // DuckDB special types (Decimal, Date, Timestamp, Interval, List, Struct, etc.)
  if (typeof v === "object") {
    try {
      const n = Number(v);
      if (!isNaN(n)) return n;
    } catch {}
    try {
      return String(v);
    } catch {}
  }
  return String(v);
}

function normalizeRows(rows: readonly Record<string, unknown>[]): IRow[] {
  return rows.map((row) => {
    const out: IRow = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = safeValue(v);
    }
    return out;
  });
}

// ── Database / table picker ───────────────────────────────────────
function DatabaseTablePicker({
  onSelect,
}: {
  onSelect: (db: string, schema: string, table: string) => void;
}) {
  const [selectedDb, setSelectedDb] = useState<string>("");
  const [selectedTable, setSelectedTable] = useState<string>("");

  const databases = useSQLQuery(`
    SELECT DISTINCT catalog_name
    FROM information_schema.schemata
    WHERE catalog_name NOT IN ('system', 'temp', 'md_information_schema')
    ORDER BY catalog_name
  `);

  const tables = useSQLQuery(
    `SELECT table_schema, table_name
     FROM information_schema.tables
     WHERE table_catalog = '${selectedDb}'
     ORDER BY table_schema, table_name`,
    { enabled: !!selectedDb }
  );

  const dbRows = Array.isArray(databases.data) ? databases.data : [];
  const tableRows = Array.isArray(tables.data) ? tables.data : [];

  return (
    <div className="p-6" style={{ background: "#f8f8f8", minHeight: "100vh" }}>
      <h1 className="text-2xl font-semibold mb-1" style={{ color: "#231f20" }}>
        Graphic Walker on MotherDuck
      </h1>
      <p className="text-sm mb-6" style={{ color: "#6a6a6a" }}>
        Select a database and table to explore
      </p>

      <div className="flex gap-4 mb-6 items-end flex-wrap">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "#231f20" }}>Database</label>
          {databases.isLoading ? (
            <div className="flex items-center gap-1 text-sm" style={{ color: "#6a6a6a" }}>
              <Loader2 className="animate-spin" size={14} /> Loading…
            </div>
          ) : (
            <select data-testid="db-select" value={selectedDb}
              onChange={(e) => { setSelectedDb(e.target.value); setSelectedTable(""); }}
              className="border rounded px-3 py-2 text-sm"
              style={{ minWidth: 200, borderColor: "#ccc", color: "#231f20" }}>
              <option value="">— select database —</option>
              {dbRows.map((r, i) => (
                <option key={i} value={String(r.catalog_name)}>{String(r.catalog_name)}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "#231f20" }}>Table</label>
          {tables.isLoading ? (
            <div className="flex items-center gap-1 text-sm" style={{ color: "#6a6a6a" }}>
              <Loader2 className="animate-spin" size={14} /> Loading…
            </div>
          ) : (
            <select data-testid="table-select" value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              disabled={!selectedDb}
              className="border rounded px-3 py-2 text-sm"
              style={{ minWidth: 280, borderColor: "#ccc", color: "#231f20" }}>
              <option value="">— select table —</option>
              {tableRows.map((r, i) => {
                const schema = String(r.table_schema);
                const table = String(r.table_name);
                const val = `${schema}.${table}`;
                return (
                  <option key={i} value={val}>
                    {schema === "main" ? table : `${schema}.${table}`}
                  </option>
                );
              })}
            </select>
          )}
        </div>

        <button data-testid="explore-btn"
          disabled={!selectedDb || !selectedTable}
          onClick={() => {
            const [schema, table] = selectedTable.split(".");
            dlog(`Explore: ${selectedDb}.${schema}.${table}`);
            onSelect(selectedDb, schema, table);
          }}
          className="px-4 py-2 rounded text-sm font-medium text-white"
          style={{
            background: !selectedDb || !selectedTable ? "#ccc" : "#0777b3",
            cursor: !selectedDb || !selectedTable ? "not-allowed" : "pointer",
          }}>
          Explore Table
        </button>
      </div>
    </div>
  );
}

// ── GW Explorer ───────────────────────────────────────────────────
function GWExplorer({
  database, schema, table, onBack,
}: {
  database: string; schema: string; table: string; onBack: () => void;
}) {
  const fqn = `"${database}"."${schema}"."${table}"`;

  const columns = useSQLQuery(`DESCRIBE ${fqn}`);
  const dataQuery = useSQLQuery(`SELECT * FROM ${fqn} LIMIT 50000`, {
    enabled: columns.isSuccess,
  });

  const colRows = Array.isArray(columns.data) ? columns.data : [];
  const rawDataRows = Array.isArray(dataQuery.data) ? dataQuery.data : [];

  // Log query results
  useMemo(() => {
    if (columns.isSuccess) {
      dlog(`DESCRIBE OK: ${colRows.length} columns`);
      colRows.forEach((c: any) => dlog(`  ${c.column_name}: ${c.column_type}`));
    }
    if (columns.isError) dlog(`DESCRIBE FAILED: ${columns.error?.message}`);
  }, [columns.isSuccess, columns.isError]);

  useMemo(() => {
    if (dataQuery.isSuccess) {
      dlog(`SELECT OK: ${rawDataRows.length} rows`);
      if (rawDataRows.length > 0) {
        const row = rawDataRows[0];
        const types = Object.entries(row).map(([k, v]) => `${k}:${typeof v}`).join(", ");
        dlog(`Row types: ${types}`);
      }
    }
    if (dataQuery.isError) dlog(`SELECT FAILED: ${dataQuery.error?.message}`);
  }, [dataQuery.isSuccess, dataQuery.isError]);

  // Build fields (skip complex types)
  const fields: IMutField[] = useMemo(() => {
    return colRows
      .filter((col) => {
        const t = String(col.column_type).toUpperCase();
        return !t.includes("[") && !t.startsWith("STRUCT") && !t.startsWith("MAP") && !t.startsWith("UNION");
      })
      .map((col) => {
        const name = String(col.column_name);
        const type = String(col.column_type);
        const { semanticType, analyticType } = classifyColumn(name, type);
        return { fid: name, name, semanticType, analyticType };
      });
  }, [colRows]);

  const includedFields = useMemo(() => new Set(fields.map((f) => f.fid)), [fields]);

  // Normalize ALL data upfront — no BigInt survives past this point
  const data = useMemo(() => {
    dlog(`Normalizing ${rawDataRows.length} rows...`);
    const normalized = normalizeRows(rawDataRows);
    if (includedFields.size < colRows.length) {
      const filtered = normalized.map((row) => {
        const out: IRow = {};
        for (const key of includedFields) out[key] = row[key];
        return out;
      });
      dlog(`Normalized: ${filtered.length} rows, ${includedFields.size} fields (filtered from ${colRows.length})`);
      return filtered;
    }
    dlog(`Normalized: ${normalized.length} rows, ${includedFields.size} fields`);
    return normalized;
  }, [rawDataRows, includedFields, colRows.length]);

  // Verify no BigInt leaked
  useMemo(() => {
    if (data.length > 0) {
      const sample = data[0];
      for (const [k, v] of Object.entries(sample)) {
        if (typeof v === "bigint") {
          dlog(`WARNING: BigInt leaked in field "${k}" after normalization!`);
        }
      }
      dlog(`Passing to GW: ${data.length} rows, ${fields.length} fields`);
      dlog(`Fields: ${fields.map((f) => f.fid).join(", ")}`);
    }
  }, [data, fields]);

  const isLoading = columns.isLoading || dataQuery.isLoading;
  const hasError = columns.isError || dataQuery.isError;
  const errorMsg = columns.error?.message || dataQuery.error?.message;

  return (
    <div style={{ background: "#f8f8f8", minHeight: "100vh" }}>
      <div className="flex items-center gap-4 p-4" style={{ borderBottom: "1px solid #e5e5e5" }}>
        <button data-testid="back-btn" onClick={onBack}
          className="text-sm px-3 py-1 rounded border"
          style={{ borderColor: "#ccc", color: "#231f20" }}>
          ← Back
        </button>
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "#231f20" }} data-testid="table-title">
            {database}.{schema === "main" ? "" : schema + "."}{table}
          </h1>
          <p className="text-xs" style={{ color: "#6a6a6a" }} data-testid="table-info">
            {isLoading ? "Loading data…" : `${data.length.toLocaleString()} rows · ${fields.length} columns`}
          </p>
        </div>
      </div>

      {hasError ? (
        <div className="p-6" style={{ color: "#bc1200" }}>Error: {errorMsg}</div>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 p-12" style={{ color: "#6a6a6a" }} data-testid="loading-spinner">
          <Loader2 className="animate-spin" size={20} />
          Loading {columns.isLoading ? "schema" : "data"}…
        </div>
      ) : (
        <div style={{ height: "calc(100vh - 80px)" }} data-testid="gw-container">
          <ErrorBoundary label="GraphicWalker">
            <GraphicWalker
              data={data}
              fields={fields}
              appearance="light"
              defaultRenderer="observable-plot"
              style={{ width: "100%", height: "100%" }}
            />
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────
export default function MotherDuckGraphicWalker() {
  const [selection, setSelection] = useState<{
    database: string; schema: string; table: string;
  } | null>(null);

  return (
    <ErrorBoundary label="Root">
      {selection ? (
        <GWExplorer
          database={selection.database}
          schema={selection.schema}
          table={selection.table}
          onBack={() => setSelection(null)}
        />
      ) : (
        <DatabaseTablePicker
          onSelect={(database, schema, table) => setSelection({ database, schema, table })}
        />
      )}
      <DebugPanel />
    </ErrorBoundary>
  );
}
