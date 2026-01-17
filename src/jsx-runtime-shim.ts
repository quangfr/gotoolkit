// src/jsx-runtime-shim.ts
const React = (window as any).React;
export const jsx = React?.createElement;
export const jsxs = React?.createElement;
export const Fragment = React?.Fragment;
