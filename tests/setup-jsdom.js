// Setup file for jsdom tests — patches Node v22+ native localStorage stub
// with a real in-memory Storage implementation so tests can use localStorage.clear()

if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
  // If localStorage.clear is not a function, Node's native stub is shadowing jsdom's.
  // Replace it with a simple in-memory map that implements the Web Storage API.
  if (typeof localStorage.clear !== "function") {
    const store = new Map();
    const fakeStorage = {
      get length() {
        return store.size;
      },
      key(n) {
        return Array.from(store.keys())[n] ?? null;
      },
      getItem(k) {
        return store.has(k) ? store.get(k) : null;
      },
      setItem(k, v) {
        store.set(String(k), String(v));
      },
      removeItem(k) {
        store.delete(k);
      },
      clear() {
        store.clear();
      },
    };
    Object.defineProperty(globalThis, "localStorage", {
      value: fakeStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "localStorage", {
      value: fakeStorage,
      writable: true,
      configurable: true,
    });
  }
}
