const { rowBounds } = require("./source-snapshot");

const MAX_RECORDS = 100000;
const MAX_IDENTIFIER = 65536;
const MAX_INSPECTIONS = 200000;

function limitError() {
  return Object.assign(
    new RangeError(
      "SOFiSTiK structure exceeds its metadata budget (100,000 records, 200,000 lexical inspections, 64 Ki UTF-16 per identifier). No source text was changed.",
    ),
    { code: "ERR_SOFISTIK_STRUCTURE_LIMIT" },
  );
}

function scopesAt(context, row, column) {
  const descriptor = context.scopeDescriptorForBufferPosition?.([row, column]);
  return descriptor?.getScopes?.() || descriptor?.scopes || String(descriptor || "").split(/\s+/);
}

function* consume(source, offset, end, pattern) {
  const read = source.reader(32768);
  while (offset < end) {
    const part = read(offset).slice(0, end - offset),
      count = pattern.exec(part)?.[0].length ?? 0;
    offset += count;
    yield;
    if (count < part.length) break;
  }
  return offset;
}

function* delimiter(source, offset, end, character) {
  const read = source.reader(32768);
  while (offset < end) {
    const part = read(offset).slice(0, end - offset),
      index = part.indexOf(character);
    if (index >= 0) return offset + index;
    offset += part.length;
    yield;
  }
  return end;
}

function* moduleAt(source, offset, end) {
  const start = yield* consume(source, offset, end, /^[ \t]*/);
  if (start === offset || !/[A-Za-z]/.test(source.slice(start, Math.min(start + 1, end))))
    return null;
  const finish = yield* consume(
    source,
    start,
    Math.min(end, start + MAX_IDENTIFIER + 1),
    /^[A-Za-z0-9_]*/,
  );
  if (finish - start > MAX_IDENTIFIER) throw limitError();
  if (finish !== end && !/[ \t;]/.test(source.slice(finish, finish + 1))) return null;
  return source.slice(start, finish);
}

function* assignmentAt(source, offset, end) {
  let cursor = yield* consume(source, offset, end, /^[ \t]*/);
  if (cursor === offset) return false;
  if (source.charCodeAt(cursor) === 35) cursor++;
  const start = cursor;
  cursor = yield* consume(source, cursor, end, /^[A-Za-z0-9_.-]*/);
  if (cursor === start) return false;
  cursor = yield* consume(source, cursor, end, /^[ \t]*/);
  return cursor < end && source.charCodeAt(cursor) === 61;
}

function* ursAt(source, start, end, row, rowStart) {
  let whitespace = null,
    offset = start;
  const read = source.reader(32768);
  while (offset < end) {
    const part = read(offset).slice(0, end - offset);
    for (let index = 0; index < part.length; index++) {
      const character = part[index],
        position = offset + index;
      if (character === " " || character === "\t") {
        whitespace ??= position;
        continue;
      }
      if (
        whitespace !== null &&
        /^URS\b/i.test(source.slice(position, Math.min(position + 4, end)))
      )
        return [
          [row, whitespace - rowStart],
          [row, end - rowStart],
        ];
      whitespace = null;
    }
    offset += part.length;
    yield;
  }
  return null;
}

function* rowEvents(context, source, row, inspect) {
  const { start, end } = rowBounds(source, row);
  const first = yield* consume(source, start, end, /^\s*/);
  if (first === end) return { events: [], continued: false, first: end - start };
  const events = [];
  const add = (event) => {
    if (events.length >= MAX_RECORDS) throw limitError();
    events.push(event);
  };
  function* statement(at, separated) {
    const tokenStart = yield* consume(source, at, end, /^[ \t\uFEFF]*/);
    if (tokenStart >= end) return;
    const prefix = source.slice(tokenStart, Math.min(tokenStart + 12, end));
    const directive = /^([+\-$]?)(PROG|SYS|APPLY|CHAPTER)\b/i.exec(prefix);
    if (directive) {
      const headerEnd = yield* delimiter(source, tokenStart + directive[0].length, end, ";");
      const module = yield* moduleAt(source, tokenStart + directive[0].length, headerEnd);
      const kind = directive[2].toUpperCase();
      const ursRange =
        kind === "PROG"
          ? yield* ursAt(source, tokenStart + directive[0].length, headerEnd, row, start)
          : null;
      add({
        column: tokenStart - start,
        prefix: directive[1],
        kind,
        module,
        headerEnd: headerEnd - start,
        ursRange,
        directive: true,
      });
      return;
    }
    // Directive roots permit BOM whitespace; macro controls permit only tabs/spaces.
    const controlStart = yield* consume(source, at, end, /^[ \t]*/);
    if (controlStart !== tokenStart) return;
    const control = /^(#DEFINE\b|#ENDDEF\b|TXAB\b|TXBB\b|TXEB\b|TXEN\b)/i.exec(prefix);
    if (control)
      add({
        column: tokenStart - start,
        name: control[1].toUpperCase(),
        separated,
        assignment:
          control[1].toUpperCase() === "#DEFINE" &&
          (yield* assignmentAt(source, tokenStart + control[1].length, end)),
      });
  }
  yield* statement(start, false);
  let nextContinuation = start,
    continued = false,
    continuationStopped = false,
    offset = start;
  const read = source.reader(32768);
  while (offset < end) {
    const part = read(offset).slice(0, end - offset);
    for (const match of part.matchAll(/[;$<]/g)) {
      const position = offset + match.index,
        column = position - start;
      if (match[0] === ";") yield* statement(position + 1, true);
      else if (match[0] === "<") {
        const token = /^(<TEXT(?=[>, \t]|$)|<[/\\]TEXT>)/i.exec(
          source.slice(position, Math.min(position + 8, end)),
        );
        if (token) add({ column, name: token[1].toUpperCase(), textControl: true });
      } else if (
        !continued &&
        !continuationStopped &&
        position >= nextContinuation &&
        source.charCodeAt(position + 1) === 36
      ) {
        nextContinuation = position + 2;
        if (first >= position) continuationStopped = true;
        else {
          const scopes = inspect(row, column),
            preceding = inspect(row, Math.max(0, column - 1));
          if (
            !scopes.some((scope) => /^string(?:\.|$)/.test(scope)) &&
            !preceding.some((scope) => /^comment(?:\.|$)/.test(scope))
          )
            continued = true;
        }
      }
    }
    offset += part.length;
    yield;
  }
  events.sort((a, b) => a.column - b.column);
  return { events, continued, first: first - start };
}

function* scanSourceDirectives(context, source) {
  let macroDepth = 0,
    continued = false,
    textBlock = false,
    legacyText = false,
    records = 0,
    inspections = 0;
  const inspect = (row, column) => {
    if (++inspections > MAX_INSPECTIONS) throw limitError();
    return scopesAt(context, row, column);
  };
  const blocked = (row, column) =>
    inspect(row, column).some((scope) => /^(?:comment|string)(?:\.|$)/.test(scope));
  const quoted = (row, column) =>
    inspect(row, column).some((scope) => /^string\.(?:single|double)(?:\.|$)/.test(scope));
  for (let row = 0; row < source.lineCount; row++) {
    yield;
    const joined = continued,
      line = yield* rowEvents(context, source, row, inspect);
    continued = line.continued;
    for (const event of line.events) {
      const { column, name } = event;
      if (textBlock) {
        if (/^<[/\\]TEXT>$/i.test(name) && !quoted(row, column)) textBlock = false;
        continue;
      }
      if (legacyText) {
        if (name === "TXEN" && !quoted(row, column)) legacyText = false;
        continue;
      }
      if (event.directive) {
        const disabledComment =
          event.prefix === "$" && event.kind === "PROG" && line.first === column;
        if (macroDepth || joined || (blocked(row, column) && !disabledComment)) continue;
        if (++records > MAX_RECORDS) throw limitError();
        yield Object.freeze({
          row,
          column,
          kind: event.kind,
          prefix: event.prefix,
          active: event.prefix !== "-" && event.prefix !== "$",
          module: event.module,
          range: Object.freeze([
            [row, column],
            [row, column + event.prefix.length + event.kind.length],
          ]),
          headerRange: Object.freeze([
            [row, column],
            [row, event.headerEnd],
          ]),
          leading: line.first === column,
          ursRange: event.ursRange,
        });
        continue;
      }
      if ((joined && !event.textControl && !event.separated) || blocked(row, column)) continue;
      if (name.startsWith("<TEXT")) textBlock = true;
      else if (["TXAB", "TXBB", "TXEB"].includes(name)) legacyText = true;
      else if (name === "#ENDDEF") macroDepth = Math.max(0, macroDepth - 1);
      else if (name === "#DEFINE") {
        if (event.assignment) {
          continued = false;
          break;
        }
        macroDepth++;
      }
    }
  }
}

module.exports = {
  scanSourceDirectives,
  consume,
  delimiter,
  limitError,
  MAX_RECORDS,
  MAX_IDENTIFIER,
  scopesAt,
};
