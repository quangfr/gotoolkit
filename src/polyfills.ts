import { Buffer } from 'buffer/';
import process from 'process';

// 1. Immediate global assignment in a safe closure
(function() {
    // Get the global object safely
    var g: any;
    try {
        g = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : {})));
    } catch (e) {
        g = {};
    }
    
    // Assign Buffer and process
    try {
        g.Buffer = Buffer;
        g.process = process;
    } catch(e) {}

    // Safe shim function
    function safeShim(name: string) {
        try {
            var existing = g ? g[name] : undefined;
            if (!existing) {
                var F = function() {};
                F.prototype = {};
                try { g[name] = F; } catch (e) {}
                existing = g ? g[name] : F;
            }
            if (
                existing &&
                (typeof existing === 'function' || (typeof existing === 'object' && existing !== null)) &&
                !('prototype' in existing)
            ) {
                try { (existing as any).prototype = {}; } catch (e) {}
            }
        } catch (e) {}
    }

    safeShim('Element');
    safeShim('Path2D');
    safeShim('SVGPathSeg');
    
    // Array.at polyfill with deep safety checks
    try {
        if (typeof Array !== 'undefined' && Array.prototype && typeof (Array.prototype as any).at !== 'function') {
            Object.defineProperty(Array.prototype, 'at', {
                value: function(n: number) {
                    n = Math.trunc(n) || 0;
                    if (n < 0) n += this.length;
                    if (n < 0 || n >= this.length) return undefined;
                    return (this as any)[n];
                },
                writable: true,
                configurable: true
            });
        }
    } catch (e) {}
})();

export { Buffer, process };
