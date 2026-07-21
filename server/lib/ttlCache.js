const createTtlCache = ({ ttlMs = 30_000, maxEntries = 100 } = {}) => {
  const entries = new Map();

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

  return { get, set, clear: () => entries.clear(), size: () => entries.size };
};

module.exports = { createTtlCache };
