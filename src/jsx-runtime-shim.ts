// src/jsx-runtime-shim.ts
const React = (window as any).React;

const createElement = React?.createElement;

export const jsx = (type: any, props: any, key?: any) => {
  if (!createElement) return null;
  if (key !== void 0) {
    props = props ? { ...props, key } : { key };
  }
  return createElement(type, props);
};

export const jsxs = (type: any, props: any, key?: any) => {
  if (!createElement) return null;
  if (key !== void 0) {
    props = props ? { ...props, key } : { key };
  }
  return createElement(type, props);
};

export const Fragment = React?.Fragment;
