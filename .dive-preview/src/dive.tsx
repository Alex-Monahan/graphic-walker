import { useState, useMemo } from "react";
import { useSQLQuery } from "@motherduck/react-sql-query";
import { GraphicWalker } from "@kanaries/graphic-walker";
import type { IMutField, IRow } from "@kanaries/graphic-walker";
import { Loader2 } from "lucide-react";
import "@kanaries/graphic-walker/dist/style.css";

const N = (v: unknown): number => (v != null ? Number(v) : 0);

/** Map DuckDB column types to GW semantic/analytic types */
function classifyColumn(colName: string, colType: string): {
  semanticType: IMutField["semanticType"];
  analyticType: IMutField["analyticType"];
} {
  const t = colType.toUpperCase();
  if (
    t.includes("INT") ||
    t.includes("FLOAT") ||
    t.includes("DOUBLE") ||
    t.includes("DECIMAL") ||
    t.includes("NUMERIC") ||
    t.includes("REAL")
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

/** Convert query result rows so BigInt/special types become plain JS values */
function normalizeRows(rows: readonly Record<string, unknown>[]): IRow[] {
  return rows.map((row) => {
    const out: IRow = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === "bigint") {
        out[k] = Number(v);
      } else if (v != null && typeof v === "object" && "toString" in v) {
        const n = Number(v);
        out[k] = isNaN(n) ? String(v) : n;
      } else {
        out[k] = v;
      }
    }
    return out;
  });
}

function DatabaseTablePicker({
  onSelect,
}: {
  onSelect: (db: string, schema: string, table: string) => void;
}) {
  const [selectedDb, setSelectedDb] = useState<string>("");
  const [selectedTable, setSelectedTable] = useState<string>("");

  // Get all databases (catalogs) excluding system ones
  const databases = useSQLQuery(`
    SELECT DISTINCT catalog_name
    FROM information_schema.schemata
    WHERE catalog_name NOT IN ('system', 'temp', 'md_information_schema')
    ORDER BY catalog_name
  `);

  // Get all tables in the selected database (across all schemas)
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
      <h1
        className="text-2xl font-semibold mb-1"
        style={{ color: "#231f20" }}
      >
        Graphic Walker on MotherDuck
      </h1>
      <p className="text-sm mb-6" style={{ color: "#6a6a6a" }}>
        Select a database and table to explore with Graphic Walker
      </p>

      <div className="flex gap-4 mb-6 items-end flex-wrap">
        {/* Database picker */}
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: "#231f20" }}
          >
            Database
          </label>
          {databases.isLoading ? (
            <div
              className="flex items-center gap-1 text-sm"
              style={{ color: "#6a6a6a" }}
            >
              <Loader2 className="animate-spin" size={14} /> Loading…
            </div>
          ) : (
            <select
              data-testid="db-select"
              value={selectedDb}
              onChange={(e) => {
                setSelectedDb(e.target.value);
                setSelectedTable("");
              }}
              className="border rounded px-3 py-2 text-sm"
              style={{ minWidth: 200, borderColor: "#ccc", color: "#231f20" }}
            >
              <option value="">— select database —</option>
              {dbRows.map((r, i) => (
                <option key={i} value={String(r.catalog_name)}>
                  {String(r.catalog_name)}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Table picker */}
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: "#231f20" }}
          >
            Table
          </label>
          {tables.isLoading ? (
            <div
              className="flex items-center gap-1 text-sm"
              style={{ color: "#6a6a6a" }}
            >
              <Loader2 className="animate-spin" size={14} /> Loading…
            </div>
          ) : (
            <select
              data-testid="table-select"
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              disabled={!selectedDb}
              className="border rounded px-3 py-2 text-sm"
              style={{ minWidth: 280, borderColor: "#ccc", color: "#231f20" }}
            >
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

        {/* Load button */}
        <button
          data-testid="explore-btn"
          disabled={!selectedDb || !selectedTable}
          onClick={() => {
            const [schema, table] = selectedTable.split(".");
            onSelect(selectedDb, schema, table);
          }}
          className="px-4 py-2 rounded text-sm font-medium text-white"
          style={{
            background:
              !selectedDb || !selectedTable ? "#ccc" : "#0777b3",
            cursor:
              !selectedDb || !selectedTable ? "not-allowed" : "pointer",
          }}
        >
          Explore Table
        </button>
      </div>
    </div>
  );
}

function GWExplorer({
  database,
  schema,
  table,
  onBack,
}: {
  database: string;
  schema: string;
  table: string;
  onBack: () => void;
}) {
  const fqn = `"${database}"."${schema}"."${table}"`;

  // Fetch column metadata
  const columns = useSQLQuery(`DESCRIBE ${fqn}`);

  // Fetch data (limit to 50k rows for client-side computation)
  const dataQuery = useSQLQuery(`SELECT * FROM ${fqn} LIMIT 50000`, {
    enabled: columns.isSuccess,
  });

  const colRows = Array.isArray(columns.data) ? columns.data : [];
  const rawDataRows = Array.isArray(dataQuery.data) ? dataQuery.data : [];

  // Build GW fields from column metadata
  const fields: IMutField[] = useMemo(() => {
    return colRows
      .filter((col) => {
        // Skip complex types that GW can't handle (arrays, structs, etc.)
        const t = String(col.column_type).toUpperCase();
        return (
          !t.includes("[") &&
          !t.startsWith("STRUCT") &&
          !t.startsWith("MAP") &&
          !t.startsWith("UNION")
        );
      })
      .map((col) => {
        const name = String(col.column_name);
        const type = String(col.column_type);
        const { semanticType, analyticType } = classifyColumn(name, type);
        return {
          fid: name,
          name,
          semanticType,
          analyticType,
        };
      });
  }, [colRows]);

  // Column names to include (skip complex types)
  const includedFields = useMemo(
    () => new Set(fields.map((f) => f.fid)),
    [fields]
  );

  // Normalize data rows
  const data = useMemo(() => {
    const normalized = normalizeRows(rawDataRows);
    // Filter out columns with complex types
    if (includedFields.size < colRows.length) {
      return normalized.map((row) => {
        const out: IRow = {};
        for (const key of includedFields) {
          out[key] = row[key];
        }
        return out;
      });
    }
    return normalized;
  }, [rawDataRows, includedFields, colRows.length]);

  const isLoading = columns.isLoading || dataQuery.isLoading;
  const hasError = columns.isError || dataQuery.isError;
  const errorMsg = columns.error?.message || dataQuery.error?.message;

  return (
    <div style={{ background: "#f8f8f8", minHeight: "100vh" }}>
      {/* Header */}
      <div
        className="flex items-center gap-4 p-4"
        style={{ borderBottom: "1px solid #e5e5e5" }}
      >
        <button
          data-testid="back-btn"
          onClick={onBack}
          className="text-sm px-3 py-1 rounded border"
          style={{ borderColor: "#ccc", color: "#231f20" }}
        >
          ← Back
        </button>
        <div>
          <h1
            className="text-lg font-semibold"
            style={{ color: "#231f20" }}
            data-testid="table-title"
          >
            {database}.{schema === "main" ? "" : schema + "."}{table}
          </h1>
          <p className="text-xs" style={{ color: "#6a6a6a" }} data-testid="table-info">
            {isLoading
              ? "Loading data…"
              : `${data.length.toLocaleString()} rows · ${fields.length} columns`}
          </p>
        </div>
      </div>

      {/* Content */}
      {hasError ? (
        <div className="p-6" style={{ color: "#bc1200" }}>
          Error: {errorMsg}
        </div>
      ) : isLoading ? (
        <div
          className="flex items-center justify-center gap-2 p-12"
          style={{ color: "#6a6a6a" }}
          data-testid="loading-spinner"
        >
          <Loader2 className="animate-spin" size={20} />
          Loading {columns.isLoading ? "schema" : "data"}…
        </div>
      ) : (
        <div style={{ height: "calc(100vh - 80px)" }} data-testid="gw-container">
          <GraphicWalker
            data={data}
            fields={fields}
            appearance="light"
            defaultRenderer="observable-plot"
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      )}
    </div>
  );
}

export default function MotherDuckGraphicWalker() {
  const [selection, setSelection] = useState<{
    database: string;
    schema: string;
    table: string;
  } | null>(null);

  if (selection) {
    return (
      <GWExplorer
        database={selection.database}
        schema={selection.schema}
        table={selection.table}
        onBack={() => setSelection(null)}
      />
    );
  }

  return (
    <DatabaseTablePicker
      onSelect={(database, schema, table) =>
        setSelection({ database, schema, table })
      }
    />
  );
}
