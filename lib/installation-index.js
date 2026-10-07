const { findFiles } = require("./ripgrep");

class InstallationIndex {
  constructor(active, scan = findFiles) {
    this.active = active;
    this.scan = scan;
    this.generation = 0;
    this.request = null;
    this.cache = null;
  }

  invalidate() {
    this.generation++;
    this.request?.abort.abort();
    this.request = null;
    this.cache = null;
  }

  async read(directory, language, pattern, build) {
    if (!this.active()) return;
    const key = JSON.stringify([directory, language, pattern]);
    if (this.cache?.key === key) return this.cache.items;
    if (this.request?.key === key) return this.request.promise;
    this.invalidate();
    const generation = this.generation;
    const abort = new AbortController();
    const promise = this.scan(directory, pattern, { signal: abort.signal })
      .then((files) => {
        if (generation !== this.generation || !this.active() || abort.signal.aborted) return;
        const items = build(files, directory, language);
        this.cache = { key, items };
        this.request = null;
        return items;
      })
      .finally(() => {
        if (this.request?.promise === promise) this.request = null;
      });
    this.request = { key, abort, promise };
    return promise;
  }

  dispose() {
    this.invalidate();
  }
}

module.exports = InstallationIndex;
