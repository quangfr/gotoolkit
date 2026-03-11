const getMermaidRuntime = () => {
  const runtime = (window as any).mermaid;
  if (!runtime) {
    throw new Error("Mermaid runtime unavailable");
  }
  return runtime;
};

const mermaid = new Proxy({}, {
  get(_target, prop) {
    return getMermaidRuntime()[prop as keyof ReturnType<typeof getMermaidRuntime>];
  },
  set(_target, prop, value) {
    getMermaidRuntime()[prop as keyof ReturnType<typeof getMermaidRuntime>] = value;
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
      value: getMermaidRuntime()[prop as keyof ReturnType<typeof getMermaidRuntime>],
    };
  },
});

export default mermaid;
