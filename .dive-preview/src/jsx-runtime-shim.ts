/**
 * Shim for react/jsx-runtime that delegates to the external React.
 *
 * Without this, Vite bundles a LOCAL copy of jsx-runtime which creates
 * React elements with different $$typeof symbols than the Dive runtime's
 * React. The runtime then sees these as plain objects → React error #31.
 *
 * This shim ensures ALL element creation goes through the runtime's
 * React.createElement, so $$typeof is always correct.
 */
import React from "react";

export const Fragment = React.Fragment;

export function jsx(type: any, props: any, key?: any) {
  const { children, ...rest } = props || {};
  if (key !== undefined) rest.key = key;
  if (children === undefined) return React.createElement(type, rest);
  if (Array.isArray(children))
    return React.createElement(type, rest, ...children);
  return React.createElement(type, rest, children);
}

export const jsxs = jsx;
export default { jsx, jsxs, Fragment };
