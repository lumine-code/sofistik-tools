const { MAX_RECORDS, limitError } = require("./source-structure");

// Return synchronously only if all work finishes in one scheduling budget.
// Dense small documents and single enormous lines both yield cooperatively.
function collect(iterator, source, { signal, isCurrent = () => true } = {}) {
  if (!Number.isSafeInteger(source?.length)) throw new TypeError("Expected a text snapshot");
  const records = [];
  const current = () => !signal?.aborted && isCurrent();
  const pump = () => {
    const deadline = performance.now() + 4;
    do {
      if (!current()) {
        iterator.return?.();
        return { value: null };
      }
      const step = iterator.next();
      if (step.done) return { value: Object.freeze(records) };
      if (step.value !== undefined && step.value !== null) {
        if (records.length >= MAX_RECORDS) throw limitError();
        records.push(step.value);
      }
    } while (performance.now() < deadline);
    return null;
  };
  const result = pump();
  if (result) return result.value;
  return (async () => {
    try {
      while (true) {
        await new Promise((resolve) => setImmediate(resolve));
        const result = pump();
        if (result) return result.value;
      }
    } finally {
      iterator.return?.();
    }
  })();
}

module.exports = { collect };
