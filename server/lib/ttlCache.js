const createTtlCache = ({ ttlMs = 30_000, maxEntries = 100 } = {}) => {
  const entries = new Map();
  const inFlight = new Map();

  const get = (key) => {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      entries.delete(key);
      return undefined;
    }
    entries.delete(key);
    entries.set(key, entry);
    return entry.value;
  };

  const set = (key, value) => {
    entries.delete(key);
    entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  };

  const remember = async (key, loader) => {
    const cached = get(key);
    if (cached !== undefined) return cached;
    if (inFlight.has(key)) return inFlight.get(key);

    const pending = Promise.resolve()
      .then(loader)
      .then((value) => {
        set(key, value);
        return value;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  };

  return {
    get,
    set,
    remember,
    clear: () => entries.clear(),
    size: () => entries.size,
    pending: () => inFlight.size,
  };
};

module.exports = { createTtlCache };
