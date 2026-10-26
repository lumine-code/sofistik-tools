// The second legacy WING rule is a line-wide negative lookbehind. Keep its
// exact result using a small streaming state instead of materializing the line.
async function appendMissingScale(source, { signal, isCurrent = () => true } = {}) {
  let lineStart = 0,
    output = source.subtext(0, 0),
    cursor = 0,
    offset = 0;
  let prefix = "",
    tail = "",
    hasScale = false;
  let deadline = performance.now() + 4;
  const current = () => {
    signal?.throwIfAborted();
    if (!isCurrent())
      throw Object.assign(new Error("SOFiSTiK operation cancelled"), { name: "AbortError" });
  };
  const finish = (end) => {
    if (prefix.toUpperCase() === "AND " && !hasScale) {
      output = output.replace(output.length, output.length, source.subtext(cursor, lineStart));
      output = output.replace(output.length, output.length, "AND ");
      output = output.replace(output.length, output.length, source.subtext(lineStart + 4, end));
      output = output.replace(output.length, output.length, " MSCA NO");
      cursor = end;
    }
    prefix = "";
    tail = "";
    hasScale = false;
    lineStart = end + 1;
  };
  for (const chunk of source.chunks()) {
    current();
    let start = 0;
    const part = (end) => {
      const text = chunk.slice(start, end);
      if (prefix.length < 4) prefix += text.slice(0, 4 - prefix.length);
      if (!hasScale && /^AND /i.test(prefix)) {
        hasScale = /MSCA /i.test(tail + text);
        tail = (tail + text).slice(-4);
      }
    };
    for (const match of chunk.matchAll(/[\r\n\u2028\u2029]/g)) {
      part(match.index);
      finish(offset + match.index);
      start = match.index + 1;
    }
    part(chunk.length);
    offset += chunk.length;
    if (performance.now() >= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      deadline = performance.now() + 4;
    }
  }
  current();
  finish(source.length);
  return output.replace(output.length, output.length, source.subtext(cursor, source.length));
}

module.exports = { appendMissingScale };
