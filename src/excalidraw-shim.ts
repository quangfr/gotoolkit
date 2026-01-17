// src/excalidraw-shim.ts
const ExcalidrawLib = (window as any).ExcalidrawLib;
export const Excalidraw = ExcalidrawLib?.Excalidraw;
export const convertToExcalidrawElements = ExcalidrawLib?.convertToExcalidrawElements;
export const exportToSvg = ExcalidrawLib?.exportToSvg;
export const getCommonBounds = ExcalidrawLib?.getCommonBounds;
export default ExcalidrawLib;
