const { rowBounds } = require("./source-snapshot");
const { consume, MAX_IDENTIFIER, limitError, scopesAt } = require("./source-structure");

function* logicalLines(source) {
  let start = 0,
    offset = 0;
  for (const chunk of source.chunks()) {
    for (const match of chunk.matchAll(/[\r\n\u2028\u2029]/g)) {
      yield { start, end: offset + match.index };
      start = offset + match.index + 1;
    }
    offset += chunk.length;
    yield;
  }
  yield { start, end: source.length };
}

function* scanCalculationFiles(source) {
  for (const line of logicalLines(source)) {
    yield;
    if (!line) continue;
    const { start, end } = line;
    if (source.charCodeAt(start) !== 64) continue;
    const token = yield* consume(source, start + 1, end, /^[ \t]*/);
    if (token === start + 1) continue;
    const prefix = source.slice(token, Math.min(end, token + 15));
    if (/^only-children\b/i.test(prefix)) yield { onlyChildren: true };
    else if (/^child:/i.test(prefix) && token + 6 < end) {
      if (end - token - 6 > MAX_IDENTIFIER) throw limitError();
      yield { child: source.slice(token + 6, end).trim() };
    }
  }
}

function* scanManualDestination(context, source, commands, range) {
  if (
    commands.length > 100000 ||
    commands.some((value) => typeof value !== "string" || value.length > MAX_IDENTIFIER)
  )
    throw limitError();
  const names = new Set(commands.map((value) => value.toUpperCase()));
  const maxName = commands.reduce((length, value) => Math.max(length, value.length), 0);
  const point = (value) => (Array.isArray(value) ? value : [value.row, value.column]);
  const [startRow, startColumn] = point(range[0]);
  const [endRow, endColumn] = point(range[1]);
  let destination = null;
  for (let row = startRow; row <= Math.min(endRow, source.lineCount - 1); row++) {
    const bounds = rowBounds(source, row);
    const start = bounds.start + (row === startRow ? startColumn : 0);
    const end = Math.min(bounds.end, row === endRow ? bounds.start + endColumn : bounds.end);
    function* statement(at, separated) {
      const token = yield* consume(source, at, end, separated ? /^ */ : /^[ \t]*/);
      const finish = yield* consume(source, token, Math.min(end, token + maxName + 1), /^\w*/);
      if (finish - token > maxName) return;
      if (finish === token) return;
      const name = source.slice(token, finish).toUpperCase();
      if (
        names.has(name) &&
        !scopesAt(context, row, at - bounds.start - (separated ? 1 : 0)).some((scope) =>
          /^(?:comment|string)(?:\.|$)/.test(scope),
        )
      )
        destination = name;
    }
    if (start === bounds.start) yield* statement(start, false);
    const read = source.reader(32768);
    for (let offset = start; offset < end;) {
      const part = read(offset).slice(0, end - offset);
      for (const match of part.matchAll(/[;\r\u2028\u2029]/g))
        yield* statement(offset + match.index + 1, match[0] === ";");
      offset += part.length;
      yield;
    }
  }
  if (destination !== null) yield destination;
}

module.exports = { scanCalculationFiles, scanManualDestination };
