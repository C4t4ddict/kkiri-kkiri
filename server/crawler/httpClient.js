const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const parseRobots = (content) => {
  const groups = [];
  let current = null;
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line || !line.includes(':')) continue;
    const separator = line.indexOf(':');
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'user-agent') {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (key === 'allow' || key === 'disallow')) {
      current.rules.push({ type: key, path: value });
    }
  }
  return groups;
};

const isAllowedByRobots = (content, targetUrl) => {
  const pathname = new URL(targetUrl).pathname;
  const rules = parseRobots(content)
    .filter((group) => group.agents.includes('*'))
    .flatMap((group) => group.rules)
    .filter((rule) => rule.path && pathname.startsWith(rule.path))
    .sort((left, right) => right.path.length - left.path.length || (left.type === 'allow' ? -1 : 1));
  return !rules.length || rules[0].type === 'allow';
};

class HttpClient {
  constructor(options = {}) {
    this.userAgent = options.userAgent;
    this.delayMs = options.delayMs ?? 1000;
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.retries = options.retries ?? 3;
    this.respectRobots = options.respectRobots ?? true;
    this.lastRequestAt = new Map();
    this.robotsCache = new Map();
  }

  async waitForHost(url) {
    const origin = new URL(url).origin;
    const elapsed = Date.now() - (this.lastRequestAt.get(origin) || 0);
    if (elapsed < this.delayMs) await sleep(this.delayMs - elapsed);
    this.lastRequestAt.set(origin, Date.now());
  }

  async request(url, options = {}) {
    let lastError;
    for (let attempt = 0; attempt < this.retries; attempt += 1) {
      let timeout;
      try {
        await this.waitForHost(url);
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        const { accept, ...fetchOptions } = options;
        const response = await fetch(url, {
          ...fetchOptions,
          headers: {
            Accept: accept || 'text/html,application/xhtml+xml,application/json',
            'User-Agent': this.userAgent,
            ...options.headers,
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${url}`);
          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt + 1 >= this.retries || error.retryable === false) break;
        await sleep(Math.min(1000 * 2 ** attempt, 5000));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError;
  }

  async ensureAllowed(url) {
    if (!this.respectRobots) return;
    const origin = new URL(url).origin;
    if (!this.robotsCache.has(origin)) {
      this.robotsCache.set(origin, this.request(`${origin}/robots.txt`, { accept: 'text/plain' }).then((response) => response.text()));
    }
    const robots = await this.robotsCache.get(origin);
    if (!isAllowedByRobots(robots, url)) {
      throw new Error(`robots.txt에서 수집이 허용되지 않은 경로입니다: ${url}`);
    }
  }

  async fetchHtml(url, options = {}) {
    await this.ensureAllowed(url);
    const response = await this.request(url, options);
    return response.text();
  }

  async fetchJson(url, options = {}) {
    await this.ensureAllowed(url);
    const response = await this.request(url, {
      ...options,
      accept: 'application/json',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return response.json();
  }
}

module.exports = { HttpClient, isAllowedByRobots, parseRobots };
