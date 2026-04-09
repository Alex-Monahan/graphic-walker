// Shim for Node.js 'util' module. The Dive runtime doesn't provide it.
// lodash-es conditionally requires util.types at runtime — this stub
// prevents the module resolution from failing.
export const types = {};
export default { types };
