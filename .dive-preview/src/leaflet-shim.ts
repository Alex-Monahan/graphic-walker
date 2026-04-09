// Empty shim for leaflet — not needed in a Dive (no map support).
// Leaflet tries to inject external CSS which violates the sandbox CSP.
export const map = () => ({});
export const tileLayer = () => ({});
export const Icon = class {};
export const DivIcon = class {};
export const Marker = class {};
export default { map, tileLayer, Icon, DivIcon, Marker };
