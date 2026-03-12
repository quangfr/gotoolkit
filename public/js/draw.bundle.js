"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // <define:process.env>
  var init_define_process_env = __esm({
    "<define:process.env>"() {
    }
  });

  // node_modules/base64-js/index.js
  var require_base64_js = __commonJS({
    "node_modules/base64-js/index.js"(exports) {
      "use strict";
      init_define_process_env();
      init_polyfills();
      exports.byteLength = byteLength;
      exports.toByteArray = toByteArray;
      exports.fromByteArray = fromByteArray;
      var lookup = [];
      var revLookup = [];
      var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
      var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      for (i = 0, len = code.length; i < len; ++i) {
        lookup[i] = code[i];
        revLookup[code.charCodeAt(i)] = i;
      }
      var i;
      var len;
      revLookup["-".charCodeAt(0)] = 62;
      revLookup["_".charCodeAt(0)] = 63;
      function getLens(b64) {
        var len2 = b64.length;
        if (len2 % 4 > 0) {
          throw new Error("Invalid string. Length must be a multiple of 4");
        }
        var validLen = b64.indexOf("=");
        if (validLen === -1) validLen = len2;
        var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
        return [validLen, placeHoldersLen];
      }
      function byteLength(b64) {
        var lens = getLens(b64);
        var validLen = lens[0];
        var placeHoldersLen = lens[1];
        return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
      }
      function _byteLength(b64, validLen, placeHoldersLen) {
        return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
      }
      function toByteArray(b64) {
        var tmp;
        var lens = getLens(b64);
        var validLen = lens[0];
        var placeHoldersLen = lens[1];
        var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
        var curByte = 0;
        var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
        var i2;
        for (i2 = 0; i2 < len2; i2 += 4) {
          tmp = revLookup[b64.charCodeAt(i2)] << 18 | revLookup[b64.charCodeAt(i2 + 1)] << 12 | revLookup[b64.charCodeAt(i2 + 2)] << 6 | revLookup[b64.charCodeAt(i2 + 3)];
          arr[curByte++] = tmp >> 16 & 255;
          arr[curByte++] = tmp >> 8 & 255;
          arr[curByte++] = tmp & 255;
        }
        if (placeHoldersLen === 2) {
          tmp = revLookup[b64.charCodeAt(i2)] << 2 | revLookup[b64.charCodeAt(i2 + 1)] >> 4;
          arr[curByte++] = tmp & 255;
        }
        if (placeHoldersLen === 1) {
          tmp = revLookup[b64.charCodeAt(i2)] << 10 | revLookup[b64.charCodeAt(i2 + 1)] << 4 | revLookup[b64.charCodeAt(i2 + 2)] >> 2;
          arr[curByte++] = tmp >> 8 & 255;
          arr[curByte++] = tmp & 255;
        }
        return arr;
      }
      function tripletToBase64(num) {
        return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
      }
      function encodeChunk(uint8, start, end) {
        var tmp;
        var output = [];
        for (var i2 = start; i2 < end; i2 += 3) {
          tmp = (uint8[i2] << 16 & 16711680) + (uint8[i2 + 1] << 8 & 65280) + (uint8[i2 + 2] & 255);
          output.push(tripletToBase64(tmp));
        }
        return output.join("");
      }
      function fromByteArray(uint8) {
        var tmp;
        var len2 = uint8.length;
        var extraBytes = len2 % 3;
        var parts = [];
        var maxChunkLength = 16383;
        for (var i2 = 0, len22 = len2 - extraBytes; i2 < len22; i2 += maxChunkLength) {
          parts.push(encodeChunk(uint8, i2, i2 + maxChunkLength > len22 ? len22 : i2 + maxChunkLength));
        }
        if (extraBytes === 1) {
          tmp = uint8[len2 - 1];
          parts.push(
            lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
          );
        } else if (extraBytes === 2) {
          tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
          parts.push(
            lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
          );
        }
        return parts.join("");
      }
    }
  });

  // node_modules/ieee754/index.js
  var require_ieee754 = __commonJS({
    "node_modules/ieee754/index.js"(exports) {
      init_define_process_env();
      init_polyfills();
      exports.read = function(buffer, offset, isLE, mLen, nBytes) {
        var e, m;
        var eLen = nBytes * 8 - mLen - 1;
        var eMax = (1 << eLen) - 1;
        var eBias = eMax >> 1;
        var nBits = -7;
        var i = isLE ? nBytes - 1 : 0;
        var d = isLE ? -1 : 1;
        var s = buffer[offset + i];
        i += d;
        e = s & (1 << -nBits) - 1;
        s >>= -nBits;
        nBits += eLen;
        for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {
        }
        m = e & (1 << -nBits) - 1;
        e >>= -nBits;
        nBits += mLen;
        for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {
        }
        if (e === 0) {
          e = 1 - eBias;
        } else if (e === eMax) {
          return m ? NaN : (s ? -1 : 1) * Infinity;
        } else {
          m = m + Math.pow(2, mLen);
          e = e - eBias;
        }
        return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
      };
      exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
        var e, m, c;
        var eLen = nBytes * 8 - mLen - 1;
        var eMax = (1 << eLen) - 1;
        var eBias = eMax >> 1;
        var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
        var i = isLE ? 0 : nBytes - 1;
        var d = isLE ? 1 : -1;
        var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
        value = Math.abs(value);
        if (isNaN(value) || value === Infinity) {
          m = isNaN(value) ? 1 : 0;
          e = eMax;
        } else {
          e = Math.floor(Math.log(value) / Math.LN2);
          if (value * (c = Math.pow(2, -e)) < 1) {
            e--;
            c *= 2;
          }
          if (e + eBias >= 1) {
            value += rt / c;
          } else {
            value += rt * Math.pow(2, 1 - eBias);
          }
          if (value * c >= 2) {
            e++;
            c /= 2;
          }
          if (e + eBias >= eMax) {
            m = 0;
            e = eMax;
          } else if (e + eBias >= 1) {
            m = (value * c - 1) * Math.pow(2, mLen);
            e = e + eBias;
          } else {
            m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
            e = 0;
          }
        }
        for (; mLen >= 8; buffer[offset + i] = m & 255, i += d, m /= 256, mLen -= 8) {
        }
        e = e << mLen | m;
        eLen += mLen;
        for (; eLen > 0; buffer[offset + i] = e & 255, i += d, e /= 256, eLen -= 8) {
        }
        buffer[offset + i - d] |= s * 128;
      };
    }
  });

  // node_modules/buffer/index.js
  var require_buffer = __commonJS({
    "node_modules/buffer/index.js"(exports) {
      "use strict";
      init_define_process_env();
      init_polyfills();
      var base64 = require_base64_js();
      var ieee754 = require_ieee754();
      var customInspectSymbol = typeof Symbol === "function" && typeof Symbol["for"] === "function" ? Symbol["for"]("nodejs.util.inspect.custom") : null;
      exports.Buffer = Buffer3;
      exports.SlowBuffer = SlowBuffer;
      exports.INSPECT_MAX_BYTES = 50;
      var K_MAX_LENGTH = 2147483647;
      exports.kMaxLength = K_MAX_LENGTH;
      Buffer3.TYPED_ARRAY_SUPPORT = typedArraySupport();
      if (!Buffer3.TYPED_ARRAY_SUPPORT && typeof console !== "undefined" && typeof console.error === "function") {
        console.error(
          "This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support."
        );
      }
      function typedArraySupport() {
        try {
          const arr = new Uint8Array(1);
          const proto = { foo: function() {
            return 42;
          } };
          Object.setPrototypeOf(proto, Uint8Array.prototype);
          Object.setPrototypeOf(arr, proto);
          return arr.foo() === 42;
        } catch (e) {
          return false;
        }
      }
      Object.defineProperty(Buffer3.prototype, "parent", {
        enumerable: true,
        get: function() {
          if (!Buffer3.isBuffer(this)) return void 0;
          return this.buffer;
        }
      });
      Object.defineProperty(Buffer3.prototype, "offset", {
        enumerable: true,
        get: function() {
          if (!Buffer3.isBuffer(this)) return void 0;
          return this.byteOffset;
        }
      });
      function createBuffer(length) {
        if (length > K_MAX_LENGTH) {
          throw new RangeError('The value "' + length + '" is invalid for option "size"');
        }
        const buf = new Uint8Array(length);
        Object.setPrototypeOf(buf, Buffer3.prototype);
        return buf;
      }
      function Buffer3(arg, encodingOrOffset, length) {
        if (typeof arg === "number") {
          if (typeof encodingOrOffset === "string") {
            throw new TypeError(
              'The "string" argument must be of type string. Received type number'
            );
          }
          return allocUnsafe(arg);
        }
        return from(arg, encodingOrOffset, length);
      }
      Buffer3.poolSize = 8192;
      function from(value, encodingOrOffset, length) {
        if (typeof value === "string") {
          return fromString(value, encodingOrOffset);
        }
        if (ArrayBuffer.isView(value)) {
          return fromArrayView(value);
        }
        if (value == null) {
          throw new TypeError(
            "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
          );
        }
        if (isInstance(value, ArrayBuffer) || value && isInstance(value.buffer, ArrayBuffer)) {
          return fromArrayBuffer(value, encodingOrOffset, length);
        }
        if (typeof SharedArrayBuffer !== "undefined" && (isInstance(value, SharedArrayBuffer) || value && isInstance(value.buffer, SharedArrayBuffer))) {
          return fromArrayBuffer(value, encodingOrOffset, length);
        }
        if (typeof value === "number") {
          throw new TypeError(
            'The "value" argument must not be of type number. Received type number'
          );
        }
        const valueOf = value.valueOf && value.valueOf();
        if (valueOf != null && valueOf !== value) {
          return Buffer3.from(valueOf, encodingOrOffset, length);
        }
        const b = fromObject(value);
        if (b) return b;
        if (typeof Symbol !== "undefined" && Symbol.toPrimitive != null && typeof value[Symbol.toPrimitive] === "function") {
          return Buffer3.from(value[Symbol.toPrimitive]("string"), encodingOrOffset, length);
        }
        throw new TypeError(
          "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
        );
      }
      Buffer3.from = function(value, encodingOrOffset, length) {
        return from(value, encodingOrOffset, length);
      };
      Object.setPrototypeOf(Buffer3.prototype, Uint8Array.prototype);
      Object.setPrototypeOf(Buffer3, Uint8Array);
      function assertSize(size) {
        if (typeof size !== "number") {
          throw new TypeError('"size" argument must be of type number');
        } else if (size < 0) {
          throw new RangeError('The value "' + size + '" is invalid for option "size"');
        }
      }
      function alloc(size, fill, encoding) {
        assertSize(size);
        if (size <= 0) {
          return createBuffer(size);
        }
        if (fill !== void 0) {
          return typeof encoding === "string" ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill);
        }
        return createBuffer(size);
      }
      Buffer3.alloc = function(size, fill, encoding) {
        return alloc(size, fill, encoding);
      };
      function allocUnsafe(size) {
        assertSize(size);
        return createBuffer(size < 0 ? 0 : checked(size) | 0);
      }
      Buffer3.allocUnsafe = function(size) {
        return allocUnsafe(size);
      };
      Buffer3.allocUnsafeSlow = function(size) {
        return allocUnsafe(size);
      };
      function fromString(string, encoding) {
        if (typeof encoding !== "string" || encoding === "") {
          encoding = "utf8";
        }
        if (!Buffer3.isEncoding(encoding)) {
          throw new TypeError("Unknown encoding: " + encoding);
        }
        const length = byteLength(string, encoding) | 0;
        let buf = createBuffer(length);
        const actual = buf.write(string, encoding);
        if (actual !== length) {
          buf = buf.slice(0, actual);
        }
        return buf;
      }
      function fromArrayLike(array) {
        const length = array.length < 0 ? 0 : checked(array.length) | 0;
        const buf = createBuffer(length);
        for (let i = 0; i < length; i += 1) {
          buf[i] = array[i] & 255;
        }
        return buf;
      }
      function fromArrayView(arrayView) {
        if (isInstance(arrayView, Uint8Array)) {
          const copy = new Uint8Array(arrayView);
          return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength);
        }
        return fromArrayLike(arrayView);
      }
      function fromArrayBuffer(array, byteOffset, length) {
        if (byteOffset < 0 || array.byteLength < byteOffset) {
          throw new RangeError('"offset" is outside of buffer bounds');
        }
        if (array.byteLength < byteOffset + (length || 0)) {
          throw new RangeError('"length" is outside of buffer bounds');
        }
        let buf;
        if (byteOffset === void 0 && length === void 0) {
          buf = new Uint8Array(array);
        } else if (length === void 0) {
          buf = new Uint8Array(array, byteOffset);
        } else {
          buf = new Uint8Array(array, byteOffset, length);
        }
        Object.setPrototypeOf(buf, Buffer3.prototype);
        return buf;
      }
      function fromObject(obj) {
        if (Buffer3.isBuffer(obj)) {
          const len = checked(obj.length) | 0;
          const buf = createBuffer(len);
          if (buf.length === 0) {
            return buf;
          }
          obj.copy(buf, 0, 0, len);
          return buf;
        }
        if (obj.length !== void 0) {
          if (typeof obj.length !== "number" || numberIsNaN(obj.length)) {
            return createBuffer(0);
          }
          return fromArrayLike(obj);
        }
        if (obj.type === "Buffer" && Array.isArray(obj.data)) {
          return fromArrayLike(obj.data);
        }
      }
      function checked(length) {
        if (length >= K_MAX_LENGTH) {
          throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + K_MAX_LENGTH.toString(16) + " bytes");
        }
        return length | 0;
      }
      function SlowBuffer(length) {
        if (+length != length) {
          length = 0;
        }
        return Buffer3.alloc(+length);
      }
      Buffer3.isBuffer = function isBuffer(b) {
        return b != null && b._isBuffer === true && b !== Buffer3.prototype;
      };
      Buffer3.compare = function compare(a, b) {
        if (isInstance(a, Uint8Array)) a = Buffer3.from(a, a.offset, a.byteLength);
        if (isInstance(b, Uint8Array)) b = Buffer3.from(b, b.offset, b.byteLength);
        if (!Buffer3.isBuffer(a) || !Buffer3.isBuffer(b)) {
          throw new TypeError(
            'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
          );
        }
        if (a === b) return 0;
        let x = a.length;
        let y = b.length;
        for (let i = 0, len = Math.min(x, y); i < len; ++i) {
          if (a[i] !== b[i]) {
            x = a[i];
            y = b[i];
            break;
          }
        }
        if (x < y) return -1;
        if (y < x) return 1;
        return 0;
      };
      Buffer3.isEncoding = function isEncoding(encoding) {
        switch (String(encoding).toLowerCase()) {
          case "hex":
          case "utf8":
          case "utf-8":
          case "ascii":
          case "latin1":
          case "binary":
          case "base64":
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return true;
          default:
            return false;
        }
      };
      Buffer3.concat = function concat(list, length) {
        if (!Array.isArray(list)) {
          throw new TypeError('"list" argument must be an Array of Buffers');
        }
        if (list.length === 0) {
          return Buffer3.alloc(0);
        }
        let i;
        if (length === void 0) {
          length = 0;
          for (i = 0; i < list.length; ++i) {
            length += list[i].length;
          }
        }
        const buffer = Buffer3.allocUnsafe(length);
        let pos = 0;
        for (i = 0; i < list.length; ++i) {
          let buf = list[i];
          if (isInstance(buf, Uint8Array)) {
            if (pos + buf.length > buffer.length) {
              if (!Buffer3.isBuffer(buf)) buf = Buffer3.from(buf);
              buf.copy(buffer, pos);
            } else {
              Uint8Array.prototype.set.call(
                buffer,
                buf,
                pos
              );
            }
          } else if (!Buffer3.isBuffer(buf)) {
            throw new TypeError('"list" argument must be an Array of Buffers');
          } else {
            buf.copy(buffer, pos);
          }
          pos += buf.length;
        }
        return buffer;
      };
      function byteLength(string, encoding) {
        if (Buffer3.isBuffer(string)) {
          return string.length;
        }
        if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
          return string.byteLength;
        }
        if (typeof string !== "string") {
          throw new TypeError(
            'The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' + typeof string
          );
        }
        const len = string.length;
        const mustMatch = arguments.length > 2 && arguments[2] === true;
        if (!mustMatch && len === 0) return 0;
        let loweredCase = false;
        for (; ; ) {
          switch (encoding) {
            case "ascii":
            case "latin1":
            case "binary":
              return len;
            case "utf8":
            case "utf-8":
              return utf8ToBytes(string).length;
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return len * 2;
            case "hex":
              return len >>> 1;
            case "base64":
              return base64ToBytes(string).length;
            default:
              if (loweredCase) {
                return mustMatch ? -1 : utf8ToBytes(string).length;
              }
              encoding = ("" + encoding).toLowerCase();
              loweredCase = true;
          }
        }
      }
      Buffer3.byteLength = byteLength;
      function slowToString(encoding, start, end) {
        let loweredCase = false;
        if (start === void 0 || start < 0) {
          start = 0;
        }
        if (start > this.length) {
          return "";
        }
        if (end === void 0 || end > this.length) {
          end = this.length;
        }
        if (end <= 0) {
          return "";
        }
        end >>>= 0;
        start >>>= 0;
        if (end <= start) {
          return "";
        }
        if (!encoding) encoding = "utf8";
        while (true) {
          switch (encoding) {
            case "hex":
              return hexSlice(this, start, end);
            case "utf8":
            case "utf-8":
              return utf8Slice(this, start, end);
            case "ascii":
              return asciiSlice(this, start, end);
            case "latin1":
            case "binary":
              return latin1Slice(this, start, end);
            case "base64":
              return base64Slice(this, start, end);
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return utf16leSlice(this, start, end);
            default:
              if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
              encoding = (encoding + "").toLowerCase();
              loweredCase = true;
          }
        }
      }
      Buffer3.prototype._isBuffer = true;
      function swap(b, n, m) {
        const i = b[n];
        b[n] = b[m];
        b[m] = i;
      }
      Buffer3.prototype.swap16 = function swap16() {
        const len = this.length;
        if (len % 2 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 16-bits");
        }
        for (let i = 0; i < len; i += 2) {
          swap(this, i, i + 1);
        }
        return this;
      };
      Buffer3.prototype.swap32 = function swap32() {
        const len = this.length;
        if (len % 4 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 32-bits");
        }
        for (let i = 0; i < len; i += 4) {
          swap(this, i, i + 3);
          swap(this, i + 1, i + 2);
        }
        return this;
      };
      Buffer3.prototype.swap64 = function swap64() {
        const len = this.length;
        if (len % 8 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 64-bits");
        }
        for (let i = 0; i < len; i += 8) {
          swap(this, i, i + 7);
          swap(this, i + 1, i + 6);
          swap(this, i + 2, i + 5);
          swap(this, i + 3, i + 4);
        }
        return this;
      };
      Buffer3.prototype.toString = function toString() {
        const length = this.length;
        if (length === 0) return "";
        if (arguments.length === 0) return utf8Slice(this, 0, length);
        return slowToString.apply(this, arguments);
      };
      Buffer3.prototype.toLocaleString = Buffer3.prototype.toString;
      Buffer3.prototype.equals = function equals(b) {
        if (!Buffer3.isBuffer(b)) throw new TypeError("Argument must be a Buffer");
        if (this === b) return true;
        return Buffer3.compare(this, b) === 0;
      };
      Buffer3.prototype.inspect = function inspect() {
        let str = "";
        const max = exports.INSPECT_MAX_BYTES;
        str = this.toString("hex", 0, max).replace(/(.{2})/g, "$1 ").trim();
        if (this.length > max) str += " ... ";
        return "<Buffer " + str + ">";
      };
      if (customInspectSymbol) {
        Buffer3.prototype[customInspectSymbol] = Buffer3.prototype.inspect;
      }
      Buffer3.prototype.compare = function compare(target, start, end, thisStart, thisEnd) {
        if (isInstance(target, Uint8Array)) {
          target = Buffer3.from(target, target.offset, target.byteLength);
        }
        if (!Buffer3.isBuffer(target)) {
          throw new TypeError(
            'The "target" argument must be one of type Buffer or Uint8Array. Received type ' + typeof target
          );
        }
        if (start === void 0) {
          start = 0;
        }
        if (end === void 0) {
          end = target ? target.length : 0;
        }
        if (thisStart === void 0) {
          thisStart = 0;
        }
        if (thisEnd === void 0) {
          thisEnd = this.length;
        }
        if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
          throw new RangeError("out of range index");
        }
        if (thisStart >= thisEnd && start >= end) {
          return 0;
        }
        if (thisStart >= thisEnd) {
          return -1;
        }
        if (start >= end) {
          return 1;
        }
        start >>>= 0;
        end >>>= 0;
        thisStart >>>= 0;
        thisEnd >>>= 0;
        if (this === target) return 0;
        let x = thisEnd - thisStart;
        let y = end - start;
        const len = Math.min(x, y);
        const thisCopy = this.slice(thisStart, thisEnd);
        const targetCopy = target.slice(start, end);
        for (let i = 0; i < len; ++i) {
          if (thisCopy[i] !== targetCopy[i]) {
            x = thisCopy[i];
            y = targetCopy[i];
            break;
          }
        }
        if (x < y) return -1;
        if (y < x) return 1;
        return 0;
      };
      function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
        if (buffer.length === 0) return -1;
        if (typeof byteOffset === "string") {
          encoding = byteOffset;
          byteOffset = 0;
        } else if (byteOffset > 2147483647) {
          byteOffset = 2147483647;
        } else if (byteOffset < -2147483648) {
          byteOffset = -2147483648;
        }
        byteOffset = +byteOffset;
        if (numberIsNaN(byteOffset)) {
          byteOffset = dir ? 0 : buffer.length - 1;
        }
        if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
        if (byteOffset >= buffer.length) {
          if (dir) return -1;
          else byteOffset = buffer.length - 1;
        } else if (byteOffset < 0) {
          if (dir) byteOffset = 0;
          else return -1;
        }
        if (typeof val === "string") {
          val = Buffer3.from(val, encoding);
        }
        if (Buffer3.isBuffer(val)) {
          if (val.length === 0) {
            return -1;
          }
          return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
        } else if (typeof val === "number") {
          val = val & 255;
          if (typeof Uint8Array.prototype.indexOf === "function") {
            if (dir) {
              return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
            } else {
              return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
            }
          }
          return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
        }
        throw new TypeError("val must be string, number or Buffer");
      }
      function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
        let indexSize = 1;
        let arrLength = arr.length;
        let valLength = val.length;
        if (encoding !== void 0) {
          encoding = String(encoding).toLowerCase();
          if (encoding === "ucs2" || encoding === "ucs-2" || encoding === "utf16le" || encoding === "utf-16le") {
            if (arr.length < 2 || val.length < 2) {
              return -1;
            }
            indexSize = 2;
            arrLength /= 2;
            valLength /= 2;
            byteOffset /= 2;
          }
        }
        function read(buf, i2) {
          if (indexSize === 1) {
            return buf[i2];
          } else {
            return buf.readUInt16BE(i2 * indexSize);
          }
        }
        let i;
        if (dir) {
          let foundIndex = -1;
          for (i = byteOffset; i < arrLength; i++) {
            if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
              if (foundIndex === -1) foundIndex = i;
              if (i - foundIndex + 1 === valLength) return foundIndex * indexSize;
            } else {
              if (foundIndex !== -1) i -= i - foundIndex;
              foundIndex = -1;
            }
          }
        } else {
          if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
          for (i = byteOffset; i >= 0; i--) {
            let found = true;
            for (let j = 0; j < valLength; j++) {
              if (read(arr, i + j) !== read(val, j)) {
                found = false;
                break;
              }
            }
            if (found) return i;
          }
        }
        return -1;
      }
      Buffer3.prototype.includes = function includes(val, byteOffset, encoding) {
        return this.indexOf(val, byteOffset, encoding) !== -1;
      };
      Buffer3.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
        return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
      };
      Buffer3.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
        return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
      };
      function hexWrite(buf, string, offset, length) {
        offset = Number(offset) || 0;
        const remaining = buf.length - offset;
        if (!length) {
          length = remaining;
        } else {
          length = Number(length);
          if (length > remaining) {
            length = remaining;
          }
        }
        const strLen = string.length;
        if (length > strLen / 2) {
          length = strLen / 2;
        }
        let i;
        for (i = 0; i < length; ++i) {
          const parsed = parseInt(string.substr(i * 2, 2), 16);
          if (numberIsNaN(parsed)) return i;
          buf[offset + i] = parsed;
        }
        return i;
      }
      function utf8Write(buf, string, offset, length) {
        return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length);
      }
      function asciiWrite(buf, string, offset, length) {
        return blitBuffer(asciiToBytes(string), buf, offset, length);
      }
      function base64Write(buf, string, offset, length) {
        return blitBuffer(base64ToBytes(string), buf, offset, length);
      }
      function ucs2Write(buf, string, offset, length) {
        return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
      }
      Buffer3.prototype.write = function write(string, offset, length, encoding) {
        if (offset === void 0) {
          encoding = "utf8";
          length = this.length;
          offset = 0;
        } else if (length === void 0 && typeof offset === "string") {
          encoding = offset;
          length = this.length;
          offset = 0;
        } else if (isFinite(offset)) {
          offset = offset >>> 0;
          if (isFinite(length)) {
            length = length >>> 0;
            if (encoding === void 0) encoding = "utf8";
          } else {
            encoding = length;
            length = void 0;
          }
        } else {
          throw new Error(
            "Buffer.write(string, encoding, offset[, length]) is no longer supported"
          );
        }
        const remaining = this.length - offset;
        if (length === void 0 || length > remaining) length = remaining;
        if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
          throw new RangeError("Attempt to write outside buffer bounds");
        }
        if (!encoding) encoding = "utf8";
        let loweredCase = false;
        for (; ; ) {
          switch (encoding) {
            case "hex":
              return hexWrite(this, string, offset, length);
            case "utf8":
            case "utf-8":
              return utf8Write(this, string, offset, length);
            case "ascii":
            case "latin1":
            case "binary":
              return asciiWrite(this, string, offset, length);
            case "base64":
              return base64Write(this, string, offset, length);
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return ucs2Write(this, string, offset, length);
            default:
              if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
              encoding = ("" + encoding).toLowerCase();
              loweredCase = true;
          }
        }
      };
      Buffer3.prototype.toJSON = function toJSON() {
        return {
          type: "Buffer",
          data: Array.prototype.slice.call(this._arr || this, 0)
        };
      };
      function base64Slice(buf, start, end) {
        if (start === 0 && end === buf.length) {
          return base64.fromByteArray(buf);
        } else {
          return base64.fromByteArray(buf.slice(start, end));
        }
      }
      function utf8Slice(buf, start, end) {
        end = Math.min(buf.length, end);
        const res = [];
        let i = start;
        while (i < end) {
          const firstByte = buf[i];
          let codePoint = null;
          let bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
          if (i + bytesPerSequence <= end) {
            let secondByte, thirdByte, fourthByte, tempCodePoint;
            switch (bytesPerSequence) {
              case 1:
                if (firstByte < 128) {
                  codePoint = firstByte;
                }
                break;
              case 2:
                secondByte = buf[i + 1];
                if ((secondByte & 192) === 128) {
                  tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
                  if (tempCodePoint > 127) {
                    codePoint = tempCodePoint;
                  }
                }
                break;
              case 3:
                secondByte = buf[i + 1];
                thirdByte = buf[i + 2];
                if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
                  tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
                  if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
                    codePoint = tempCodePoint;
                  }
                }
                break;
              case 4:
                secondByte = buf[i + 1];
                thirdByte = buf[i + 2];
                fourthByte = buf[i + 3];
                if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
                  tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
                  if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
                    codePoint = tempCodePoint;
                  }
                }
            }
          }
          if (codePoint === null) {
            codePoint = 65533;
            bytesPerSequence = 1;
          } else if (codePoint > 65535) {
            codePoint -= 65536;
            res.push(codePoint >>> 10 & 1023 | 55296);
            codePoint = 56320 | codePoint & 1023;
          }
          res.push(codePoint);
          i += bytesPerSequence;
        }
        return decodeCodePointsArray(res);
      }
      var MAX_ARGUMENTS_LENGTH = 4096;
      function decodeCodePointsArray(codePoints) {
        const len = codePoints.length;
        if (len <= MAX_ARGUMENTS_LENGTH) {
          return String.fromCharCode.apply(String, codePoints);
        }
        let res = "";
        let i = 0;
        while (i < len) {
          res += String.fromCharCode.apply(
            String,
            codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
          );
        }
        return res;
      }
      function asciiSlice(buf, start, end) {
        let ret = "";
        end = Math.min(buf.length, end);
        for (let i = start; i < end; ++i) {
          ret += String.fromCharCode(buf[i] & 127);
        }
        return ret;
      }
      function latin1Slice(buf, start, end) {
        let ret = "";
        end = Math.min(buf.length, end);
        for (let i = start; i < end; ++i) {
          ret += String.fromCharCode(buf[i]);
        }
        return ret;
      }
      function hexSlice(buf, start, end) {
        const len = buf.length;
        if (!start || start < 0) start = 0;
        if (!end || end < 0 || end > len) end = len;
        let out = "";
        for (let i = start; i < end; ++i) {
          out += hexSliceLookupTable[buf[i]];
        }
        return out;
      }
      function utf16leSlice(buf, start, end) {
        const bytes = buf.slice(start, end);
        let res = "";
        for (let i = 0; i < bytes.length - 1; i += 2) {
          res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
        }
        return res;
      }
      Buffer3.prototype.slice = function slice(start, end) {
        const len = this.length;
        start = ~~start;
        end = end === void 0 ? len : ~~end;
        if (start < 0) {
          start += len;
          if (start < 0) start = 0;
        } else if (start > len) {
          start = len;
        }
        if (end < 0) {
          end += len;
          if (end < 0) end = 0;
        } else if (end > len) {
          end = len;
        }
        if (end < start) end = start;
        const newBuf = this.subarray(start, end);
        Object.setPrototypeOf(newBuf, Buffer3.prototype);
        return newBuf;
      };
      function checkOffset(offset, ext, length) {
        if (offset % 1 !== 0 || offset < 0) throw new RangeError("offset is not uint");
        if (offset + ext > length) throw new RangeError("Trying to access beyond buffer length");
      }
      Buffer3.prototype.readUintLE = Buffer3.prototype.readUIntLE = function readUIntLE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let val = this[offset];
        let mul = 1;
        let i = 0;
        while (++i < byteLength2 && (mul *= 256)) {
          val += this[offset + i] * mul;
        }
        return val;
      };
      Buffer3.prototype.readUintBE = Buffer3.prototype.readUIntBE = function readUIntBE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          checkOffset(offset, byteLength2, this.length);
        }
        let val = this[offset + --byteLength2];
        let mul = 1;
        while (byteLength2 > 0 && (mul *= 256)) {
          val += this[offset + --byteLength2] * mul;
        }
        return val;
      };
      Buffer3.prototype.readUint8 = Buffer3.prototype.readUInt8 = function readUInt8(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 1, this.length);
        return this[offset];
      };
      Buffer3.prototype.readUint16LE = Buffer3.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        return this[offset] | this[offset + 1] << 8;
      };
      Buffer3.prototype.readUint16BE = Buffer3.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        return this[offset] << 8 | this[offset + 1];
      };
      Buffer3.prototype.readUint32LE = Buffer3.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 16777216;
      };
      Buffer3.prototype.readUint32BE = Buffer3.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
      };
      Buffer3.prototype.readBigUInt64LE = defineBigIntMethod(function readBigUInt64LE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const lo = first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24;
        const hi = this[++offset] + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + last * 2 ** 24;
        return BigInt(lo) + (BigInt(hi) << BigInt(32));
      });
      Buffer3.prototype.readBigUInt64BE = defineBigIntMethod(function readBigUInt64BE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const hi = first * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
        const lo = this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last;
        return (BigInt(hi) << BigInt(32)) + BigInt(lo);
      });
      Buffer3.prototype.readIntLE = function readIntLE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let val = this[offset];
        let mul = 1;
        let i = 0;
        while (++i < byteLength2 && (mul *= 256)) {
          val += this[offset + i] * mul;
        }
        mul *= 128;
        if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
        return val;
      };
      Buffer3.prototype.readIntBE = function readIntBE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let i = byteLength2;
        let mul = 1;
        let val = this[offset + --i];
        while (i > 0 && (mul *= 256)) {
          val += this[offset + --i] * mul;
        }
        mul *= 128;
        if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
        return val;
      };
      Buffer3.prototype.readInt8 = function readInt8(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 1, this.length);
        if (!(this[offset] & 128)) return this[offset];
        return (255 - this[offset] + 1) * -1;
      };
      Buffer3.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        const val = this[offset] | this[offset + 1] << 8;
        return val & 32768 ? val | 4294901760 : val;
      };
      Buffer3.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        const val = this[offset + 1] | this[offset] << 8;
        return val & 32768 ? val | 4294901760 : val;
      };
      Buffer3.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
      };
      Buffer3.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
      };
      Buffer3.prototype.readBigInt64LE = defineBigIntMethod(function readBigInt64LE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const val = this[offset + 4] + this[offset + 5] * 2 ** 8 + this[offset + 6] * 2 ** 16 + (last << 24);
        return (BigInt(val) << BigInt(32)) + BigInt(first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24);
      });
      Buffer3.prototype.readBigInt64BE = defineBigIntMethod(function readBigInt64BE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const val = (first << 24) + // Overflow
        this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
        return (BigInt(val) << BigInt(32)) + BigInt(this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last);
      });
      Buffer3.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return ieee754.read(this, offset, true, 23, 4);
      };
      Buffer3.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return ieee754.read(this, offset, false, 23, 4);
      };
      Buffer3.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 8, this.length);
        return ieee754.read(this, offset, true, 52, 8);
      };
      Buffer3.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 8, this.length);
        return ieee754.read(this, offset, false, 52, 8);
      };
      function checkInt(buf, value, offset, ext, max, min) {
        if (!Buffer3.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance');
        if (value > max || value < min) throw new RangeError('"value" argument is out of bounds');
        if (offset + ext > buf.length) throw new RangeError("Index out of range");
      }
      Buffer3.prototype.writeUintLE = Buffer3.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
          checkInt(this, value, offset, byteLength2, maxBytes, 0);
        }
        let mul = 1;
        let i = 0;
        this[offset] = value & 255;
        while (++i < byteLength2 && (mul *= 256)) {
          this[offset + i] = value / mul & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeUintBE = Buffer3.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
          checkInt(this, value, offset, byteLength2, maxBytes, 0);
        }
        let i = byteLength2 - 1;
        let mul = 1;
        this[offset + i] = value & 255;
        while (--i >= 0 && (mul *= 256)) {
          this[offset + i] = value / mul & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeUint8 = Buffer3.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 1, 255, 0);
        this[offset] = value & 255;
        return offset + 1;
      };
      Buffer3.prototype.writeUint16LE = Buffer3.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        return offset + 2;
      };
      Buffer3.prototype.writeUint16BE = Buffer3.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
        this[offset] = value >>> 8;
        this[offset + 1] = value & 255;
        return offset + 2;
      };
      Buffer3.prototype.writeUint32LE = Buffer3.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
        this[offset + 3] = value >>> 24;
        this[offset + 2] = value >>> 16;
        this[offset + 1] = value >>> 8;
        this[offset] = value & 255;
        return offset + 4;
      };
      Buffer3.prototype.writeUint32BE = Buffer3.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
        this[offset] = value >>> 24;
        this[offset + 1] = value >>> 16;
        this[offset + 2] = value >>> 8;
        this[offset + 3] = value & 255;
        return offset + 4;
      };
      function wrtBigUInt64LE(buf, value, offset, min, max) {
        checkIntBI(value, min, max, buf, offset, 7);
        let lo = Number(value & BigInt(4294967295));
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        let hi = Number(value >> BigInt(32) & BigInt(4294967295));
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        return offset;
      }
      function wrtBigUInt64BE(buf, value, offset, min, max) {
        checkIntBI(value, min, max, buf, offset, 7);
        let lo = Number(value & BigInt(4294967295));
        buf[offset + 7] = lo;
        lo = lo >> 8;
        buf[offset + 6] = lo;
        lo = lo >> 8;
        buf[offset + 5] = lo;
        lo = lo >> 8;
        buf[offset + 4] = lo;
        let hi = Number(value >> BigInt(32) & BigInt(4294967295));
        buf[offset + 3] = hi;
        hi = hi >> 8;
        buf[offset + 2] = hi;
        hi = hi >> 8;
        buf[offset + 1] = hi;
        hi = hi >> 8;
        buf[offset] = hi;
        return offset + 8;
      }
      Buffer3.prototype.writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE(value, offset = 0) {
        return wrtBigUInt64LE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
      });
      Buffer3.prototype.writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE(value, offset = 0) {
        return wrtBigUInt64BE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
      });
      Buffer3.prototype.writeIntLE = function writeIntLE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          const limit = Math.pow(2, 8 * byteLength2 - 1);
          checkInt(this, value, offset, byteLength2, limit - 1, -limit);
        }
        let i = 0;
        let mul = 1;
        let sub = 0;
        this[offset] = value & 255;
        while (++i < byteLength2 && (mul *= 256)) {
          if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
            sub = 1;
          }
          this[offset + i] = (value / mul >> 0) - sub & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeIntBE = function writeIntBE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          const limit = Math.pow(2, 8 * byteLength2 - 1);
          checkInt(this, value, offset, byteLength2, limit - 1, -limit);
        }
        let i = byteLength2 - 1;
        let mul = 1;
        let sub = 0;
        this[offset + i] = value & 255;
        while (--i >= 0 && (mul *= 256)) {
          if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
            sub = 1;
          }
          this[offset + i] = (value / mul >> 0) - sub & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 1, 127, -128);
        if (value < 0) value = 255 + value + 1;
        this[offset] = value & 255;
        return offset + 1;
      };
      Buffer3.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        return offset + 2;
      };
      Buffer3.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
        this[offset] = value >>> 8;
        this[offset + 1] = value & 255;
        return offset + 2;
      };
      Buffer3.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        this[offset + 2] = value >>> 16;
        this[offset + 3] = value >>> 24;
        return offset + 4;
      };
      Buffer3.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
        if (value < 0) value = 4294967295 + value + 1;
        this[offset] = value >>> 24;
        this[offset + 1] = value >>> 16;
        this[offset + 2] = value >>> 8;
        this[offset + 3] = value & 255;
        return offset + 4;
      };
      Buffer3.prototype.writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE(value, offset = 0) {
        return wrtBigUInt64LE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
      });
      Buffer3.prototype.writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE(value, offset = 0) {
        return wrtBigUInt64BE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
      });
      function checkIEEE754(buf, value, offset, ext, max, min) {
        if (offset + ext > buf.length) throw new RangeError("Index out of range");
        if (offset < 0) throw new RangeError("Index out of range");
      }
      function writeFloat(buf, value, offset, littleEndian, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          checkIEEE754(buf, value, offset, 4, 34028234663852886e22, -34028234663852886e22);
        }
        ieee754.write(buf, value, offset, littleEndian, 23, 4);
        return offset + 4;
      }
      Buffer3.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
        return writeFloat(this, value, offset, true, noAssert);
      };
      Buffer3.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
        return writeFloat(this, value, offset, false, noAssert);
      };
      function writeDouble(buf, value, offset, littleEndian, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          checkIEEE754(buf, value, offset, 8, 17976931348623157e292, -17976931348623157e292);
        }
        ieee754.write(buf, value, offset, littleEndian, 52, 8);
        return offset + 8;
      }
      Buffer3.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
        return writeDouble(this, value, offset, true, noAssert);
      };
      Buffer3.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
        return writeDouble(this, value, offset, false, noAssert);
      };
      Buffer3.prototype.copy = function copy(target, targetStart, start, end) {
        if (!Buffer3.isBuffer(target)) throw new TypeError("argument should be a Buffer");
        if (!start) start = 0;
        if (!end && end !== 0) end = this.length;
        if (targetStart >= target.length) targetStart = target.length;
        if (!targetStart) targetStart = 0;
        if (end > 0 && end < start) end = start;
        if (end === start) return 0;
        if (target.length === 0 || this.length === 0) return 0;
        if (targetStart < 0) {
          throw new RangeError("targetStart out of bounds");
        }
        if (start < 0 || start >= this.length) throw new RangeError("Index out of range");
        if (end < 0) throw new RangeError("sourceEnd out of bounds");
        if (end > this.length) end = this.length;
        if (target.length - targetStart < end - start) {
          end = target.length - targetStart + start;
        }
        const len = end - start;
        if (this === target && typeof Uint8Array.prototype.copyWithin === "function") {
          this.copyWithin(targetStart, start, end);
        } else {
          Uint8Array.prototype.set.call(
            target,
            this.subarray(start, end),
            targetStart
          );
        }
        return len;
      };
      Buffer3.prototype.fill = function fill(val, start, end, encoding) {
        if (typeof val === "string") {
          if (typeof start === "string") {
            encoding = start;
            start = 0;
            end = this.length;
          } else if (typeof end === "string") {
            encoding = end;
            end = this.length;
          }
          if (encoding !== void 0 && typeof encoding !== "string") {
            throw new TypeError("encoding must be a string");
          }
          if (typeof encoding === "string" && !Buffer3.isEncoding(encoding)) {
            throw new TypeError("Unknown encoding: " + encoding);
          }
          if (val.length === 1) {
            const code = val.charCodeAt(0);
            if (encoding === "utf8" && code < 128 || encoding === "latin1") {
              val = code;
            }
          }
        } else if (typeof val === "number") {
          val = val & 255;
        } else if (typeof val === "boolean") {
          val = Number(val);
        }
        if (start < 0 || this.length < start || this.length < end) {
          throw new RangeError("Out of range index");
        }
        if (end <= start) {
          return this;
        }
        start = start >>> 0;
        end = end === void 0 ? this.length : end >>> 0;
        if (!val) val = 0;
        let i;
        if (typeof val === "number") {
          for (i = start; i < end; ++i) {
            this[i] = val;
          }
        } else {
          const bytes = Buffer3.isBuffer(val) ? val : Buffer3.from(val, encoding);
          const len = bytes.length;
          if (len === 0) {
            throw new TypeError('The value "' + val + '" is invalid for argument "value"');
          }
          for (i = 0; i < end - start; ++i) {
            this[i + start] = bytes[i % len];
          }
        }
        return this;
      };
      var errors = {};
      function E(sym, getMessage, Base) {
        errors[sym] = class NodeError extends Base {
          constructor() {
            super();
            Object.defineProperty(this, "message", {
              value: getMessage.apply(this, arguments),
              writable: true,
              configurable: true
            });
            this.name = `${this.name} [${sym}]`;
            this.stack;
            delete this.name;
          }
          get code() {
            return sym;
          }
          set code(value) {
            Object.defineProperty(this, "code", {
              configurable: true,
              enumerable: true,
              value,
              writable: true
            });
          }
          toString() {
            return `${this.name} [${sym}]: ${this.message}`;
          }
        };
      }
      E(
        "ERR_BUFFER_OUT_OF_BOUNDS",
        function(name) {
          if (name) {
            return `${name} is outside of buffer bounds`;
          }
          return "Attempt to access memory outside buffer bounds";
        },
        RangeError
      );
      E(
        "ERR_INVALID_ARG_TYPE",
        function(name, actual) {
          return `The "${name}" argument must be of type number. Received type ${typeof actual}`;
        },
        TypeError
      );
      E(
        "ERR_OUT_OF_RANGE",
        function(str, range, input) {
          let msg = `The value of "${str}" is out of range.`;
          let received = input;
          if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
            received = addNumericalSeparator(String(input));
          } else if (typeof input === "bigint") {
            received = String(input);
            if (input > BigInt(2) ** BigInt(32) || input < -(BigInt(2) ** BigInt(32))) {
              received = addNumericalSeparator(received);
            }
            received += "n";
          }
          msg += ` It must be ${range}. Received ${received}`;
          return msg;
        },
        RangeError
      );
      function addNumericalSeparator(val) {
        let res = "";
        let i = val.length;
        const start = val[0] === "-" ? 1 : 0;
        for (; i >= start + 4; i -= 3) {
          res = `_${val.slice(i - 3, i)}${res}`;
        }
        return `${val.slice(0, i)}${res}`;
      }
      function checkBounds(buf, offset, byteLength2) {
        validateNumber(offset, "offset");
        if (buf[offset] === void 0 || buf[offset + byteLength2] === void 0) {
          boundsError(offset, buf.length - (byteLength2 + 1));
        }
      }
      function checkIntBI(value, min, max, buf, offset, byteLength2) {
        if (value > max || value < min) {
          const n = typeof min === "bigint" ? "n" : "";
          let range;
          if (byteLength2 > 3) {
            if (min === 0 || min === BigInt(0)) {
              range = `>= 0${n} and < 2${n} ** ${(byteLength2 + 1) * 8}${n}`;
            } else {
              range = `>= -(2${n} ** ${(byteLength2 + 1) * 8 - 1}${n}) and < 2 ** ${(byteLength2 + 1) * 8 - 1}${n}`;
            }
          } else {
            range = `>= ${min}${n} and <= ${max}${n}`;
          }
          throw new errors.ERR_OUT_OF_RANGE("value", range, value);
        }
        checkBounds(buf, offset, byteLength2);
      }
      function validateNumber(value, name) {
        if (typeof value !== "number") {
          throw new errors.ERR_INVALID_ARG_TYPE(name, "number", value);
        }
      }
      function boundsError(value, length, type) {
        if (Math.floor(value) !== value) {
          validateNumber(value, type);
          throw new errors.ERR_OUT_OF_RANGE(type || "offset", "an integer", value);
        }
        if (length < 0) {
          throw new errors.ERR_BUFFER_OUT_OF_BOUNDS();
        }
        throw new errors.ERR_OUT_OF_RANGE(
          type || "offset",
          `>= ${type ? 1 : 0} and <= ${length}`,
          value
        );
      }
      var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;
      function base64clean(str) {
        str = str.split("=")[0];
        str = str.trim().replace(INVALID_BASE64_RE, "");
        if (str.length < 2) return "";
        while (str.length % 4 !== 0) {
          str = str + "=";
        }
        return str;
      }
      function utf8ToBytes(string, units) {
        units = units || Infinity;
        let codePoint;
        const length = string.length;
        let leadSurrogate = null;
        const bytes = [];
        for (let i = 0; i < length; ++i) {
          codePoint = string.charCodeAt(i);
          if (codePoint > 55295 && codePoint < 57344) {
            if (!leadSurrogate) {
              if (codePoint > 56319) {
                if ((units -= 3) > -1) bytes.push(239, 191, 189);
                continue;
              } else if (i + 1 === length) {
                if ((units -= 3) > -1) bytes.push(239, 191, 189);
                continue;
              }
              leadSurrogate = codePoint;
              continue;
            }
            if (codePoint < 56320) {
              if ((units -= 3) > -1) bytes.push(239, 191, 189);
              leadSurrogate = codePoint;
              continue;
            }
            codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536;
          } else if (leadSurrogate) {
            if ((units -= 3) > -1) bytes.push(239, 191, 189);
          }
          leadSurrogate = null;
          if (codePoint < 128) {
            if ((units -= 1) < 0) break;
            bytes.push(codePoint);
          } else if (codePoint < 2048) {
            if ((units -= 2) < 0) break;
            bytes.push(
              codePoint >> 6 | 192,
              codePoint & 63 | 128
            );
          } else if (codePoint < 65536) {
            if ((units -= 3) < 0) break;
            bytes.push(
              codePoint >> 12 | 224,
              codePoint >> 6 & 63 | 128,
              codePoint & 63 | 128
            );
          } else if (codePoint < 1114112) {
            if ((units -= 4) < 0) break;
            bytes.push(
              codePoint >> 18 | 240,
              codePoint >> 12 & 63 | 128,
              codePoint >> 6 & 63 | 128,
              codePoint & 63 | 128
            );
          } else {
            throw new Error("Invalid code point");
          }
        }
        return bytes;
      }
      function asciiToBytes(str) {
        const byteArray = [];
        for (let i = 0; i < str.length; ++i) {
          byteArray.push(str.charCodeAt(i) & 255);
        }
        return byteArray;
      }
      function utf16leToBytes(str, units) {
        let c, hi, lo;
        const byteArray = [];
        for (let i = 0; i < str.length; ++i) {
          if ((units -= 2) < 0) break;
          c = str.charCodeAt(i);
          hi = c >> 8;
          lo = c % 256;
          byteArray.push(lo);
          byteArray.push(hi);
        }
        return byteArray;
      }
      function base64ToBytes(str) {
        return base64.toByteArray(base64clean(str));
      }
      function blitBuffer(src, dst, offset, length) {
        let i;
        for (i = 0; i < length; ++i) {
          if (i + offset >= dst.length || i >= src.length) break;
          dst[i + offset] = src[i];
        }
        return i;
      }
      function isInstance(obj, type) {
        return obj instanceof type || obj != null && obj.constructor != null && obj.constructor.name != null && obj.constructor.name === type.name;
      }
      function numberIsNaN(obj) {
        return obj !== obj;
      }
      var hexSliceLookupTable = (function() {
        const alphabet = "0123456789abcdef";
        const table = new Array(256);
        for (let i = 0; i < 16; ++i) {
          const i16 = i * 16;
          for (let j = 0; j < 16; ++j) {
            table[i16 + j] = alphabet[i] + alphabet[j];
          }
        }
        return table;
      })();
      function defineBigIntMethod(fn) {
        return typeof BigInt === "undefined" ? BufferBigIntNotDefined : fn;
      }
      function BufferBigIntNotDefined() {
        throw new Error("BigInt not supported");
      }
    }
  });

  // node_modules/process/browser.js
  var require_browser = __commonJS({
    "node_modules/process/browser.js"(exports, module) {
      init_define_process_env();
      init_polyfills();
      var process2 = module.exports = {};
      var cachedSetTimeout;
      var cachedClearTimeout;
      function defaultSetTimout() {
        throw new Error("setTimeout has not been defined");
      }
      function defaultClearTimeout() {
        throw new Error("clearTimeout has not been defined");
      }
      (function() {
        try {
          if (typeof setTimeout === "function") {
            cachedSetTimeout = setTimeout;
          } else {
            cachedSetTimeout = defaultSetTimout;
          }
        } catch (e) {
          cachedSetTimeout = defaultSetTimout;
        }
        try {
          if (typeof clearTimeout === "function") {
            cachedClearTimeout = clearTimeout;
          } else {
            cachedClearTimeout = defaultClearTimeout;
          }
        } catch (e) {
          cachedClearTimeout = defaultClearTimeout;
        }
      })();
      function runTimeout(fun) {
        if (cachedSetTimeout === setTimeout) {
          return setTimeout(fun, 0);
        }
        if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
          cachedSetTimeout = setTimeout;
          return setTimeout(fun, 0);
        }
        try {
          return cachedSetTimeout(fun, 0);
        } catch (e) {
          try {
            return cachedSetTimeout.call(null, fun, 0);
          } catch (e2) {
            return cachedSetTimeout.call(this, fun, 0);
          }
        }
      }
      function runClearTimeout(marker) {
        if (cachedClearTimeout === clearTimeout) {
          return clearTimeout(marker);
        }
        if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
          cachedClearTimeout = clearTimeout;
          return clearTimeout(marker);
        }
        try {
          return cachedClearTimeout(marker);
        } catch (e) {
          try {
            return cachedClearTimeout.call(null, marker);
          } catch (e2) {
            return cachedClearTimeout.call(this, marker);
          }
        }
      }
      var queue = [];
      var draining = false;
      var currentQueue;
      var queueIndex = -1;
      function cleanUpNextTick() {
        if (!draining || !currentQueue) {
          return;
        }
        draining = false;
        if (currentQueue.length) {
          queue = currentQueue.concat(queue);
        } else {
          queueIndex = -1;
        }
        if (queue.length) {
          drainQueue();
        }
      }
      function drainQueue() {
        if (draining) {
          return;
        }
        var timeout = runTimeout(cleanUpNextTick);
        draining = true;
        var len = queue.length;
        while (len) {
          currentQueue = queue;
          queue = [];
          while (++queueIndex < len) {
            if (currentQueue) {
              currentQueue[queueIndex].run();
            }
          }
          queueIndex = -1;
          len = queue.length;
        }
        currentQueue = null;
        draining = false;
        runClearTimeout(timeout);
      }
      process2.nextTick = function(fun) {
        var args = new Array(arguments.length - 1);
        if (arguments.length > 1) {
          for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
          }
        }
        queue.push(new Item(fun, args));
        if (queue.length === 1 && !draining) {
          runTimeout(drainQueue);
        }
      };
      function Item(fun, array) {
        this.fun = fun;
        this.array = array;
      }
      Item.prototype.run = function() {
        this.fun.apply(null, this.array);
      };
      process2.title = "browser";
      process2.browser = true;
      process2.env = {};
      process2.argv = [];
      process2.version = "";
      process2.versions = {};
      function noop() {
      }
      process2.on = noop;
      process2.addListener = noop;
      process2.once = noop;
      process2.off = noop;
      process2.removeListener = noop;
      process2.removeAllListeners = noop;
      process2.emit = noop;
      process2.prependListener = noop;
      process2.prependOnceListener = noop;
      process2.listeners = function(name) {
        return [];
      };
      process2.binding = function(name) {
        throw new Error("process.binding is not supported");
      };
      process2.cwd = function() {
        return "/";
      };
      process2.chdir = function(dir) {
        throw new Error("process.chdir is not supported");
      };
      process2.umask = function() {
        return 0;
      };
    }
  });

  // src/polyfills.ts
  var import_buffer, import_process;
  var init_polyfills = __esm({
    "src/polyfills.ts"() {
      "use strict";
      import_buffer = __toESM(require_buffer());
      import_process = __toESM(require_browser());
      (function() {
        var g;
        try {
          g = typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : {};
        } catch (e) {
          g = {};
        }
        try {
          g.Buffer = import_buffer.Buffer;
          g.process = import_process.default;
        } catch (e) {
        }
        if (typeof g.require !== "function") {
          g.require = function(moduleName) {
            switch (moduleName) {
              case "react":
                return g.React;
              case "react-dom":
              case "react-dom/client":
                return g.ReactDOM;
              case "@excalidraw/excalidraw":
                return g.ExcalidrawLib;
              case "mermaid":
                return g.mermaid;
              default:
                throw new Error("Cannot find module '" + moduleName + "'");
            }
          };
        }
        function safeShim(name) {
          try {
            var existing = g ? g[name] : void 0;
            if (!existing) {
              var F = function() {
              };
              F.prototype = {};
              try {
                g[name] = F;
              } catch (e) {
              }
              existing = g ? g[name] : F;
            }
            if (existing && (typeof existing === "function" || typeof existing === "object" && existing !== null) && !("prototype" in existing)) {
              try {
                existing.prototype = {};
              } catch (e) {
              }
            }
          } catch (e) {
          }
        }
        safeShim("Element");
        safeShim("Path2D");
        safeShim("SVGPathSeg");
        try {
          if (typeof Array !== "undefined" && Array.prototype && typeof Array.prototype.at !== "function") {
            Object.defineProperty(Array.prototype, "at", {
              value: function(n) {
                n = Math.trunc(n) || 0;
                if (n < 0) n += this.length;
                if (n < 0 || n >= this.length) return void 0;
                return this[n];
              },
              writable: true,
              configurable: true
            });
          }
        } catch (e) {
        }
      })();
    }
  });

  // node_modules/@excalidraw/markdown-to-text/dist/index.js
  var require_dist = __commonJS({
    "node_modules/@excalidraw/markdown-to-text/dist/index.js"(exports) {
      "use strict";
      init_define_process_env();
      init_polyfills();
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.removeMarkdown = void 0;
      var removeMarkdown2 = function(markdown, options) {
        if (options === void 0) {
          options = {
            listUnicodeChar: ""
          };
        }
        options = options || {};
        options.listUnicodeChar = options.hasOwnProperty("listUnicodeChar") ? options.listUnicodeChar : false;
        options.stripListLeaders = options.hasOwnProperty("stripListLeaders") ? options.stripListLeaders : true;
        options.gfm = options.hasOwnProperty("gfm") ? options.gfm : true;
        options.useImgAltText = options.hasOwnProperty("useImgAltText") ? options.useImgAltText : true;
        options.preserveLinks = options.hasOwnProperty("preserveLinks") ? options.preserveLinks : false;
        var output = markdown || "";
        output = output.replace(/^(-\s*?|\*\s*?|_\s*?){3,}\s*$/gm, "");
        try {
          if (options.stripListLeaders) {
            if (options.listUnicodeChar)
              output = output.replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm, options.listUnicodeChar + " $1");
            else
              output = output.replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm, "$1");
          }
          if (options.gfm) {
            output = output.replace(/\n={2,}/g, "\n").replace(/~{3}.*\n/g, "").replace(/~~/g, "").replace(/`{3}.*\n/g, "");
          }
          if (options.preserveLinks) {
            output = output.replace(/\[(.*?)\][\[\(](.*?)[\]\)]/g, "$1 ($2)");
          }
          output = output.replace(/<[^>]*>/g, "").replace(/^[=\-]{2,}\s*$/g, "").replace(/\[\^.+?\](\: .*?$)?/g, "").replace(/\s{0,2}\[.*?\]: .*?$/g, "").replace(/\!\[(.*?)\][\[\(].*?[\]\)]/g, options.useImgAltText ? "$1" : "").replace(/\[(.*?)\][\[\(].*?[\]\)]/g, "$1").replace(/^\s{0,3}>\s?/g, "").replace(/(^|\n)\s{0,3}>\s?/g, "\n\n").replace(/^\s{1,2}\[(.*?)\]: (\S+)( ".*?")?\s*$/g, "").replace(/^(\n)?\s{0,}#{1,6}\s+| {0,}(\n)?\s{0,}#{0,} {0,}(\n)?\s{0,}$/gm, "$1$2$3").replace(/([\*_]{1,3})(\S.*?\S{0,1})\1/g, "$2").replace(/([\*_]{1,3})(\S.*?\S{0,1})\1/g, "$2").replace(/(`{3,})(.*?)\1/gm, "$2").replace(/`(.+?)`/g, "$1").replace(/\n{2,}/g, "\n\n");
        } catch (e) {
          console.error(e);
          return markdown;
        }
        return output;
      };
      exports.removeMarkdown = removeMarkdown2;
    }
  });

  // src/draw-editor/index.tsx
  init_define_process_env();
  init_polyfills();

  // src/react-shim.ts
  init_define_process_env();
  init_polyfills();
  var React = window.React;
  var useState = React == null ? void 0 : React.useState;
  var useEffect = React == null ? void 0 : React.useEffect;
  var useCallback = React == null ? void 0 : React.useCallback;
  var useMemo = React == null ? void 0 : React.useMemo;
  var useRef = React == null ? void 0 : React.useRef;
  var useImperativeHandle = React == null ? void 0 : React.useImperativeHandle;
  var forwardRef = React == null ? void 0 : React.forwardRef;
  var createContext = React == null ? void 0 : React.createContext;
  var useContext = React == null ? void 0 : React.useContext;
  var useDebugValue = React == null ? void 0 : React.useDebugValue;
  var useLayoutEffect = React == null ? void 0 : React.useLayoutEffect;
  var createRef = React == null ? void 0 : React.createRef;
  var version = React == null ? void 0 : React.version;
  var memo = React == null ? void 0 : React.memo;
  var Fragment = React == null ? void 0 : React.Fragment;
  var createElement = React == null ? void 0 : React.createElement;
  var cloneElement = React == null ? void 0 : React.cloneElement;
  var Children = React == null ? void 0 : React.Children;

  // src/react-dom-shim.ts
  init_define_process_env();
  init_polyfills();
  var ReactDOM = window.ReactDOM;
  var createRoot = ReactDOM == null ? void 0 : ReactDOM.createRoot;
  var hydrateRoot = ReactDOM == null ? void 0 : ReactDOM.hydrateRoot;
  var flushSync = ReactDOM == null ? void 0 : ReactDOM.flushSync;
  var findDOMNode = ReactDOM == null ? void 0 : ReactDOM.findDOMNode;
  var unmountComponentAtNode = ReactDOM == null ? void 0 : ReactDOM.unmountComponentAtNode;

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/index.js
  init_define_process_env();
  init_polyfills();

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/constants.js
  init_define_process_env();
  init_polyfills();
  var DEFAULT_FONT_SIZE = 20;
  var SVG_TO_SHAPE_MAPPER = {
    rect: "rectangle",
    circle: "ellipse"
  };
  var MERMAID_CONFIG = {
    startOnLoad: false,
    flowchart: { curve: "linear" },
    themeVariables: {
      fontSize: `${DEFAULT_FONT_SIZE}px`
    },
    maxEdges: 500,
    maxTextSize: 5e4
  };

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/graphToExcalidraw.js
  init_define_process_env();
  init_polyfills();

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/converter/types/flowchart.js
  init_define_process_env();
  init_polyfills();

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/converter/GraphConverter.js
  init_define_process_env();
  init_polyfills();
  var GraphConverter = class {
    constructor({ converter }) {
      this.convert = (graph, config) => {
        return this.converter(graph, {
          ...config,
          fontSize: config.fontSize || DEFAULT_FONT_SIZE
        });
      };
      this.converter = converter;
    }
  };

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/converter/helpers.js
  init_define_process_env();
  init_polyfills();

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/interfaces.js
  init_define_process_env();
  init_polyfills();
  var VERTEX_TYPE;
  (function(VERTEX_TYPE2) {
    VERTEX_TYPE2["ROUND"] = "round";
    VERTEX_TYPE2["STADIUM"] = "stadium";
    VERTEX_TYPE2["DOUBLECIRCLE"] = "doublecircle";
    VERTEX_TYPE2["CIRCLE"] = "circle";
    VERTEX_TYPE2["DIAMOND"] = "diamond";
  })(VERTEX_TYPE || (VERTEX_TYPE = {}));
  var LABEL_STYLE_PROPERTY;
  (function(LABEL_STYLE_PROPERTY2) {
    LABEL_STYLE_PROPERTY2["COLOR"] = "color";
  })(LABEL_STYLE_PROPERTY || (LABEL_STYLE_PROPERTY = {}));
  var CONTAINER_STYLE_PROPERTY;
  (function(CONTAINER_STYLE_PROPERTY2) {
    CONTAINER_STYLE_PROPERTY2["FILL"] = "fill";
    CONTAINER_STYLE_PROPERTY2["STROKE"] = "stroke";
    CONTAINER_STYLE_PROPERTY2["STROKE_WIDTH"] = "stroke-width";
    CONTAINER_STYLE_PROPERTY2["STROKE_DASHARRAY"] = "stroke-dasharray";
  })(CONTAINER_STYLE_PROPERTY || (CONTAINER_STYLE_PROPERTY = {}));

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/converter/helpers.js
  var import_markdown_to_text = __toESM(require_dist(), 1);
  var MERMAID_EDGE_TYPE_MAPPER = {
    arrow_circle: {
      endArrowhead: "dot"
    },
    arrow_cross: {
      endArrowhead: "bar"
    },
    arrow_open: {
      endArrowhead: null,
      startArrowhead: null
    },
    double_arrow_circle: {
      endArrowhead: "dot",
      startArrowhead: "dot"
    },
    double_arrow_cross: {
      endArrowhead: "bar",
      startArrowhead: "bar"
    },
    double_arrow_point: {
      endArrowhead: "arrow",
      startArrowhead: "arrow"
    }
  };
  var computeExcalidrawArrowType = (mermaidArrowType) => {
    return MERMAID_EDGE_TYPE_MAPPER[mermaidArrowType];
  };
  var getText = (element) => {
    let text = element.text;
    if (element.labelType === "markdown") {
      text = (0, import_markdown_to_text.removeMarkdown)(element.text);
    }
    return removeFontAwesomeIcons(text);
  };
  var removeFontAwesomeIcons = (input) => {
    const fontAwesomeRegex = /\s?(fa|fab):[a-zA-Z0-9-]+/g;
    return input.replace(fontAwesomeRegex, "");
  };
  var computeExcalidrawVertexStyle = (style) => {
    const excalidrawProperty = {};
    Object.keys(style).forEach((property) => {
      var _a;
      switch (property) {
        case CONTAINER_STYLE_PROPERTY.FILL: {
          excalidrawProperty.backgroundColor = style[property];
          excalidrawProperty.fillStyle = "solid";
          break;
        }
        case CONTAINER_STYLE_PROPERTY.STROKE: {
          excalidrawProperty.strokeColor = style[property];
          break;
        }
        case CONTAINER_STYLE_PROPERTY.STROKE_WIDTH: {
          excalidrawProperty.strokeWidth = Number((_a = style[property]) == null ? void 0 : _a.split("px")[0]);
          break;
        }
        case CONTAINER_STYLE_PROPERTY.STROKE_DASHARRAY: {
          excalidrawProperty.strokeStyle = "dashed";
          break;
        }
      }
    });
    return excalidrawProperty;
  };
  var computeExcalidrawVertexLabelStyle = (style) => {
    const excalidrawProperty = {};
    Object.keys(style).forEach((property) => {
      switch (property) {
        case LABEL_STYLE_PROPERTY.COLOR: {
          excalidrawProperty.strokeColor = style[property];
          break;
        }
      }
    });
    return excalidrawProperty;
  };

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/converter/types/flowchart.js
  var computeGroupIds = (graph) => {
    const tree = {};
    graph.subGraphs.map((subGraph) => {
      subGraph.nodeIds.forEach((nodeId) => {
        tree[subGraph.id] = {
          id: subGraph.id,
          parent: null,
          isLeaf: false
        };
        tree[nodeId] = {
          id: nodeId,
          parent: subGraph.id,
          isLeaf: graph.vertices[nodeId] !== void 0
        };
      });
    });
    const mapper = {};
    [...Object.keys(graph.vertices), ...graph.subGraphs.map((c) => c.id)].forEach((id) => {
      if (!tree[id]) {
        return;
      }
      let curr = tree[id];
      const groupIds = [];
      if (!curr.isLeaf) {
        groupIds.push(`subgraph_group_${curr.id}`);
      }
      while (true) {
        if (curr.parent) {
          groupIds.push(`subgraph_group_${curr.parent}`);
          curr = tree[curr.parent];
        } else {
          break;
        }
      }
      mapper[id] = groupIds;
    });
    return {
      getGroupIds: (elementId) => {
        return mapper[elementId] || [];
      },
      getParentId: (elementId) => {
        return tree[elementId] ? tree[elementId].parent : null;
      }
    };
  };
  var FlowchartToExcalidrawSkeletonConverter = new GraphConverter({
    converter: (graph, options) => {
      const elements = [];
      const fontSize = options.fontSize;
      const { getGroupIds, getParentId } = computeGroupIds(graph);
      graph.subGraphs.reverse().forEach((subGraph) => {
        const groupIds = getGroupIds(subGraph.id);
        const containerElement = {
          id: subGraph.id,
          type: "rectangle",
          groupIds,
          x: subGraph.x,
          y: subGraph.y,
          width: subGraph.width,
          height: subGraph.height,
          label: {
            groupIds,
            text: getText(subGraph),
            fontSize,
            verticalAlign: "top"
          }
        };
        elements.push(containerElement);
      });
      Object.values(graph.vertices).forEach((vertex) => {
        if (!vertex) {
          return;
        }
        const groupIds = getGroupIds(vertex.id);
        const containerStyle = computeExcalidrawVertexStyle(vertex.containerStyle);
        const labelStyle = computeExcalidrawVertexLabelStyle(vertex.labelStyle);
        let containerElement = {
          id: vertex.id,
          type: "rectangle",
          groupIds,
          x: vertex.x,
          y: vertex.y,
          width: vertex.width,
          height: vertex.height,
          strokeWidth: 2,
          label: {
            groupIds,
            text: getText(vertex),
            fontSize,
            ...labelStyle
          },
          link: vertex.link || null,
          ...containerStyle
        };
        switch (vertex.type) {
          case VERTEX_TYPE.STADIUM: {
            containerElement = { ...containerElement, roundness: { type: 3 } };
            break;
          }
          case VERTEX_TYPE.ROUND: {
            containerElement = { ...containerElement, roundness: { type: 3 } };
            break;
          }
          case VERTEX_TYPE.DOUBLECIRCLE: {
            const CIRCLE_MARGIN = 5;
            groupIds.push(`doublecircle_${vertex.id}}`);
            const innerCircle = {
              type: "ellipse",
              groupIds,
              x: vertex.x + CIRCLE_MARGIN,
              y: vertex.y + CIRCLE_MARGIN,
              width: vertex.width - CIRCLE_MARGIN * 2,
              height: vertex.height - CIRCLE_MARGIN * 2,
              strokeWidth: 2,
              roundness: { type: 3 },
              label: {
                groupIds,
                text: getText(vertex),
                fontSize
              }
            };
            containerElement = { ...containerElement, groupIds, type: "ellipse" };
            elements.push(innerCircle);
            break;
          }
          case VERTEX_TYPE.CIRCLE: {
            containerElement.type = "ellipse";
            break;
          }
          case VERTEX_TYPE.DIAMOND: {
            containerElement.type = "diamond";
            break;
          }
        }
        elements.push(containerElement);
      });
      graph.edges.forEach((edge) => {
        let groupIds = [];
        const startParentId = getParentId(edge.start);
        const endParentId = getParentId(edge.end);
        if (startParentId && startParentId === endParentId) {
          groupIds = getGroupIds(startParentId);
        }
        const { startX, startY, reflectionPoints } = edge;
        const points = reflectionPoints.map((point) => [
          point.x - reflectionPoints[0].x,
          point.y - reflectionPoints[0].y
        ]);
        const arrowType = computeExcalidrawArrowType(edge.type || "arrow_point");
        const arrowId = `${edge.start}_${edge.end}`;
        const containerElement = {
          id: arrowId,
          type: "arrow",
          groupIds,
          x: startX,
          y: startY,
          // 4 and 2 are the Excalidraw's stroke width of thick and thin respectively
          // TODO: use constant exported from Excalidraw package
          strokeWidth: edge.stroke === "thick" ? 4 : 2,
          strokeStyle: edge.stroke === "dotted" ? "dashed" : void 0,
          points,
          ...edge.text ? { label: { text: getText(edge), fontSize, groupIds } } : {},
          roundness: {
            type: 2
          },
          ...arrowType
        };
        const startVertex = elements.find((e) => e.id === edge.start);
        const endVertex = elements.find((e) => e.id === edge.end);
        if (!startVertex || !endVertex) {
          return;
        }
        containerElement.start = {
          id: startVertex.id || ""
        };
        containerElement.end = {
          id: endVertex.id || ""
        };
        elements.push(containerElement);
      });
      return {
        elements
      };
    }
  });

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/converter/types/graphImage.js
  init_define_process_env();
  init_polyfills();

  // node_modules/nanoid/index.browser.js
  init_define_process_env();
  init_polyfills();
  var nanoid = (size = 21) => crypto.getRandomValues(new Uint8Array(size)).reduce((id, byte) => {
    byte &= 63;
    if (byte < 36) {
      id += byte.toString(36);
    } else if (byte < 62) {
      id += (byte - 26).toString(36).toUpperCase();
    } else if (byte > 62) {
      id += "-";
    } else {
      id += "_";
    }
    return id;
  }, "");

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/converter/types/graphImage.js
  var GraphImageConverter = new GraphConverter({
    converter: (graph) => {
      const imageId = nanoid();
      const { width, height } = graph;
      const imageElement = {
        type: "image",
        x: 0,
        y: 0,
        width,
        height,
        status: "saved",
        fileId: imageId
      };
      const files = {
        [imageId]: {
          id: imageId,
          mimeType: graph.mimeType,
          dataURL: graph.dataURL
        }
      };
      return { files, elements: [imageElement] };
    }
  });

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/converter/types/sequence.js
  init_define_process_env();
  init_polyfills();

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/converter/transformToExcalidrawSkeleton.js
  init_define_process_env();
  init_polyfills();
  var normalizeText = (text) => {
    return text.replace(/\\n/g, "\n");
  };
  var transformToExcalidrawLineSkeleton = (line) => {
    const lineElement = {
      type: "line",
      x: line.startX,
      y: line.startY,
      points: [
        [0, 0],
        [line.endX - line.startX, line.endY - line.startY]
      ],
      width: line.endX - line.startX,
      height: line.endY - line.startY,
      strokeStyle: line.strokeStyle || "solid",
      strokeColor: line.strokeColor || "#000",
      strokeWidth: line.strokeWidth || 1
    };
    if (line.groupId) {
      Object.assign(lineElement, { groupIds: [line.groupId] });
    }
    if (line.id) {
      Object.assign(lineElement, { id: line.id });
    }
    return lineElement;
  };
  var transformToExcalidrawTextSkeleton = (element) => {
    const textElement = {
      type: "text",
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      text: normalizeText(element.text) || "",
      fontSize: element.fontSize,
      verticalAlign: "top",
      strokeColor: element.color
    };
    if (element.groupId) {
      Object.assign(textElement, { groupIds: [element.groupId] });
    }
    if (element.id) {
      Object.assign(textElement, { id: element.id });
    }
    return textElement;
  };
  var transformToExcalidrawContainerSkeleton = (element) => {
    var _a, _b, _c, _d;
    let extraProps = {};
    if (element.type === "rectangle" && element.subtype === "activation") {
      extraProps = {
        backgroundColor: "#e9ecef",
        fillStyle: "solid"
      };
    }
    const container = {
      id: element.id,
      type: element.type,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      label: {
        text: normalizeText(((_a = element == null ? void 0 : element.label) == null ? void 0 : _a.text) || ""),
        fontSize: (_b = element == null ? void 0 : element.label) == null ? void 0 : _b.fontSize,
        verticalAlign: ((_c = element.label) == null ? void 0 : _c.verticalAlign) || "middle",
        strokeColor: ((_d = element.label) == null ? void 0 : _d.color) || "#000",
        groupIds: element.groupId ? [element.groupId] : []
      },
      strokeStyle: element == null ? void 0 : element.strokeStyle,
      strokeWidth: element == null ? void 0 : element.strokeWidth,
      strokeColor: element == null ? void 0 : element.strokeColor,
      backgroundColor: element == null ? void 0 : element.bgColor,
      fillStyle: "solid",
      ...extraProps
    };
    if (element.groupId) {
      Object.assign(container, { groupIds: [element.groupId] });
    }
    return container;
  };
  var transformToExcalidrawArrowSkeleton = (arrow) => {
    var _a;
    const arrowElement = {
      type: "arrow",
      x: arrow.startX,
      y: arrow.startY,
      points: arrow.points || [
        [0, 0],
        [arrow.endX - arrow.startX, arrow.endY - arrow.startY]
      ],
      width: arrow.endX - arrow.startX,
      height: arrow.endY - arrow.startY,
      strokeStyle: (arrow == null ? void 0 : arrow.strokeStyle) || "solid",
      endArrowhead: (arrow == null ? void 0 : arrow.endArrowhead) || null,
      startArrowhead: (arrow == null ? void 0 : arrow.startArrowhead) || null,
      label: {
        text: normalizeText(((_a = arrow == null ? void 0 : arrow.label) == null ? void 0 : _a.text) || ""),
        fontSize: 16
      },
      roundness: {
        type: 2
      },
      start: arrow.start,
      end: arrow.end
    };
    if (arrow.groupId) {
      Object.assign(arrowElement, { groupIds: [arrow.groupId] });
    }
    return arrowElement;
  };

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/converter/types/sequence.js
  var SequenceToExcalidrawSkeletonConvertor = new GraphConverter({
    converter: (chart) => {
      const elements = [];
      const activations = [];
      Object.values(chart.nodes).forEach((node) => {
        if (!node || !node.length) {
          return;
        }
        node.forEach((element) => {
          let excalidrawElement;
          switch (element.type) {
            case "line":
              excalidrawElement = transformToExcalidrawLineSkeleton(element);
              break;
            case "rectangle":
            case "ellipse":
              excalidrawElement = transformToExcalidrawContainerSkeleton(element);
              break;
            case "text":
              excalidrawElement = transformToExcalidrawTextSkeleton(element);
              break;
            default:
              throw `unknown type ${element.type}`;
              break;
          }
          if (element.type === "rectangle" && (element == null ? void 0 : element.subtype) === "activation") {
            activations.push(excalidrawElement);
          } else {
            elements.push(excalidrawElement);
          }
        });
      });
      Object.values(chart.lines).forEach((line) => {
        if (!line) {
          return;
        }
        elements.push(transformToExcalidrawLineSkeleton(line));
      });
      Object.values(chart.arrows).forEach((arrow) => {
        if (!arrow) {
          return;
        }
        elements.push(transformToExcalidrawArrowSkeleton(arrow));
        if (arrow.sequenceNumber) {
          elements.push(transformToExcalidrawContainerSkeleton(arrow.sequenceNumber));
        }
      });
      elements.push(...activations);
      if (chart.loops) {
        const { lines, texts, nodes } = chart.loops;
        lines.forEach((line) => {
          elements.push(transformToExcalidrawLineSkeleton(line));
        });
        texts.forEach((text) => {
          elements.push(transformToExcalidrawTextSkeleton(text));
        });
        nodes.forEach((node) => {
          elements.push(transformToExcalidrawContainerSkeleton(node));
        });
      }
      if (chart.groups) {
        chart.groups.forEach((group) => {
          const { actorKeys, name } = group;
          let minX = Infinity;
          let minY = Infinity;
          let maxX = 0;
          let maxY = 0;
          if (!actorKeys.length) {
            return;
          }
          const actors = elements.filter((ele) => {
            if (ele.id) {
              const hyphenIndex = ele.id.indexOf("-");
              const id = ele.id.substring(0, hyphenIndex);
              return actorKeys.includes(id);
            }
          });
          actors.forEach((actor) => {
            if (actor.x === void 0 || actor.y === void 0 || actor.width === void 0 || actor.height === void 0) {
              throw new Error(`Actor attributes missing ${actor}`);
            }
            minX = Math.min(minX, actor.x);
            minY = Math.min(minY, actor.y);
            maxX = Math.max(maxX, actor.x + actor.width);
            maxY = Math.max(maxY, actor.y + actor.height);
          });
          const PADDING = 10;
          const groupRectX = minX - PADDING;
          const groupRectY = minY - PADDING;
          const groupRectWidth = maxX - minX + PADDING * 2;
          const groupRectHeight = maxY - minY + PADDING * 2;
          const groupRectId = nanoid();
          const groupRect = transformToExcalidrawContainerSkeleton({
            type: "rectangle",
            x: groupRectX,
            y: groupRectY,
            width: groupRectWidth,
            height: groupRectHeight,
            bgColor: group.fill,
            id: groupRectId
          });
          elements.unshift(groupRect);
          const frameId = nanoid();
          const frameChildren = [groupRectId];
          elements.forEach((ele) => {
            if (ele.type === "frame") {
              return;
            }
            if (ele.x === void 0 || ele.y === void 0 || ele.width === void 0 || ele.height === void 0) {
              throw new Error(`Element attributes missing ${ele}`);
            }
            if (ele.x >= minX && ele.x + ele.width <= maxX && ele.y >= minY && ele.y + ele.height <= maxY) {
              const elementId = ele.id || nanoid();
              if (!ele.id) {
                Object.assign(ele, { id: elementId });
              }
              frameChildren.push(elementId);
            }
          });
          const frame = {
            type: "frame",
            id: frameId,
            name,
            children: frameChildren
          };
          elements.push(frame);
        });
      }
      console.log(elements);
      return { elements };
    }
  });

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/converter/types/class.js
  init_define_process_env();
  init_polyfills();
  var classToExcalidrawSkeletonConvertor = new GraphConverter({
    converter: (chart) => {
      const elements = [];
      chart.nodes.forEach((node) => {
        if (!node || !node.length) {
          return;
        }
        node.forEach((element) => {
          let excalidrawElement;
          switch (element.type) {
            case "line":
              excalidrawElement = transformToExcalidrawLineSkeleton(element);
              break;
            case "rectangle":
            case "ellipse":
              excalidrawElement = transformToExcalidrawContainerSkeleton(element);
              break;
            case "text":
              excalidrawElement = transformToExcalidrawTextSkeleton(element);
              break;
            default:
              throw `unknown type ${element.type}`;
              break;
          }
          elements.push(excalidrawElement);
        });
      });
      Object.values(chart.lines).forEach((line) => {
        if (!line) {
          return;
        }
        elements.push(transformToExcalidrawLineSkeleton(line));
      });
      Object.values(chart.arrows).forEach((arrow) => {
        if (!arrow) {
          return;
        }
        const excalidrawElement = transformToExcalidrawArrowSkeleton(arrow);
        elements.push(excalidrawElement);
      });
      Object.values(chart.text).forEach((ele) => {
        const excalidrawElement = transformToExcalidrawTextSkeleton(ele);
        elements.push(excalidrawElement);
      });
      Object.values(chart.namespaces).forEach((namespace) => {
        const classIds = Object.keys(namespace.classes);
        const children = [...classIds];
        const chartElements = [...chart.lines, ...chart.arrows, ...chart.text];
        classIds.forEach((classId) => {
          const childIds = chartElements.filter((ele) => ele.metadata && ele.metadata.classId === classId).map((ele) => ele.id);
          if (childIds.length) {
            children.push(...childIds);
          }
        });
        const frame = {
          type: "frame",
          id: nanoid(),
          name: namespace.id,
          children
        };
        elements.push(frame);
      });
      console.log(elements);
      return { elements };
    }
  });

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/graphToExcalidraw.js
  var graphToExcalidraw = (graph, options = {}) => {
    switch (graph.type) {
      case "graphImage": {
        return GraphImageConverter.convert(graph, options);
      }
      case "flowchart": {
        return FlowchartToExcalidrawSkeletonConverter.convert(graph, options);
      }
      case "sequence": {
        return SequenceToExcalidrawSkeletonConvertor.convert(graph, options);
      }
      case "class": {
        return classToExcalidrawSkeletonConvertor.convert(graph, options);
      }
      default: {
        throw new Error(`graphToExcalidraw: unknown graph type "${graph.type}, only flowcharts are supported!"`);
      }
    }
  };

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/parseMermaid.js
  init_define_process_env();
  init_polyfills();

  // src/mermaid-shim.ts
  init_define_process_env();
  init_polyfills();
  var getMermaidRuntime = () => {
    const runtime = window.mermaid;
    if (!runtime) {
      throw new Error("Mermaid runtime unavailable");
    }
    return runtime;
  };
  var mermaid = new Proxy({}, {
    get(_target, prop) {
      return getMermaidRuntime()[prop];
    },
    set(_target, prop, value) {
      getMermaidRuntime()[prop] = value;
      return true;
    },
    has(_target, prop) {
      return prop in getMermaidRuntime();
    },
    ownKeys() {
      return Reflect.ownKeys(getMermaidRuntime());
    },
    getOwnPropertyDescriptor(_target, prop) {
      const descriptor = Object.getOwnPropertyDescriptor(getMermaidRuntime(), prop);
      if (descriptor) return descriptor;
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: getMermaidRuntime()[prop]
      };
    }
  });
  var mermaid_shim_default = mermaid;

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/utils.js
  init_define_process_env();
  init_polyfills();
  var entityCodesToText = (input) => {
    input = decodeEntities(input);
    const inputWithDecimalCode = input.replace(/#(\d+);/g, "&#$1;").replace(/#([a-z]+);/g, "&$1;");
    const element = document.createElement("textarea");
    element.innerHTML = inputWithDecimalCode;
    return element.value;
  };
  var getTransformAttr = (el) => {
    const transformAttr = el.getAttribute("transform");
    const translateMatch = transformAttr == null ? void 0 : transformAttr.match(/translate\(([ \d.-]+),\s*([\d.-]+)\)/);
    let transformX = 0;
    let transformY = 0;
    if (translateMatch) {
      transformX = Number(translateMatch[1]);
      transformY = Number(translateMatch[2]);
    }
    return { transformX, transformY };
  };
  var encodeEntities = (text) => {
    let txt = text;
    txt = txt.replace(/style.*:\S*#.*;/g, (s) => {
      return s.substring(0, s.length - 1);
    });
    txt = txt.replace(/classDef.*:\S*#.*;/g, (s) => {
      return s.substring(0, s.length - 1);
    });
    txt = txt.replace(/#\w+;/g, (s) => {
      const innerTxt = s.substring(1, s.length - 1);
      const isInt = /^\+?\d+$/.test(innerTxt);
      if (isInt) {
        return `\uFB02\xB0\xB0${innerTxt}\xB6\xDF`;
      }
      return `\uFB02\xB0${innerTxt}\xB6\xDF`;
    });
    return txt;
  };
  var decodeEntities = function(text) {
    return text.replace(/ﬂ°°/g, "#").replace(/ﬂ°/g, "&").replace(/¶ß/g, ";");
  };
  var computeEdgePositions = (pathElement, offset = { x: 0, y: 0 }) => {
    if (pathElement.tagName.toLowerCase() !== "path") {
      throw new Error(`Invalid input: Expected an HTMLElement of tag "path", got ${pathElement.tagName}`);
    }
    const dAttr = pathElement.getAttribute("d");
    if (!dAttr) {
      throw new Error('Path element does not contain a "d" attribute');
    }
    const commands = dAttr.split(/(?=[LM])/);
    const startPosition = commands[0].substring(1).split(",").map((coord) => parseFloat(coord));
    const endPosition = commands[commands.length - 1].substring(1).split(",").map((coord) => parseFloat(coord));
    const reflectionPoints = commands.map((command) => {
      const coords = command.substring(1).split(",").map((coord) => parseFloat(coord));
      return { x: coords[0], y: coords[1] };
    }).filter((point, index, array) => {
      if (index === 0 || index === array.length - 1) {
        return true;
      }
      if (point.x === array[index - 1].x && point.y === array[index - 1].y) {
        return false;
      }
      if (index === array.length - 2 && (array[index - 1].x === point.x || array[index - 1].y === point.y)) {
        const lastPoint = array[array.length - 1];
        const distance = Math.hypot(lastPoint.x - point.x, lastPoint.y - point.y);
        return distance > 20;
      }
      return point.x !== array[index - 1].x || point.y !== array[index - 1].y;
    }).map((p) => {
      return {
        x: p.x + offset.x,
        y: p.y + offset.y
      };
    });
    return {
      startX: startPosition[0] + offset.x,
      startY: startPosition[1] + offset.y,
      endX: endPosition[0] + offset.x,
      endY: endPosition[1] + offset.y,
      reflectionPoints
    };
  };

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/parser/flowchart.js
  init_define_process_env();
  init_polyfills();

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/parser/cssUtils.js
  init_define_process_env();
  init_polyfills();
  var cleanCSSValue = (value) => {
    return value.replace(/\s*!important\s*$/i, "").trim();
  };

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/parser/flowchart.js
  var parseSubGraph = (data, containerEl) => {
    const nodeIds = data.nodes.map((n) => {
      if (n.startsWith("flowchart-")) {
        return n.split("-")[1];
      }
      return n;
    });
    const el = containerEl.querySelector(`[id='${data.id}']`);
    if (!el) {
      throw new Error("SubGraph element not found");
    }
    const position = computeElementPosition(el, containerEl);
    const boundingBox = el.getBBox();
    const dimension = {
      width: boundingBox.width,
      height: boundingBox.height
    };
    return {
      id: data.id,
      nodeIds,
      text: entityCodesToText(data.title),
      labelType: "text",
      ...position,
      ...dimension
    };
  };
  var parseVertex = (vertex, containerEl, classes) => {
    var _a, _b, _c, _d, _e;
    const node = containerEl.querySelector(`[id*="${vertex.domId}"]`);
    if (!node) {
      return void 0;
    }
    let link;
    if (((_a = node.parentElement) == null ? void 0 : _a.tagName.toLowerCase()) === "a") {
      link = node.parentElement.getAttribute("xlink:href");
    }
    const position = computeElementPosition(link ? node.parentElement : node, containerEl);
    const boundingBox = node.getBBox();
    const dimension = {
      width: boundingBox.width,
      height: boundingBox.height
    };
    const labelContainerStyleText = (_b = node.querySelector(".label-container")) == null ? void 0 : _b.getAttribute("style");
    const labelStyleText = (_c = node.querySelector(".label")) == null ? void 0 : _c.getAttribute("style");
    const containerStyle = {};
    labelContainerStyleText == null ? void 0 : labelContainerStyleText.split(";").forEach((property) => {
      if (!property) {
        return;
      }
      const key = property.split(":")[0].trim();
      const value = cleanCSSValue(property.split(":")[1] || "");
      if (value) {
        containerStyle[key] = value;
      }
    });
    const labelStyle = {};
    labelStyleText == null ? void 0 : labelStyleText.split(";").forEach((property) => {
      if (!property) {
        return;
      }
      const key = property.split(":")[0].trim();
      const value = cleanCSSValue(property.split(":")[1] || "");
      if (value) {
        labelStyle[key] = value;
      }
    });
    if (vertex.classes && classes instanceof Map) {
      const classDef = classes.get(Array.isArray(vertex.classes) ? vertex.classes[0] : vertex.classes);
      if (classDef) {
        (_d = classDef.styles) == null ? void 0 : _d.forEach((style) => {
          const [key, value] = style.split(":");
          const cleanedValue = cleanCSSValue(value || "");
          if (cleanedValue) {
            containerStyle[key.trim()] = cleanedValue;
          }
        });
        (_e = classDef.textStyles) == null ? void 0 : _e.forEach((style) => {
          const [key, value] = style.split(":");
          const cleanedValue = cleanCSSValue(value || "");
          if (cleanedValue) {
            labelStyle[key.trim()] = cleanedValue;
          }
        });
      }
    }
    return {
      id: vertex.id,
      labelType: vertex.labelType,
      text: entityCodesToText(vertex.text || ""),
      type: vertex.type,
      link: link || void 0,
      ...position,
      ...dimension,
      containerStyle,
      labelStyle
    };
  };
  var parseEdge = (edge, edgeIndex, containerEl, fallbackIndex, edgePaths) => {
    let node = containerEl.querySelector(`[id*="${edge.id}"]`);
    if (!node && edge.start && edge.end) {
      node = containerEl.querySelector(`path.flowchart-link.LS-${edge.start}.LE-${edge.end}`);
    }
    if (!node && Array.isArray(edgePaths) && edgePaths.length) {
      if (edge.start && edge.end) {
        const idPrefix = `L-${edge.start}-${edge.end}-`;
        node = edgePaths.find((path) => {
          var _a;
          return (_a = path.getAttribute("id")) == null ? void 0 : _a.startsWith(idPrefix);
        }) || null;
      }
      if (!node && typeof fallbackIndex === "number" && edgePaths[fallbackIndex]) {
        node = edgePaths[fallbackIndex];
      }
    }
    if (!node) {
      throw new Error("Edge element not found");
    }
    const position = computeElementPosition(node, containerEl);
    const edgePositionData = computeEdgePositions(node, position);
    edge.length = void 0;
    return {
      ...edge,
      ...edgePositionData,
      text: entityCodesToText(edge.text)
    };
  };
  var parseEdgeFromPath = (pathEl, containerEl) => {
    const classList = Array.from(pathEl.classList || []);
    const startToken = classList.find((token) => token.startsWith("LS-"));
    const endToken = classList.find((token) => token.startsWith("LE-"));
    if (!startToken || !endToken) {
      return null;
    }
    const start = startToken.replace("LS-", "");
    const end = endToken.replace("LE-", "");
    const position = computeElementPosition(pathEl, containerEl);
    const edgePositionData = computeEdgePositions(pathEl, position);
    return {
      id: pathEl.getAttribute("id") || `${start}-${end}`,
      start,
      end,
      type: "arrow_point",
      stroke: "normal",
      text: "",
      ...edgePositionData
    };
  };
  var computeElementPosition = (el, containerEl) => {
    var _a;
    if (!el) {
      throw new Error("Element not found");
    }
    let root = (_a = el.parentElement) == null ? void 0 : _a.parentElement;
    const childElement = el.childNodes[0];
    let childPosition = { x: 0, y: 0 };
    if (childElement) {
      const { transformX: transformX2, transformY: transformY2 } = getTransformAttr(childElement);
      const boundingBox = childElement.getBBox();
      childPosition = {
        x: Number(childElement.getAttribute("x")) || transformX2 + boundingBox.x || 0,
        y: Number(childElement.getAttribute("y")) || transformY2 + boundingBox.y || 0
      };
    }
    const { transformX, transformY } = getTransformAttr(el);
    const position = {
      x: transformX + childPosition.x,
      y: transformY + childPosition.y
    };
    while (root && root.id !== containerEl.id) {
      if (root.classList.value === "root" && root.hasAttribute("transform")) {
        const { transformX: transformX2, transformY: transformY2 } = getTransformAttr(root);
        position.x += transformX2;
        position.y += transformY2;
      }
      root = root.parentElement;
    }
    return position;
  };
  var parseMermaidFlowChartDiagram = (db, containerEl) => {
    const verticesData = db.getVertices();
    const edgesData = db.getEdges();
    const subGraphsData = db.getSubGraphs();
    const classesData = db.getClasses();
    const vertices = {};
    const normalizedClasses = classesData instanceof Map ? classesData : {};
    if (verticesData instanceof Map) {
      verticesData.forEach((vertex, id) => {
        vertices[id] = parseVertex(vertex, containerEl, normalizedClasses);
      });
    } else if (typeof verticesData === "object" && verticesData !== null) {
      Object.entries(verticesData).forEach(([id, vertex]) => {
        vertices[id] = parseVertex(vertex, containerEl, normalizedClasses);
      });
    }
    const edgeCountMap = /* @__PURE__ */ new Map();
    const edgePaths = Array.from(containerEl.querySelectorAll("path.flowchart-link"));
    const edges = (Array.isArray(edgesData) ? edgesData : []).map((edge, index) => {
      if (!containerEl.querySelector(`[id*="${edge.id}"]`)) {
        const classMatch = edge.start && edge.end ? containerEl.querySelector(`path.flowchart-link.LS-${edge.start}.LE-${edge.end}`) : null;
        const idPrefix = edge.start && edge.end ? `L-${edge.start}-${edge.end}-` : "";
        const idMatch = idPrefix ? edgePaths.find((path) => {
          var _a;
          return (_a = path.getAttribute("id")) == null ? void 0 : _a.startsWith(idPrefix);
        }) : null;
        if (!classMatch && !idMatch && !edgePaths[index]) {
          return null;
        }
      }
      const edgeMapKey = `${edge.start}-${edge.end}`;
      const count = edgeCountMap.get(edgeMapKey) || 0;
      edgeCountMap.set(edgeMapKey, count + 1);
      return parseEdge(edge, count, containerEl, index, edgePaths);
    }).filter((edge) => edge !== null && edge.reflectionPoints.length > 1);
    const finalEdges = edges.length ? edges : edgePaths.map((pathEl) => parseEdgeFromPath(pathEl, containerEl)).filter((edge) => edge !== null && edge.reflectionPoints.length > 1);
    const subGraphs = (Array.isArray(subGraphsData) ? subGraphsData : []).map((subgraph) => {
      return parseSubGraph(subgraph, containerEl);
    });
    return {
      type: "flowchart",
      subGraphs,
      vertices,
      edges: finalEdges
    };
  };

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/parser/sequence.js
  init_define_process_env();
  init_polyfills();

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/elementSkeleton.js
  init_define_process_env();
  init_polyfills();
  var createArrowSkeletonFromSVG = (arrowNode, opts) => {
    const arrow = {};
    if (opts == null ? void 0 : opts.label) {
      arrow.label = { text: entityCodesToText(opts.label), fontSize: 16 };
    }
    const tagName = arrowNode.tagName;
    if (tagName === "line") {
      arrow.startX = Number(arrowNode.getAttribute("x1"));
      arrow.startY = Number(arrowNode.getAttribute("y1"));
      arrow.endX = Number(arrowNode.getAttribute("x2"));
      arrow.endY = Number(arrowNode.getAttribute("y2"));
    } else if (tagName === "path") {
      const dAttr = arrowNode.getAttribute("d");
      if (!dAttr) {
        throw new Error('Path element does not contain a "d" attribute');
      }
      const commands = dAttr.split(/(?=[LC])/);
      const startPosition = commands[0].substring(1).split(",").map((coord) => parseFloat(coord));
      const points = [];
      commands.forEach((command) => {
        const currPoints = command.substring(1).trim().split(" ").map((pos) => {
          const [x, y] = pos.split(",");
          return [
            parseFloat(x) - startPosition[0],
            parseFloat(y) - startPosition[1]
          ];
        });
        points.push(...currPoints);
      });
      const endPosition = points[points.length - 1];
      arrow.startX = startPosition[0];
      arrow.startY = startPosition[1];
      arrow.endX = endPosition[0];
      arrow.endY = endPosition[1];
      arrow.points = points;
    }
    if (opts == null ? void 0 : opts.label) {
      const offset = 10;
      arrow.startY = arrow.startY - offset;
      arrow.endY = arrow.endY - offset;
    }
    const strokeAttr = arrowNode.getAttribute("stroke");
    const strokeColor = (strokeAttr && strokeAttr !== "none" ? strokeAttr : "") || getComputedStyle(arrowNode).stroke || "";
    arrow.strokeColor = strokeColor ? cleanCSSValue(strokeColor) : null;
    arrow.strokeWidth = Number(arrowNode.getAttribute("stroke-width"));
    arrow.type = "arrow";
    arrow.strokeStyle = (opts == null ? void 0 : opts.strokeStyle) || "solid";
    arrow.startArrowhead = (opts == null ? void 0 : opts.startArrowhead) || null;
    arrow.endArrowhead = (opts == null ? void 0 : opts.endArrowhead) || null;
    return arrow;
  };
  var createArrowSkeletion = (startX, startY, endX, endY, opts) => {
    const arrow = {};
    arrow.type = "arrow";
    arrow.startX = startX;
    arrow.startY = startY;
    arrow.endX = endX;
    arrow.endY = endY;
    Object.assign(arrow, { ...opts });
    return arrow;
  };
  var createTextSkeleton = (x, y, text, opts) => {
    const textElement = {
      type: "text",
      x,
      y,
      text,
      width: (opts == null ? void 0 : opts.width) || 20,
      height: (opts == null ? void 0 : opts.height) || 20,
      fontSize: (opts == null ? void 0 : opts.fontSize) || DEFAULT_FONT_SIZE,
      id: opts == null ? void 0 : opts.id,
      color: opts == null ? void 0 : opts.color,
      groupId: opts == null ? void 0 : opts.groupId,
      metadata: opts == null ? void 0 : opts.metadata
    };
    return textElement;
  };
  var createTextSkeletonFromSVG = (textNode, text, opts) => {
    const node = {};
    const x = Number(textNode.getAttribute("x"));
    const y = Number(textNode.getAttribute("y"));
    node.type = "text";
    node.text = entityCodesToText(text);
    if (opts == null ? void 0 : opts.id) {
      node.id = opts.id;
    }
    if (opts == null ? void 0 : opts.groupId) {
      node.groupId = opts.groupId;
    }
    const boundingBox = textNode.getBBox();
    node.width = boundingBox.width;
    node.height = boundingBox.height;
    node.x = x - boundingBox.width / 2;
    node.y = y;
    const fontSize = parseInt(getComputedStyle(textNode).fontSize);
    node.fontSize = fontSize;
    return node;
  };
  var createContainerSkeletonFromSVG = (node, type, opts = {}) => {
    const container = {};
    container.type = type;
    const { label, subtype, id, groupId } = opts;
    container.id = id;
    if (groupId) {
      container.groupId = groupId;
    }
    if (label) {
      container.label = {
        text: entityCodesToText(label.text),
        fontSize: 16,
        verticalAlign: label == null ? void 0 : label.verticalAlign
      };
    }
    const boundingBox = node.getBBox();
    container.x = boundingBox.x;
    container.y = boundingBox.y;
    container.width = boundingBox.width;
    container.height = boundingBox.height;
    container.subtype = subtype;
    switch (subtype) {
      case "highlight":
        const bgColor = node.getAttribute("fill");
        if (bgColor) {
          container.bgColor = cleanCSSValue(bgColor);
        }
        break;
      case "note":
        container.strokeStyle = "dashed";
        break;
    }
    return container;
  };
  var createLineSkeletonFromSVG = (lineNode, startX, startY, endX, endY, opts) => {
    const line = {};
    line.startX = startX;
    line.startY = startY;
    line.endX = endX;
    if (opts == null ? void 0 : opts.groupId) {
      line.groupId = opts.groupId;
    }
    if (opts == null ? void 0 : opts.id) {
      line.id = opts.id;
    }
    line.endY = endY;
    const strokeColor = lineNode.getAttribute("stroke");
    line.strokeColor = strokeColor ? cleanCSSValue(strokeColor) : null;
    line.strokeWidth = Number(lineNode.getAttribute("stroke-width"));
    line.type = "line";
    return line;
  };

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/parser/sequence.js
  var SEQUENCE_ARROW_TYPES = {
    0: "SOLID",
    1: "DOTTED",
    3: "SOLID_CROSS",
    4: "DOTTED_CROSS",
    5: "SOLID_OPEN",
    6: "DOTTED_OPEN",
    24: "SOLID_POINT",
    25: "DOTTED_POINT"
  };
  var MESSAGE_TYPE = {
    SOLID: 0,
    DOTTED: 1,
    NOTE: 2,
    SOLID_CROSS: 3,
    DOTTED_CROSS: 4,
    SOLID_OPEN: 5,
    DOTTED_OPEN: 6,
    LOOP_START: 10,
    LOOP_END: 11,
    ALT_START: 12,
    ALT_ELSE: 13,
    ALT_END: 14,
    OPT_START: 15,
    OPT_END: 16,
    ACTIVE_START: 17,
    ACTIVE_END: 18,
    PAR_START: 19,
    PAR_AND: 20,
    PAR_END: 21,
    RECT_START: 22,
    RECT_END: 23,
    SOLID_POINT: 24,
    DOTTED_POINT: 25,
    AUTONUMBER: 26,
    CRITICAL_START: 27,
    CRITICAL_OPTION: 28,
    CRITICAL_END: 29,
    BREAK_START: 30,
    BREAK_END: 31,
    PAR_OVER_START: 32
  };
  var getStrokeStyle = (type) => {
    let strokeStyle;
    switch (type) {
      case MESSAGE_TYPE.SOLID:
      case MESSAGE_TYPE.SOLID_CROSS:
      case MESSAGE_TYPE.SOLID_OPEN:
      case MESSAGE_TYPE.SOLID_POINT:
        strokeStyle = "solid";
        break;
      case MESSAGE_TYPE.DOTTED:
      case MESSAGE_TYPE.DOTTED_CROSS:
      case MESSAGE_TYPE.DOTTED_OPEN:
      case MESSAGE_TYPE.DOTTED_POINT:
        strokeStyle = "dotted";
        break;
      default:
        strokeStyle = "solid";
        break;
    }
    return strokeStyle;
  };
  var attachSequenceNumberToArrow = (node, arrow) => {
    var _a, _b;
    const showSequenceNumber = !!((_a = node.nextElementSibling) == null ? void 0 : _a.classList.contains("sequenceNumber"));
    if (showSequenceNumber) {
      const text = (_b = node.nextElementSibling) == null ? void 0 : _b.textContent;
      if (!text) {
        throw new Error("sequence number not present");
      }
      const height = 30;
      const yOffset = height / 2;
      const xOffset = 10;
      const sequenceNumber = {
        type: "rectangle",
        x: arrow.startX - xOffset,
        y: arrow.startY - yOffset,
        label: { text, fontSize: 14 },
        bgColor: "#e9ecef",
        height,
        subtype: "sequence"
      };
      Object.assign(arrow, { sequenceNumber });
    }
  };
  var createActorSymbol = (rootNode, text, opts) => {
    if (!rootNode) {
      throw "root node not found";
    }
    const groupId = nanoid();
    const children = Array.from(rootNode.children);
    const nodeElements = [];
    children.forEach((child, index) => {
      const id = `${opts == null ? void 0 : opts.id}-${index}`;
      let ele;
      switch (child.tagName) {
        case "line":
          const startX = Number(child.getAttribute("x1"));
          const startY = Number(child.getAttribute("y1"));
          const endX = Number(child.getAttribute("x2"));
          const endY = Number(child.getAttribute("y2"));
          ele = createLineSkeletonFromSVG(child, startX, startY, endX, endY, { groupId, id });
          break;
        case "text":
          ele = createTextSkeletonFromSVG(child, text, {
            groupId,
            id
          });
          break;
        case "circle":
          ele = createContainerSkeletonFromSVG(child, "ellipse", {
            label: child.textContent ? { text: child.textContent } : void 0,
            groupId,
            id
          });
        default:
          ele = createContainerSkeletonFromSVG(child, SVG_TO_SHAPE_MAPPER[child.tagName], {
            label: child.textContent ? { text: child.textContent } : void 0,
            groupId,
            id
          });
      }
      nodeElements.push(ele);
    });
    return nodeElements;
  };
  var applyRectStyles = (container, rect) => {
    const fill = rect.getAttribute("fill");
    const stroke = rect.getAttribute("stroke");
    const strokeWidth = rect.getAttribute("stroke-width");
    const dashArray = rect.getAttribute("stroke-dasharray");
    if (fill && fill !== "none") {
      container.bgColor = cleanCSSValue(fill);
    }
    if (stroke && stroke !== "none") {
      container.strokeColor = cleanCSSValue(stroke);
    }
    if (strokeWidth) {
      container.strokeWidth = Number(strokeWidth);
    }
    if (dashArray && dashArray.trim()) {
      container.strokeStyle = "dashed";
    }
  };
  var parseActor = (actors, containerEl) => {
    const actorTopNodes = Array.from(containerEl.querySelectorAll(".actor-top"));
    const actorBottomNodes = Array.from(containerEl.querySelectorAll(".actor-bottom"));
    const nodes = [];
    const lines = [];
    const actorMap = {};
    const actorList = actors instanceof Map ? Array.from(actors.values()) : Object.values(actors);
    actorList.forEach((actor) => {
      var _a;
      const topRootNode = actorTopNodes.find((actorNode) => actorNode.getAttribute("name") === actor.name);
      const bottomRootNode = actorBottomNodes.find((actorNode) => actorNode.getAttribute("name") === actor.name);
      if (!topRootNode || !bottomRootNode) {
        throw "root not found";
      }
      const text = actor.description;
      if (actor.type === "participant") {
        const topNodeElement = createContainerSkeletonFromSVG(topRootNode, "rectangle", { id: `${actor.name}-top`, label: { text }, subtype: "actor" });
        applyRectStyles(topNodeElement, topRootNode);
        if (!topNodeElement) {
          throw "Top Node element not found!";
        }
        nodes.push([topNodeElement]);
        const bottomNodeElement = createContainerSkeletonFromSVG(bottomRootNode, "rectangle", { id: `${actor.name}-bottom`, label: { text }, subtype: "actor" });
        actorMap[actor.name] = {
          topId: `${actor.name}-top`,
          bottomId: `${actor.name}-bottom`
        };
        applyRectStyles(bottomNodeElement, bottomRootNode);
        nodes.push([bottomNodeElement]);
        const lineNode = (_a = topRootNode == null ? void 0 : topRootNode.parentElement) == null ? void 0 : _a.previousElementSibling;
        if ((lineNode == null ? void 0 : lineNode.tagName) !== "line") {
          throw "Line not found";
        }
        const startX = Number(lineNode.getAttribute("x1"));
        if (!topNodeElement.height) {
          throw "Top node element height is null";
        }
        const startY = topNodeElement.y + topNodeElement.height;
        const endY = bottomNodeElement.y;
        const endX = Number(lineNode.getAttribute("x2"));
        const line = createLineSkeletonFromSVG(lineNode, startX, startY, endX, endY);
        lines.push(line);
      } else if (actor.type === "actor") {
        const topNodeElement = createActorSymbol(topRootNode, text, {
          id: `${actor.name}-top`
        });
        nodes.push(topNodeElement);
        const bottomNodeElement = createActorSymbol(bottomRootNode, text, {
          id: `${actor.name}-bottom`
        });
        nodes.push(bottomNodeElement);
        actorMap[actor.name] = {
          topId: `${actor.name}-top`,
          bottomId: `${actor.name}-bottom`
        };
        const lineNode = topRootNode.previousElementSibling;
        if ((lineNode == null ? void 0 : lineNode.tagName) !== "line") {
          throw "Line not found";
        }
        const startX = Number(lineNode.getAttribute("x1"));
        const startY = Number(lineNode.getAttribute("y1"));
        const endX = Number(lineNode.getAttribute("x2"));
        const bottomEllipseNode = bottomNodeElement.find((node) => node.type === "ellipse");
        if (bottomEllipseNode) {
          const endY = bottomEllipseNode.y;
          const line = createLineSkeletonFromSVG(lineNode, startX, startY, endX, endY);
          lines.push(line);
        }
      }
    });
    return { nodes, lines, actorMap };
  };
  var computeArrows = (messages, containerEl, actorMap) => {
    const arrows = [];
    const arrowNodes = Array.from(containerEl.querySelectorAll('[class*="messageLine"]'));
    const supportedMessageTypes = Object.keys(SEQUENCE_ARROW_TYPES);
    const arrowMessages = messages.filter((message) => supportedMessageTypes.includes(message.type.toString()));
    arrowNodes.forEach((arrowNode, index) => {
      const message = arrowMessages[index];
      const messageType = SEQUENCE_ARROW_TYPES[message.type];
      const arrow = createArrowSkeletonFromSVG(arrowNode, {
        label: message == null ? void 0 : message.message,
        strokeStyle: getStrokeStyle(message.type),
        endArrowhead: messageType === "SOLID_OPEN" || messageType === "DOTTED_OPEN" ? null : "arrow"
      });
      const from = actorMap[message.from];
      const to = actorMap[message.to];
      if ((from == null ? void 0 : from.topId) && (to == null ? void 0 : to.topId)) {
        arrow.start = { type: "rectangle", id: from.topId };
        arrow.end = { type: "rectangle", id: to.topId };
      }
      attachSequenceNumberToArrow(arrowNode, arrow);
      arrows.push(arrow);
    });
    return arrows;
  };
  var computeNotes = (messages, containerEl) => {
    const noteNodes = Array.from(containerEl.querySelectorAll(".note")).map((node) => node.parentElement);
    const noteText = messages.filter((message) => message.type === MESSAGE_TYPE.NOTE);
    const notes = [];
    noteNodes.forEach((node, index) => {
      if (!node) {
        return;
      }
      const rect = node.firstChild;
      const text = noteText[index].message;
      const note = createContainerSkeletonFromSVG(rect, "rectangle", {
        label: { text },
        subtype: "note"
      });
      const fill = rect.getAttribute("fill");
      const stroke = rect.getAttribute("stroke");
      const strokeWidth = rect.getAttribute("stroke-width");
      const dashArray = rect.getAttribute("stroke-dasharray");
      if (fill && fill !== "none") {
        note.bgColor = cleanCSSValue(fill);
      }
      if (stroke && stroke !== "none") {
        note.strokeColor = cleanCSSValue(stroke);
      }
      if (strokeWidth) {
        note.strokeWidth = Number(strokeWidth);
      }
      if (dashArray && dashArray.trim()) {
        note.strokeStyle = "dashed";
      }
      notes.push(note);
    });
    return notes;
  };
  var parseActivations = (containerEl) => {
    const activationNodes = Array.from(containerEl.querySelectorAll(`[class*=activation]`));
    const activations = [];
    activationNodes.forEach((node) => {
      const rect = createContainerSkeletonFromSVG(node, "rectangle", {
        label: { text: "" },
        subtype: "activation"
      });
      const applyRectStyles2 = () => {
        const fill = node.getAttribute("fill");
        const stroke = node.getAttribute("stroke");
        const strokeWidth = node.getAttribute("stroke-width");
        const dashArray = node.getAttribute("stroke-dasharray");
        if (fill && fill !== "none") {
          rect.bgColor = cleanCSSValue(fill);
        }
        if (stroke && stroke !== "none") {
          rect.strokeColor = cleanCSSValue(stroke);
        }
        if (strokeWidth) {
          rect.strokeWidth = Number(strokeWidth);
        }
        if (dashArray && dashArray.trim()) {
          rect.strokeStyle = "dashed";
        }
      };
      applyRectStyles2();
      activations.push(rect);
    });
    return activations;
  };
  var parseLoops = (messages, containerEl) => {
    const lineNodes = Array.from(containerEl.querySelectorAll(".loopLine"));
    const lines = [];
    const texts = [];
    const nodes = [];
    lineNodes.forEach((node) => {
      const startX = Number(node.getAttribute("x1"));
      const startY = Number(node.getAttribute("y1"));
      const endX = Number(node.getAttribute("x2"));
      const endY = Number(node.getAttribute("y2"));
      const line = createLineSkeletonFromSVG(node, startX, startY, endX, endY);
      line.strokeStyle = "dotted";
      line.strokeColor = "#adb5bd";
      line.strokeWidth = 2;
      lines.push(line);
    });
    const loopTextNodes = Array.from(containerEl.querySelectorAll(".loopText"));
    const criticalMessages = messages.filter((message) => message.type === MESSAGE_TYPE.CRITICAL_START).map((message) => message.message);
    loopTextNodes.forEach((node) => {
      var _a;
      const text = node.textContent || "";
      const textElement = createTextSkeletonFromSVG(node, text);
      const rawText = ((_a = text.match(/\[(.*?)\]/)) == null ? void 0 : _a[1]) || "";
      const isCritical = criticalMessages.includes(rawText);
      if (isCritical) {
        textElement.x += 16;
      }
      texts.push(textElement);
    });
    const labelBoxes = Array.from(containerEl == null ? void 0 : containerEl.querySelectorAll(".labelBox"));
    const labelTextNode = Array.from(containerEl == null ? void 0 : containerEl.querySelectorAll(".labelText"));
    labelBoxes.forEach((labelBox, index) => {
      var _a;
      const text = ((_a = labelTextNode[index]) == null ? void 0 : _a.textContent) || "";
      const container = createContainerSkeletonFromSVG(labelBox, "rectangle", {
        label: { text }
      });
      container.strokeColor = "#adb5bd";
      container.bgColor = "#e9ecef";
      container.width = void 0;
      nodes.push(container);
    });
    return { lines, texts, nodes };
  };
  var computeHighlights = (containerEl) => {
    const rects = Array.from(containerEl.querySelectorAll(".rect")).filter((node) => {
      var _a;
      return ((_a = node.parentElement) == null ? void 0 : _a.tagName) !== "g";
    });
    const nodes = [];
    rects.forEach((rect) => {
      const node = createContainerSkeletonFromSVG(rect, "rectangle", {
        label: { text: "" },
        subtype: "highlight"
      });
      nodes.push(node);
    });
    return nodes;
  };
  var parseMermaidSequenceDiagram = (diagram, containerEl) => {
    diagram.parser.parse(diagram.text);
    const mermaidParser = diagram.parser.yy;
    const nodes = [];
    const rawGroups = mermaidParser.getBoxes();
    const groups = rawGroups.map((group) => ({
      ...group,
      fill: cleanCSSValue(group.fill || "")
    }));
    const bgHightlights = computeHighlights(containerEl);
    const actorData = mermaidParser.getActors();
    const { nodes: actors, lines, actorMap } = parseActor(actorData, containerEl);
    const messages = mermaidParser.getMessages();
    const arrows = computeArrows(messages, containerEl, actorMap);
    const notes = computeNotes(messages, containerEl);
    const activations = parseActivations(containerEl);
    const loops = parseLoops(messages, containerEl);
    nodes.push(bgHightlights);
    nodes.push(...actors);
    nodes.push(notes);
    nodes.push(activations);
    return { type: "sequence", lines, arrows, nodes, loops, groups };
  };

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/parser/class.js
  init_define_process_env();
  init_polyfills();
  var parseStyleStrings = (styles) => {
    const styleObj = {};
    if (!styles) {
      return styleObj;
    }
    styles.forEach((style) => {
      style.split(";").map((s) => s.trim()).filter(Boolean).forEach((pair) => {
        const [key, value] = pair.split(":").map((p) => p.trim());
        if (key && value) {
          styleObj[key] = cleanCSSValue(value);
        }
      });
    });
    return styleObj;
  };
  var RELATION_TYPE = {
    AGGREGATION: 0,
    EXTENSION: 1,
    COMPOSITION: 2,
    DEPENDENCY: 3,
    LOLLIPOP: 4
  };
  var LINE_TYPE = {
    LINE: 0,
    DOTTED_LINE: 1
  };
  var MERMAID_ARROW_HEAD_OFFSET = 16;
  var getStrokeStyle2 = (type) => {
    let lineType;
    switch (type) {
      case LINE_TYPE.LINE:
        lineType = "solid";
        break;
      case LINE_TYPE.DOTTED_LINE:
        lineType = "dotted";
        break;
      default:
        lineType = "solid";
    }
    return lineType;
  };
  var getArrowhead = (type) => {
    let arrowhead;
    switch (type) {
      case RELATION_TYPE.AGGREGATION:
        arrowhead = "diamond_outline";
        break;
      case RELATION_TYPE.COMPOSITION:
        arrowhead = "diamond";
        break;
      case RELATION_TYPE.EXTENSION:
        arrowhead = "triangle_outline";
        break;
      case "none":
        arrowhead = null;
        break;
      case RELATION_TYPE.DEPENDENCY:
      default:
        arrowhead = "arrow";
        break;
    }
    return arrowhead;
  };
  var accumulateTranslation = (node, stopAt) => {
    let tx = 0;
    let ty = 0;
    let current = node;
    while (current && current !== stopAt) {
      const { transformX, transformY } = getTransformAttr(current);
      tx += transformX;
      ty += transformY;
      current = current.parentElement;
    }
    return { tx, ty };
  };
  var parseClasses = (classes, containerEl, lookUpDomId) => {
    const nodes = [];
    const lines = [];
    const text = [];
    Object.values(classes).forEach((classNode) => {
      const { domId, id: classId } = classNode;
      const groupId = nanoid();
      const classStyles = parseStyleStrings(
        // @ts-ignore
        classNode.styles || classNode.cssStyles
      );
      let lookedUpId;
      try {
        lookedUpId = lookUpDomId ? lookUpDomId(classId) : void 0;
      } catch (e) {
        lookedUpId = void 0;
      }
      const findByPrefix = (id) => {
        const regex = new RegExp(`^classId-${id}(?:-|$)`);
        const all = Array.from(containerEl.querySelectorAll("[id]")).filter((el) => regex.test(el.id));
        return all[0];
      };
      const domNode = lookedUpId && containerEl.querySelector(`#${lookedUpId}`) || containerEl.querySelector(`#${domId}`) || containerEl.querySelector(`[data-id='${classId}']`) || findByPrefix(classId);
      if (!domNode) {
        throw Error(`DOM Node with id ${domId} not found`);
      }
      const containerSource = domNode.querySelector("rect") || domNode;
      const containerBBox = containerSource.getBBox();
      const { tx: containerTx, ty: containerTy } = accumulateTranslation(containerSource, containerEl);
      const container = {
        type: "rectangle",
        id: classId,
        groupId,
        x: containerBBox.x + containerTx,
        y: containerBBox.y + containerTy,
        width: containerBBox.width,
        height: containerBBox.height,
        metadata: { classId }
      };
      const fill = containerSource.getAttribute("fill");
      const stroke = containerSource.getAttribute("stroke");
      const strokeWidth = containerSource.getAttribute("stroke-width");
      const dashArray = containerSource.getAttribute("stroke-dasharray");
      const computed = getComputedStyle(containerSource);
      const resolvedFill = cleanCSSValue(fill || classStyles.fill || (fill ? computed.fill : ""));
      const resolvedStroke = cleanCSSValue(stroke || classStyles.stroke || (stroke ? computed.stroke : ""));
      const resolvedStrokeWidth = strokeWidth || classStyles["stroke-width"] || (strokeWidth ? computed.strokeWidth : "");
      const resolvedDash = dashArray || classStyles["stroke-dasharray"] || (dashArray ? computed.strokeDasharray === "none" ? "" : computed.strokeDasharray : "");
      const isMeaningfulColor = (value) => {
        if (!value) {
          return false;
        }
        const v = value.toLowerCase();
        return !(v === "none" || v === "transparent" || v === "rgba(0, 0, 0, 0)" || v === "black" || v === "#000" || v === "#000000" || v === "rgb(0, 0, 0)" || v === "rgba(0, 0, 0, 1)");
      };
      if (isMeaningfulColor(resolvedFill)) {
        container.bgColor = resolvedFill;
      } else {
        container.bgColor = void 0;
      }
      if (isMeaningfulColor(resolvedStroke)) {
        container.strokeColor = resolvedStroke;
      } else {
        container.strokeColor = void 0;
      }
      if (resolvedStrokeWidth) {
        container.strokeWidth = Number(resolvedStrokeWidth);
      } else {
        container.strokeWidth = void 0;
      }
      if (resolvedDash && resolvedDash.trim().length > 0) {
        container.strokeStyle = "dashed";
      } else {
        container.strokeStyle = void 0;
      }
      nodes.push(container);
      const lineNodes = [
        ...Array.from(domNode.querySelectorAll("line")),
        ...Array.from(domNode.querySelectorAll("g.divider path"))
      ];
      lineNodes.forEach((lineNode) => {
        const { tx, ty } = accumulateTranslation(lineNode, containerEl);
        let startX;
        let startY;
        let endX;
        let endY;
        if (lineNode.tagName.toLowerCase() === "line") {
          startX = Number(lineNode.getAttribute("x1")) + tx;
          startY = Number(lineNode.getAttribute("y1")) + ty;
          endX = Number(lineNode.getAttribute("x2")) + tx;
          endY = Number(lineNode.getAttribute("y2")) + ty;
        } else {
          const bbox = lineNode.getBBox();
          startX = bbox.x + tx;
          endX = bbox.x + bbox.width + tx;
          const centerY = bbox.y + bbox.height / 2 + ty;
          startY = centerY;
          endY = centerY;
        }
        if (startX === endX && startY === endY) {
          return;
        }
        const line = createLineSkeletonFromSVG(
          // @ts-ignore
          lineNode,
          startX,
          startY,
          endX,
          endY,
          {
            groupId,
            id: nanoid()
          }
        );
        if (container.strokeColor) {
          line.strokeColor = container.strokeColor;
        } else {
          line.strokeColor = void 0;
        }
        if (container.strokeWidth !== void 0) {
          line.strokeWidth = container.strokeWidth;
        } else {
          line.strokeWidth = void 0;
        }
        if (container.strokeStyle) {
          line.strokeStyle = container.strokeStyle;
        } else {
          line.strokeStyle = void 0;
        }
        line.metadata = { classId };
        lines.push(line);
      });
      const textElements = Array.from(domNode.querySelectorAll("text, foreignObject"));
      textElements.forEach((textNode) => {
        var _a, _b;
        const isForeignObject = textNode.tagName.toLowerCase() === "foreignobject";
        const tspans = !isForeignObject ? Array.from(textNode.querySelectorAll("tspan")) : [];
        const rawText = tspans.length ? tspans.map((span) => {
          var _a2;
          return (_a2 = span.textContent) == null ? void 0 : _a2.trim();
        }).filter(Boolean).join("\n") : ((_a = textNode.textContent) == null ? void 0 : _a.trim()) || "";
        if (!rawText) {
          return;
        }
        const boundingBox = textNode.getBBox();
        const { tx, ty } = accumulateTranslation(textNode, containerEl);
        let fontSize = parseFloat(getComputedStyle(textNode).fontSize || "");
        if (isForeignObject && (!Number.isFinite(fontSize) || !fontSize)) {
          const inner = textNode.querySelector("div, span, p");
          if (inner) {
            fontSize = parseFloat(getComputedStyle(inner).fontSize || "");
          }
        }
        if (!Number.isFinite(fontSize) || fontSize <= 0) {
          fontSize = Math.max(12, boundingBox.height * 0.6);
        }
        fontSize = fontSize * 0.9;
        const textElement = createTextSkeleton(((container == null ? void 0 : container.x) || 0) + 4, boundingBox.y + ty, entityCodesToText(rawText), {
          width: container && container.width ? Math.max(container.width - 8, boundingBox.width) : boundingBox.width,
          height: boundingBox.height,
          fontSize: fontSize || void 0,
          color: cleanCSSValue(((_b = textNode.style) == null ? void 0 : _b.color) || getComputedStyle(textNode).fill || classStyles.color || "") || void 0,
          id: nanoid(),
          groupId,
          metadata: { classId }
        });
        text.push(textElement);
      });
    });
    return { nodes, lines, text };
  };
  var adjustArrowPosition = (direction, arrow) => {
    const arrowHeadShapes = ["triangle_outline", "diamond", "diamond_outline"];
    const shouldUpdateStartArrowhead = arrow.startArrowhead && arrowHeadShapes.includes(arrow.startArrowhead);
    const shouldUpdateEndArrowhead = arrow.endArrowhead && arrowHeadShapes.includes(arrow.endArrowhead);
    if (!shouldUpdateEndArrowhead && !shouldUpdateStartArrowhead) {
      return arrow;
    }
    if (shouldUpdateStartArrowhead) {
      if (direction === "LR") {
        arrow.startX -= MERMAID_ARROW_HEAD_OFFSET;
      } else if (direction === "RL") {
        arrow.startX += MERMAID_ARROW_HEAD_OFFSET;
      } else if (direction === "TB") {
        arrow.startY -= MERMAID_ARROW_HEAD_OFFSET;
      } else if (direction === "BT") {
        arrow.startY += MERMAID_ARROW_HEAD_OFFSET;
      }
    }
    if (shouldUpdateEndArrowhead) {
      if (direction === "LR") {
        arrow.endX += MERMAID_ARROW_HEAD_OFFSET;
      } else if (direction === "RL") {
        arrow.endX -= MERMAID_ARROW_HEAD_OFFSET;
      } else if (direction === "TB") {
        arrow.endY += MERMAID_ARROW_HEAD_OFFSET;
      } else if (direction === "BT") {
        arrow.endY -= MERMAID_ARROW_HEAD_OFFSET;
      }
    }
    return arrow;
  };
  var parseRelations = (relations, classNodes, containerEl, direction) => {
    var _a;
    const edges = (_a = containerEl.querySelector(".edgePaths")) == null ? void 0 : _a.children;
    if (!edges || relations.length === 0) {
      return { arrows: [], text: [] };
    }
    const arrows = [];
    const text = [];
    relations.forEach((relationNode, index) => {
      const { id1, id2, relation } = relationNode;
      const node1 = classNodes.find((node) => node.id === id1);
      const node2 = classNodes.find((node) => node.id === id2);
      if (!node1) {
        throw new Error(`parseRelations: Cannot find node with id ${id1}`);
      }
      if (!node2) {
        throw new Error(`parseRelations: Cannot find node with id ${id2}`);
      }
      const strokeStyle = getStrokeStyle2(relation.lineType);
      const startArrowhead = getArrowhead(relation.type1);
      const endArrowhead = getArrowhead(relation.type2);
      const edgePositionData = computeEdgePositions(edges[index]);
      const arrowSkeletion = createArrowSkeletion(edgePositionData.startX, edgePositionData.startY, edgePositionData.endX, edgePositionData.endY, {
        strokeStyle,
        startArrowhead,
        endArrowhead,
        label: relationNode.title ? { text: relationNode.title } : void 0,
        start: { type: "rectangle", id: node1.id },
        end: { type: "rectangle", id: node2.id }
      });
      const arrow = adjustArrowPosition(direction, arrowSkeletion);
      arrows.push(arrow);
      const { relationTitle1, relationTitle2 } = relationNode;
      const offsetX = 20;
      const offsetY = 15;
      const directionOffset = 15;
      let x;
      let y;
      if (relationTitle1 && relationTitle1 !== "none") {
        switch (direction) {
          case "TB":
            x = arrow.startX - offsetX;
            if (arrow.endX < arrow.startX) {
              x -= directionOffset;
            }
            y = arrow.startY + offsetY;
            break;
          case "BT":
            x = arrow.startX + offsetX;
            if (arrow.endX > arrow.startX) {
              x += directionOffset;
            }
            y = arrow.startY - offsetY;
            break;
          case "LR":
            x = arrow.startX + offsetX;
            y = arrow.startY + offsetY;
            if (arrow.endY > arrow.startY) {
              y += directionOffset;
            }
            break;
          case "RL":
            x = arrow.startX - offsetX;
            y = arrow.startY - offsetY;
            if (arrow.startY > arrow.endY) {
              y -= directionOffset;
            }
            break;
          default:
            x = arrow.startX - offsetX;
            y = arrow.startY + offsetY;
        }
        const relationTitleElement = createTextSkeleton(x, y, relationTitle1, {
          fontSize: 16
        });
        text.push(relationTitleElement);
      }
      if (relationTitle2 && relationTitle2 !== "none") {
        switch (direction) {
          case "TB":
            x = arrow.endX + offsetX;
            if (arrow.endX < arrow.startX) {
              x += directionOffset;
            }
            y = arrow.endY - offsetY;
            break;
          case "BT":
            x = arrow.endX - offsetX;
            if (arrow.endX > arrow.startX) {
              x -= directionOffset;
            }
            y = arrow.endY + offsetY;
            break;
          case "LR":
            x = arrow.endX - offsetX;
            y = arrow.endY - offsetY;
            if (arrow.endY > arrow.startY) {
              y -= directionOffset;
            }
            break;
          case "RL":
            x = arrow.endX + offsetX;
            y = arrow.endY + offsetY;
            if (arrow.startY > arrow.endY) {
              y += directionOffset;
            }
            break;
          default:
            x = arrow.endX + offsetX;
            y = arrow.endY - offsetY;
        }
        const relationTitleElement = createTextSkeleton(x, y, relationTitle2, {
          fontSize: 16
        });
        text.push(relationTitleElement);
      }
    });
    return { arrows, text };
  };
  var parseNotes = (notes, containerEl, classNodes) => {
    const noteContainers = [];
    const connectors = [];
    notes.forEach((note) => {
      const { id, text, class: classId } = note;
      const node = containerEl.querySelector(`#${id}`);
      if (!node) {
        throw new Error(`Node with id ${id} not found!`);
      }
      const { transformX, transformY } = getTransformAttr(node);
      const rect = node.firstChild;
      const container = createContainerSkeletonFromSVG(rect, "rectangle", {
        id,
        subtype: "note",
        label: { text }
      });
      Object.assign(container, {
        x: container.x + transformX,
        y: container.y + transformY
      });
      noteContainers.push(container);
      if (classId) {
        const classNode = classNodes.find((node2) => node2.id === classId);
        if (!classNode) {
          throw new Error(`class node with id ${classId} not found!`);
        }
        const startX = container.x + (container.width || 0) / 2;
        const startY = container.y + (container.height || 0);
        const endX = startX;
        const endY = classNode.y;
        const connector = createArrowSkeletion(startX, startY, endX, endY, {
          strokeStyle: "dotted",
          startArrowhead: null,
          endArrowhead: null,
          start: { id: container.id, type: "rectangle" },
          end: { id: classNode.id, type: "rectangle" }
        });
        connectors.push(connector);
      }
    });
    return { notes: noteContainers, connectors };
  };
  var parseMermaidClassDiagram = (diagram, containerEl) => {
    var _a, _b, _c, _d, _e;
    const db = diagram.db;
    const direction = ((_a = db.getDirection) == null ? void 0 : _a.call(db)) || "TB";
    const nodes = [];
    const lines = [];
    const text = [];
    const classNodes = [];
    const namespaces = ((_b = db.getNamespaces) == null ? void 0 : _b.call(db)) || [];
    const classesData = ((_c = db.getClasses) == null ? void 0 : _c.call(db)) || {};
    const classes = classesData instanceof Map ? Object.fromEntries(classesData) : classesData;
    if (classes && Object.keys(classes).length) {
      const lookUpDomId = (
        //@ts-ignore
        typeof db.lookUpDomId === "function" ? (
          //@ts-ignore
          db.lookUpDomId.bind(db)
        ) : void 0
      );
      const classData = parseClasses(classes, containerEl, lookUpDomId);
      nodes.push(classData.nodes);
      lines.push(...classData.lines);
      text.push(...classData.text);
      classNodes.push(...classData.nodes);
    }
    const relations = ((_d = db.getRelations) == null ? void 0 : _d.call(db)) || [];
    const { arrows, text: relationTitles } = parseRelations(relations, classNodes, containerEl, direction);
    const notes = ((_e = db.getNotes) == null ? void 0 : _e.call(db)) || [];
    const { notes: noteContainers, connectors } = parseNotes(notes, containerEl, classNodes);
    nodes.push(noteContainers);
    arrows.push(...connectors);
    text.push(...relationTitles);
    return { type: "class", nodes, lines, arrows, text, namespaces };
  };

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/parseMermaid.js
  var convertSvgToGraphImage = (svgContainer) => {
    const svgEl = svgContainer.querySelector("svg");
    if (!svgEl) {
      throw new Error("SVG element not found");
    }
    const rect = svgEl.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    svgEl.setAttribute("width", `${width}`);
    svgEl.setAttribute("height", `${height}`);
    const mimeType = "image/svg+xml";
    const decoded = unescape(encodeURIComponent(svgEl.outerHTML));
    const base64 = btoa(decoded);
    const dataURL = `data:image/svg+xml;base64,${base64}`;
    const graphImage = {
      type: "graphImage",
      mimeType,
      dataURL,
      width,
      height
    };
    return graphImage;
  };
  var parseMermaid = async (definition, config = MERMAID_CONFIG) => {
    var _a;
    mermaid_shim_default.initialize({
      ...MERMAID_CONFIG,
      ...config,
      themeVariables: {
        fontSize: `${DEFAULT_FONT_SIZE}px`
      }
    });
    const diagram = await mermaid_shim_default.mermaidAPI.getDiagramFromText(encodeEntities(definition));
    const { svg } = await mermaid_shim_default.render("mermaid-to-excalidraw", definition);
    const svgContainer = document.createElement("div");
    svgContainer.setAttribute("style", `opacity: 0; position: relative; z-index: -1;`);
    svgContainer.innerHTML = svg;
    svgContainer.id = "mermaid-diagram";
    (_a = document.querySelector("#mermaid-diagram")) == null ? void 0 : _a.remove();
    document.body.appendChild(svgContainer);
    let data;
    try {
      switch (diagram.type) {
        case "flowchart-v2":
        case "graph": {
          data = parseMermaidFlowChartDiagram(diagram.db, svgContainer);
          break;
        }
        case "sequence": {
          data = parseMermaidSequenceDiagram(diagram, svgContainer);
          break;
        }
        case "class":
        case "classDiagram": {
          data = parseMermaidClassDiagram(diagram, svgContainer);
          break;
        }
        default: {
          data = convertSvgToGraphImage(svgContainer);
        }
      }
    } catch (error) {
      console.error("Error processing Mermaid diagram:", error);
      data = convertSvgToGraphImage(svgContainer);
    } finally {
      svgContainer.remove();
    }
    return data;
  };

  // node_modules/@excalidraw/mermaid-to-excalidraw/dist/index.js
  var parseMermaidToExcalidraw = async (definition, config) => {
    var _a, _b;
    const mermaidConfig = config || {};
    const fontSize = parseInt((_b = (_a = mermaidConfig.themeVariables) == null ? void 0 : _a.fontSize) != null ? _b : "") || DEFAULT_FONT_SIZE;
    const parsedMermaidData = await parseMermaid(definition, {
      ...mermaidConfig,
      themeVariables: {
        ...mermaidConfig.themeVariables
      }
    });
    const excalidrawElements = graphToExcalidraw(parsedMermaidData, {
      fontSize
    });
    return excalidrawElements;
  };

  // src/jsx-runtime-shim.ts
  init_define_process_env();
  init_polyfills();
  var React2 = window.React;
  var createElement2 = React2 == null ? void 0 : React2.createElement;
  var jsx = (type, props, key) => {
    if (!createElement2) return null;
    if (key !== void 0) {
      props = props ? { ...props, key } : { key };
    }
    return createElement2(type, props);
  };
  var Fragment2 = React2 == null ? void 0 : React2.Fragment;

  // src/draw-editor/index.tsx
  var DEFAULT_EXCALIDRAW_TEXT_SIZE = 20;
  var MERMAID_OPTIONS = { fontSize: 20 };
  var MERMAID_TEXT_SIZE_OFFSET = 4;
  if (typeof window !== "undefined" && !window.EXCALIDRAW_ASSET_PATH) {
    window.EXCALIDRAW_ASSET_PATH = "https://unpkg.com/@excalidraw/excalidraw@0.17.6";
  }
  var getExcalidrawLib = () => {
    const lib = window.ExcalidrawLib;
    if (!lib) {
      throw new Error("Excalidraw CDN is not loaded.");
    }
    return lib;
  };
  var getExcalidrawExports = () => {
    const lib = getExcalidrawLib();
    return {
      Excalidraw: lib.Excalidraw,
      convertToExcalidrawElements: lib.convertToExcalidrawElements,
      exportToSvg: lib.exportToSvg,
      getCommonBounds: lib.getCommonBounds
    };
  };
  var MERMAID_ELEMENT_STYLE_DEFAULTS = {
    strokeWidth: 1.2,
    strokeStyle: "solid",
    roughness: 0,
    roundness: null
  };
  var isMermaidSvgFallbackEnabled = () => {
    try {
      if (localStorage.getItem("goToolkit.mermaidSvgFallback") === "1") return true;
      if (window.GoToolkitMermaidSvgFallback === true) return true;
      if (localStorage.getItem("goToolkit.mermaidSvgFallback") === "0") return false;
      if (window.GoToolkitMermaidSvgFallback === false) return false;
      return false;
    } catch (e) {
      return false;
    }
  };
  var parseSvgPathPoints = (d) => {
    const commands = d.match(/[MLCQ][^MLCQ]*/gi) || [];
    const points = [];
    commands.forEach((command) => {
      const type = command[0].toUpperCase();
      const raw = command.slice(1).trim();
      if (!raw) {
        return;
      }
      const numbers = raw.split(/[\s,]+/).map((value) => Number.parseFloat(value)).filter((value) => !Number.isNaN(value));
      if (numbers.length < 2) {
        return;
      }
      switch (type) {
        case "M":
        case "L":
          points.push({ x: numbers[0], y: numbers[1] });
          break;
        case "C":
        case "Q": {
          const x = numbers[numbers.length - 2];
          const y = numbers[numbers.length - 1];
          if (!Number.isNaN(x) && !Number.isNaN(y)) {
            points.push({ x, y });
          }
          break;
        }
        default:
          break;
      }
    });
    return points;
  };
  var toFiniteNumber = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };
  var sanitizeNumbersDeep = (value) => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeNumbersDeep(item));
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = sanitizeNumbersDeep(val);
    }
    return out;
  };
  var hasFinitePoint = (point) => {
    if (!Array.isArray(point) || point.length < 2) return false;
    return Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
  };
  var normalizeLinearPoints = (points) => {
    const normalized = [];
    for (const point of points) {
      const x = Number(point[0]);
      const y = Number(point[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      const last = normalized[normalized.length - 1];
      if (last && last[0] === x && last[1] === y) {
        continue;
      }
      normalized.push([x, y]);
    }
    return normalized;
  };
  var getLinearPathLength = (points) => {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      const [prevX, prevY] = points[index - 1];
      const [nextX, nextY] = points[index];
      total += Math.hypot(nextX - prevX, nextY - prevY);
    }
    return total;
  };
  var sanitizeSceneElements = (elements) => {
    const list = Array.isArray(elements) ? elements : [];
    const sanitized = [];
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const safeRaw = sanitizeNumbersDeep(raw);
      const x = toFiniteNumber(safeRaw.x, NaN);
      const y = toFiniteNumber(safeRaw.y, NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const normalized = {
        ...safeRaw,
        x,
        y
      };
      if ("width" in normalized) {
        normalized.width = Math.max(0, toFiniteNumber(normalized.width, 0));
      }
      if ("height" in normalized) {
        normalized.height = Math.max(0, toFiniteNumber(normalized.height, 0));
      }
      if (Array.isArray(normalized.points)) {
        const rawPoints = normalized.points.filter(hasFinitePoint).map((point) => [Number(point[0]), Number(point[1])]);
        const isLinear = normalized.type === "line" || normalized.type === "arrow";
        const points = isLinear ? normalizeLinearPoints(rawPoints) : rawPoints;
        if (isLinear) {
          if (points.length < 2) continue;
          if (!(getLinearPathLength(points) > 0)) continue;
        } else if (points.length < 1) {
          continue;
        }
        normalized.points = points;
      }
      if ("angle" in normalized) {
        normalized.angle = toFiniteNumber(normalized.angle, 0);
      }
      if ("strokeWidth" in normalized) {
        normalized.strokeWidth = Math.max(0, toFiniteNumber(normalized.strokeWidth, 1));
      }
      if ("opacity" in normalized) {
        normalized.opacity = Math.max(0, Math.min(100, toFiniteNumber(normalized.opacity, 100)));
      }
      sanitized.push(normalized);
    }
    return sanitized;
  };
  var EDGE_HOST_CLASS = "go-excalidraw-edge";
  var EDGE_STYLE_ID = "go-excalidraw-edge-style";
  var EDGE_STYLE_CONTENT = `.${EDGE_HOST_CLASS} .excalidraw .App-bottom-bar {
    margin: 0 !important;
    --bar-padding: 0 !important;
    padding-top: var(--sat, 0);
    padding-right: var(--sar, 0);
    padding-bottom: var(--sab, 0);
    padding-left: var(--sal, 0);
}

.${EDGE_HOST_CLASS} .excalidraw .App-bottom-bar > .Island {
    margin: 0;
    padding: 0;
    border-radius: 0;
    max-width: 100%;
}

.${EDGE_HOST_CLASS} .excalidraw .layer-ui__wrapper__top-left,
.${EDGE_HOST_CLASS} .excalidraw .layer-ui__wrapper__bottom-left {
    left: 0 !important;
    right: auto !important;
}

.${EDGE_HOST_CLASS} .excalidraw .layer-ui__wrapper__top-right,
.${EDGE_HOST_CLASS} .excalidraw .layer-ui__wrapper__bottom-right {
    right: 0 !important;
    left: auto !important;
}

.${EDGE_HOST_CLASS} .excalidraw .layer-ui__wrapper:is(.layer-ui__wrapper__top-left, .layer-ui__wrapper__top-right, .layer-ui__wrapper__bottom-left, .layer-ui__wrapper__bottom-right) {
    padding: 4px;
}

/* Move help button to bottom left and make it white */
.${EDGE_HOST_CLASS} .excalidraw .layer-ui__wrapper__bottom-right:has(.help-Icon) {
    right: auto !important;
    left: 0 !important;
}

.${EDGE_HOST_CLASS} .excalidraw .help-Icon,
.${EDGE_HOST_CLASS} .excalidraw .help-icon {
    background-color: #ffffff !important;
    color: #1b1b1f !important;
    padding: 4px !important;
}

/* Make Excalidraw UI more compact */
.${EDGE_HOST_CLASS} .excalidraw {
    --default-button-size: 1.5rem !important;
    --default-icon-size: 1.5rem !important;
    --lg-button-size :1.3rem !important;
    touch-action: none !important;
}

/* Dynamic font-size for App-menu__left based on size preset */
.${EDGE_HOST_CLASS}[data-size="small"] .excalidraw .Island.App-menu__left,
.${EDGE_HOST_CLASS}[data-size="small"] .excalidraw .Island.App-menu__left * { font-size: 10px !important; }
.${EDGE_HOST_CLASS}[data-size="medium"] .excalidraw .Island.App-menu__left, 
.${EDGE_HOST_CLASS}[data-size="medium"] .excalidraw .Island.App-menu__left * { font-size: 12px !important; }
.${EDGE_HOST_CLASS}[data-size="large"] .excalidraw .Island.App-menu__left,
.${EDGE_HOST_CLASS}[data-size="large"] .excalidraw .Island.App-menu__left * { font-size: 14px !important; }

.${EDGE_HOST_CLASS} .excalidraw .excalidraw__canvas {
    touch-action: none !important;
}

.${EDGE_HOST_CLASS} .excalidraw .Island {
    --island-padding: 4px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .App-menu__left {
     top: 55px!important;
    max-width: 140px !important;
    padding: 4px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .App-menu_bottom {
    align-items:bottom !important;
    bottom: 5px;
}

.${EDGE_HOST_CLASS} .excalidraw .Stack {
    gap: 4px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .ToolIcon__icon,
.${EDGE_HOST_CLASS} .excalidraw .ToolIcon__icon svg {
    width: 20px !important;
    height: 20px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .ToolIcon {
    width: 28px !important;
    height: 28px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .App-toolbar {
    padding: 4px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .App-toolbar-content {
    gap: 4px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .buttonList {
    gap: 4px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-button {
    width: 28px !important;
    height: 28px !important;
    padding: 4px !important;
}

/* Hide Library, Lock and Embeddable buttons */
.${EDGE_HOST_CLASS} .excalidraw .mobile-misc-tools-container,
.${EDGE_HOST_CLASS} .excalidraw .sidebar-trigger,
.${EDGE_HOST_CLASS} .excalidraw [data-testid="toolbar-embeddable"] {
    display: none !important;
}

.${EDGE_HOST_CLASS} .excalidraw .ToolIcon .ToolIcon__keybinding {
    bottom: 4px !important;
    right: 0px !important;
}

/* Change background color of buttons to surface color */
.${EDGE_HOST_CLASS} .excalidraw .Island,
.${EDGE_HOST_CLASS} .excalidraw .ToolIcon,
.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-button,
.${EDGE_HOST_CLASS} .excalidraw .App-toolbar,
.${EDGE_HOST_CLASS} .excalidraw .hint,
.${EDGE_HOST_CLASS} .excalidraw .help-Icon {
    background-color: #ffffff !important;
}

/* Smaller zoom and undo/redo buttons */
.${EDGE_HOST_CLASS} .excalidraw .zoom-actions,
.${EDGE_HOST_CLASS} .excalidraw .undo-redo-buttons {
    transform: scale(0.85);
    transform-origin: left bottom;
}

/* Compact Properties Panel (Right/Left side) */
.${EDGE_HOST_CLASS} .excalidraw .panel-column {
    gap: 4px !important;
    padding: 4px !important;
    width: auto !important;
    min-width: 160px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .fieldset {
    margin-bottom: 4px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .fieldset .legend {
    font-size: 10px !important;
    margin-bottom: 2px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .buttonList label {
    padding: 2px !important;
    font-size: 10px !important;
    min-height: 24px !important;
}

/* Hide color presets (swatches) and keep only custom picker */
.${EDGE_HOST_CLASS} .excalidraw .color-picker__swatches,
.${EDGE_HOST_CLASS} .excalidraw .color-picker__top-picks,
.${EDGE_HOST_CLASS} .excalidraw .color-picker__top-picks + .color-picker__separator {
    display: none !important;
}

.${EDGE_HOST_CLASS} .excalidraw .color-picker-container {
    padding: 4px !important;
    grid-template-columns: 0px 20px 1.625rem!important;
}

/* Compact Top-Left File Menu */
.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu {
    padding: 0px !important;
    min-width: 160px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-item {
    padding: 4px 8px !important;
    font-size: 12px !important;
    min-height: 24px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-separator {
    margin: 2px 0 !important;
}

/* Hide Social Links and Excalidraw branding in Menu */
.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-item[aria-label*="GitHub"],
.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-item[aria-label*="GitHub"],
.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-item[aria-label*="Discord"],
.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-item[aria-label*="Twitter"],
.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-item-base__socials,
.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu footer {
    display: none !important;
}

/* Higher z-index and compact Help Dialog */
.excalidraw-modal-container {
    z-index: 100000 !important;
}

.excalidraw-modal-container .HelpDialog {
    max-width: 900px !important;
}

.excalidraw-modal-container .HelpDialog__content {
    margin : 4px !important;
    padding: 4px !important;
    font-size: 11px !important;
}

.excalidraw-modal-container .HelpDialog button {
    padding: 4px 8px !important;
    font-size: 10px !important;
}

.excalidraw-modal-container .HelpDialog__shortcut-list {
    gap: 4px !important;
}

.excalidraw-modal-container .HelpDialog__shortcut {
    margin-bottom: 2px !important;
}
`;
  var createInitialData = () => ({
    elements: [],
    appState: {
      viewModeEnabled: false,
      viewBackgroundColor: "#fdfdfd",
      gridModeEnabled: false,
      isLoading: false,
      currentItemFontSize: DEFAULT_EXCALIDRAW_TEXT_SIZE,
      currentItemRoundness: "sharp",
      currentItemRoughness: 0,
      zoom: { value: 0.9 }
    }
  });
  var applyMermaidDefaults = (elements, options) => elements.map((element) => {
    var _a, _b, _c, _d, _e;
    const mustForceSolidStroke = element.type === "arrow";
    const targetFontSize = ((_a = options == null ? void 0 : options.fontSize) != null ? _a : MERMAID_OPTIONS.fontSize) + MERMAID_TEXT_SIZE_OFFSET;
    return {
      ...element,
      locked: false,
      ...element.type === "text" ? { fontSize: targetFontSize } : {},
      strokeWidth: (_c = (_b = options == null ? void 0 : options.strokeWidth) != null ? _b : element.strokeWidth) != null ? _c : MERMAID_ELEMENT_STYLE_DEFAULTS.strokeWidth,
      strokeStyle: mustForceSolidStroke ? "solid" : (_d = element.strokeStyle) != null ? _d : MERMAID_ELEMENT_STYLE_DEFAULTS.strokeStyle,
      roughness: (_e = options == null ? void 0 : options.roughness) != null ? _e : MERMAID_ELEMENT_STYLE_DEFAULTS.roughness,
      roundness: MERMAID_ELEMENT_STYLE_DEFAULTS.roundness
    };
  });
  var ExcalidrawBridge = class {
    constructor() {
      __publicField(this, "api", null);
      __publicField(this, "root", null);
      __publicField(this, "host", null);
      __publicField(this, "readyPromise", null);
    }
    initialize(container) {
      var _a;
      const host = typeof container === "string" ? document.getElementById(container) : container;
      if (!host) {
        return Promise.reject(new Error("Excalidraw host introuvable"));
      }
      if (this.host && host !== this.host) {
        (_a = this.root) == null ? void 0 : _a.unmount();
        this.root = null;
        this.api = null;
        this.readyPromise = null;
      }
      this.host = host;
      this.ensureEdgeStyles(host);
      if (!this.readyPromise) {
        this.readyPromise = new Promise((resolve, reject) => {
          try {
            this.root = createRoot(host);
          } catch (error) {
            reject(error);
            return;
          }
          let resolved = false;
          const handleReady = (instance) => {
            var _a2, _b;
            this.api = instance;
            instance.updateScene({
              appState: {
                viewModeEnabled: false,
                currentItemFontSize: DEFAULT_EXCALIDRAW_TEXT_SIZE,
                currentItemRoughness: 0,
                currentItemRoundness: "sharp"
              }
            });
            try {
              (_a2 = instance.setActiveTool) == null ? void 0 : _a2.call(instance, { type: "selection" });
              (_b = instance.refresh) == null ? void 0 : _b.call(instance);
            } catch (e) {
            }
            if (!resolved) {
              resolved = true;
              resolve(instance);
            }
          };
          const Surface = ({ onReady }) => {
            useEffect(() => {
              const hostEl = this.host;
              if (!hostEl) {
                return;
              }
              let boundEditor = null;
              const interceptTextEditorRelease = (event) => {
                var _a2;
                const target = event.currentTarget;
                if (!target) {
                  return;
                }
                if (document.activeElement !== target) {
                  return;
                }
                event.stopPropagation();
                (_a2 = event.stopImmediatePropagation) == null ? void 0 : _a2.call(event);
              };
              const bindEditor = (editor) => {
                if (boundEditor === editor) {
                  return;
                }
                if (boundEditor) {
                  boundEditor.removeEventListener("pointerup", interceptTextEditorRelease, true);
                  boundEditor.removeEventListener("mouseup", interceptTextEditorRelease, true);
                  boundEditor.removeEventListener("dblclick", interceptTextEditorRelease, true);
                }
                boundEditor = editor;
                if (!boundEditor) {
                  return;
                }
                boundEditor.addEventListener("pointerup", interceptTextEditorRelease, true);
                boundEditor.addEventListener("mouseup", interceptTextEditorRelease, true);
                boundEditor.addEventListener("dblclick", interceptTextEditorRelease, true);
              };
              const syncActiveEditor = () => {
                const editor = hostEl.querySelector(
                  ".excalidraw-textEditorContainer textarea, .text-editor-container textarea"
                );
                bindEditor(editor);
              };
              const handleFocusIn = () => {
                syncActiveEditor();
              };
              const handlePointerDown = (event) => {
                const target = event.target;
                if (!target) {
                  return;
                }
                const textEditor = target.closest("textarea");
                if (!textEditor || !hostEl.contains(textEditor)) {
                  return;
                }
                bindEditor(textEditor);
              };
              hostEl.addEventListener("focusin", handleFocusIn, true);
              hostEl.addEventListener("pointerdown", handlePointerDown, true);
              syncActiveEditor();
              return () => {
                hostEl.removeEventListener("focusin", handleFocusIn, true);
                hostEl.removeEventListener("pointerdown", handlePointerDown, true);
                bindEditor(null);
              };
            }, []);
            const syncApi = useCallback(
              (api) => {
                if (api) {
                  onReady(api);
                }
              },
              [onReady]
            );
            const { Excalidraw } = getExcalidrawExports();
            const ExcalidrawAny = Excalidraw;
            return /* @__PURE__ */ jsx(
              ExcalidrawAny,
              {
                excalidrawAPI: syncApi,
                theme: "light",
                viewModeEnabled: false,
                gridModeEnabled: false,
                zenModeEnabled: false,
                initialData: createInitialData(),
                generateIdForFile: () => {
                  return Math.random().toString(36).substring(2, 15);
                }
              }
            );
          };
          this.root.render(/* @__PURE__ */ jsx(Surface, { onReady: handleReady }));
        });
      }
      return this.readyPromise.then(() => void 0);
    }
    updateSize(size) {
      if (this.host) {
        this.host.setAttribute("data-size", size);
      }
    }
    async convertMermaid(code, options) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
      const trimmed = code == null ? void 0 : code.trim();
      if (!trimmed) {
        return null;
      }
      if (!window.mermaid) {
        try {
          await ((_b = (_a = window.GoToolkitLazyCdn) == null ? void 0 : _a.loadMermaid) == null ? void 0 : _b.call(_a));
        } catch (error) {
          console.error("Failed to lazy-load mermaid runtime", error);
        }
      }
      if (!window.mermaid) {
        throw new Error("Mermaid runtime unavailable");
      }
      const fontSize = (_c = options == null ? void 0 : options.fontSize) != null ? _c : MERMAID_OPTIONS.fontSize;
      const isFlowchart = /^\s*(flowchart|graph)\b/i.test(trimmed);
      const mermaidConfig = {
        themeVariables: {
          fontSize: `${fontSize}px`
        },
        flowchart: {
          curve: "linear",
          padding: (_e = (_d = options == null ? void 0 : options.flowchart) == null ? void 0 : _d.padding) != null ? _e : 24,
          nodeSpacing: (_g = (_f = options == null ? void 0 : options.flowchart) == null ? void 0 : _f.nodeSpacing) != null ? _g : 80,
          rankSpacing: (_i = (_h = options == null ? void 0 : options.flowchart) == null ? void 0 : _h.rankSpacing) != null ? _i : 80,
          htmlLabels: (_k = (_j = options == null ? void 0 : options.flowchart) == null ? void 0 : _j.htmlLabels) != null ? _k : true
        },
        sequence: (_l = options == null ? void 0 : options.sequence) != null ? _l : {},
        class: (_m = options == null ? void 0 : options.class) != null ? _m : {}
      };
      try {
        const mermaidApi = window.mermaid;
        const siteConfig = {
          ...mermaidConfig,
          flowchart: {
            ...mermaidConfig.flowchart,
            curve: "basis",
            nodeSpacing: 50,
            rankSpacing: 50,
            padding: 15
          }
        };
        if (typeof ((_n = mermaidApi == null ? void 0 : mermaidApi.mermaidAPI) == null ? void 0 : _n.reset) === "function") {
          mermaidApi.mermaidAPI.reset();
        }
        if (typeof ((_o = mermaidApi == null ? void 0 : mermaidApi.mermaidAPI) == null ? void 0 : _o.updateSiteConfig) === "function") {
          mermaidApi.mermaidAPI.updateSiteConfig(siteConfig);
        }
        if (typeof ((_p = mermaidApi == null ? void 0 : mermaidApi.mermaidAPI) == null ? void 0 : _p.setConfig) === "function") {
          mermaidApi.mermaidAPI.setConfig(siteConfig);
        } else if (typeof (mermaidApi == null ? void 0 : mermaidApi.initialize) === "function") {
          mermaidApi.initialize({
            startOnLoad: false,
            ...siteConfig
          });
        }
      } catch (e) {
      }
      await Promise.resolve();
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      let parsed = await parseMermaidToExcalidraw(trimmed, mermaidConfig);
      const baseSkeleton = Array.isArray(parsed == null ? void 0 : parsed.elements) ? parsed == null ? void 0 : parsed.elements : [];
      if (!baseSkeleton.length) {
        return null;
      }
      const skeleton = [...baseSkeleton];
      const hasLineElements = skeleton.some(
        (el) => (el == null ? void 0 : el.type) === "line" || (el == null ? void 0 : el.type) === "arrow"
      );
      if (!hasLineElements && isMermaidSvgFallbackEnabled()) {
        try {
          const mermaidApi = window.mermaid;
          if (mermaidApi == null ? void 0 : mermaidApi.render) {
            const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const { svg } = await mermaidApi.render(id, trimmed);
            const container = document.createElement("div");
            container.innerHTML = svg;
            const markerCount = container.querySelectorAll("marker").length;
            const markerEndCount = container.querySelectorAll("[marker-end]").length;
            const markerStartCount = container.querySelectorAll("[marker-start]").length;
            const edgePaths = Array.from(
              container.querySelectorAll(
                "path.flowchart-link, g.edgePath path, path.edgePath, path.edge-path, path.link, path[marker-end], path[marker-start]"
              )
            );
            const fallbackArrows = edgePaths.map((pathEl) => {
              const dAttr = pathEl.getAttribute("d");
              if (!dAttr) {
                return null;
              }
              const points = parseSvgPathPoints(dAttr);
              if (points.length < 2) {
                return null;
              }
              const start = points[0];
              const relPoints = points.map((point) => [
                point.x - start.x,
                point.y - start.y
              ]);
              if (relPoints.length >= 2) {
                const minTail = 36;
                const inset = 18;
                const tailIndex = relPoints.length - 2;
                const headIndex = relPoints.length - 1;
                const [tailX, tailY] = relPoints[tailIndex];
                const [headX, headY] = relPoints[headIndex];
                const dx = headX - tailX;
                const dy = headY - tailY;
                const dist = Math.hypot(dx, dy);
                if (dist > 0) {
                  const target = Math.min(dist, Math.max(dist - inset, minTail));
                  if (target !== dist) {
                    const scale = target / dist;
                    relPoints[headIndex] = [tailX + dx * scale, tailY + dy * scale];
                  }
                } else {
                  relPoints[headIndex] = [tailX + minTail, tailY];
                }
              }
              const classList = Array.from(pathEl.classList);
              const strokeStyle = classList.some(
                (token) => token.includes("edge-pattern-dotted") || token.includes("edge-pattern-dashed")
              ) ? "dashed" : "solid";
              const strokeWidth = classList.some(
                (token) => token.includes("edge-thickness-thick")
              ) ? 4 : 2;
              return {
                type: "arrow",
                x: start.x,
                y: start.y,
                points: relPoints,
                strokeWidth,
                strokeStyle,
                roundness: { type: 2 },
                endArrowhead: "arrow"
              };
            }).filter(Boolean);
            if (fallbackArrows.length) {
              skeleton.push(...fallbackArrows);
            }
          }
        } catch (error) {
          console.warn("[GoToolkit][Mermaid->Excalidraw] svg edge fallback failed", error);
        }
      }
      const { convertToExcalidrawElements } = getExcalidrawExports();
      const converted = convertToExcalidrawElements(skeleton);
      const normalizedElements = Array.isArray(converted) ? converted : [];
      if (!normalizedElements.length) {
        return null;
      }
      const arrowNormalizedElements = isFlowchart ? normalizedElements.map((element) => {
        const linear = element.type === "line" || element.type === "arrow";
        if (!linear) return element;
        const hasArrowHead = element.endArrowhead != null || element.startArrowhead != null;
        if (element.type === "line") {
          return {
            ...element,
            type: "arrow",
            endArrowhead: hasArrowHead ? element.endArrowhead : "arrow"
          };
        }
        if (element.type === "arrow" && !hasArrowHead) {
          return {
            ...element,
            endArrowhead: "arrow"
          };
        }
        return element;
      }) : normalizedElements;
      const normalizedFiles = (parsed == null ? void 0 : parsed.files) || null;
      const sharpElements = applyMermaidDefaults(arrowNormalizedElements, options);
      const safeElements = sanitizeSceneElements(sharpElements);
      if (!safeElements.length) {
        return null;
      }
      return {
        elements: safeElements,
        files: normalizedFiles || void 0
      };
    }
    applyScene(scene, shouldCenter = true) {
      var _a, _b, _c, _d;
      const api = this.ensureApi();
      const appState = api.getAppState();
      const safeElements = sanitizeSceneElements(scene == null ? void 0 : scene.elements);
      if (!safeElements.length) {
        api.updateScene({
          elements: [],
          appState: {
            ...appState,
            viewModeEnabled: false,
            activeTool: { type: "selection" },
            isLoading: false
          }
        });
        return;
      }
      const payload = {
        elements: safeElements.map((el) => ({ ...el, locked: false })),
        appState: {
          ...appState,
          viewModeEnabled: false,
          activeTool: { type: "selection" },
          viewBackgroundColor: "#fdfdfd",
          gridModeEnabled: false,
          isLoading: false,
          currentItemFontSize: DEFAULT_EXCALIDRAW_TEXT_SIZE,
          currentItemRoundness: "sharp",
          currentItemRoughness: 0,
          zoom: ((_a = appState == null ? void 0 : appState.zoom) == null ? void 0 : _a.value) ? appState.zoom : { value: 0.9 }
        }
      };
      if (scene.files) {
        payload.files = scene.files;
      }
      api.updateScene(payload);
      try {
        (_b = api.setActiveTool) == null ? void 0 : _b.call(api, { type: "selection" });
        (_c = api.refresh) == null ? void 0 : _c.call(api);
      } catch (e) {
      }
      if (shouldCenter && safeElements.length > 0) {
        setTimeout(() => {
          api.scrollToContent(safeElements, {
            fitToViewport: true
          });
        }, 50);
      }
      if (scene.files) {
        const fileList = Object.values(scene.files);
        if (fileList.length) {
          (_d = api.addFiles) == null ? void 0 : _d.call(api, fileList);
        }
      }
    }
    getApi() {
      return this.api;
    }
    ensureApi() {
      if (!this.api) {
        throw new Error("Excalidraw API non initialis\xE9");
      }
      return this.api;
    }
    ensureEdgeStyles(host) {
      host.classList.add(EDGE_HOST_CLASS);
      if (document.getElementById(EDGE_STYLE_ID)) {
        return;
      }
      const styleEl = document.createElement("style");
      styleEl.id = EDGE_STYLE_ID;
      styleEl.textContent = EDGE_STYLE_CONTENT;
      document.head.appendChild(styleEl);
    }
  };
  var bridge = new ExcalidrawBridge();
  window.GoToolkitExcalidraw = {
    initialize: (container) => bridge.initialize(container),
    convertMermaid: (code, options) => bridge.convertMermaid(code, options),
    applyScene: (scene, shouldCenter) => bridge.applyScene(scene, shouldCenter),
    getApi: () => bridge.getApi(),
    getSceneBounds: (elements) => {
      const { getCommonBounds } = getExcalidrawExports();
      const [minX, minY, maxX, maxY] = getCommonBounds(elements);
      const toFinite = (value, fallback = 0) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
      };
      const safeMinX = toFinite(minX);
      const safeMinY = toFinite(minY);
      const safeMaxX = toFinite(maxX, safeMinX);
      const safeMaxY = toFinite(maxY, safeMinY);
      return {
        minX: safeMinX,
        minY: safeMinY,
        maxX: safeMaxX,
        maxY: safeMaxY,
        width: Math.max(0, safeMaxX - safeMinX),
        height: Math.max(0, safeMaxY - safeMinY)
      };
    },
    exportToSvg: (elements, appState, files) => {
      const { exportToSvg } = getExcalidrawExports();
      const safeElements = sanitizeSceneElements(elements);
      return exportToSvg({ elements: safeElements, appState, files });
    },
    exportToSvgWithZoom: (elements, appState, files, zoom) => (() => {
      var _a;
      const { exportToSvg } = getExcalidrawExports();
      const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0 ? Number(zoom) : Number((_a = appState == null ? void 0 : appState.zoom) == null ? void 0 : _a.value) > 0 ? Number(appState.zoom.value) : 1;
      const safeElements = sanitizeSceneElements(elements);
      return exportToSvg({
        elements: safeElements,
        appState: { ...appState, zoom: { value: safeZoom } },
        files
      }).catch(
        () => exportToSvg({
          elements: safeElements,
          appState: { ...appState, zoom: { value: 1 } },
          files
        })
      );
    })()
  };
})();
/*! Bundled license information:

ieee754/index.js:
  (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)

buffer/index.js:
  (*!
   * The buffer module from node.js, for the browser.
   *
   * @author   Feross Aboukhadijeh <https://feross.org>
   * @license  MIT
   *)
*/
