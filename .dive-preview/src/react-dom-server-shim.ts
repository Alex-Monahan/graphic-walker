// Stub for react-dom/server. The Dive runtime doesn't provide it
// and it's only imported by styled-components for SSR (never used in a Dive).
export function renderToString() { return ""; }
export function renderToStaticMarkup() { return ""; }
export function renderToNodeStream() { throw new Error("SSR not available"); }
export function renderToPipeableStream() { throw new Error("SSR not available"); }
export default { renderToString, renderToStaticMarkup };
