// src/react-dom-shim.ts
const ReactDOM = (window as any).ReactDOM;
export default ReactDOM;
export const createRoot = ReactDOM?.createRoot;
export const hydrateRoot = ReactDOM?.hydrateRoot;
export const flushSync = ReactDOM?.flushSync;
export const findDOMNode = ReactDOM?.findDOMNode;
export const unmountComponentAtNode = ReactDOM?.unmountComponentAtNode;
