import { Buffer } from 'buffer/';
import process from 'process';

window.Buffer = Buffer;
window.process = process;

// Fix for environments where Element or Path2D are missing (prevent crashes in polyfills)
if (typeof window !== 'undefined') {
    try {
        if (typeof (window as any).Element === 'undefined') {
            (window as any).Element = class Element { };
        }
        if ((window as any).Element && typeof (window as any).Element.prototype === 'undefined') {
            (window as any).Element.prototype = {};
        }
    } catch (e) {
        console.warn("Polyfill Element failed", e);
    }

    try {
        if (typeof (window as any).Path2D === 'undefined') {
            (window as any).Path2D = class Path2D { };
        }
    } catch (e) {
        console.warn("Polyfill Path2D failed", e);
    }
}

export { Buffer, process };
