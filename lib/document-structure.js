function scopesAt(editor, row, column) {
  const descriptor = editor.scopeDescriptorForBufferPosition?.([row, column]);
  return descriptor?.getScopes?.() || descriptor?.scopes || String(descriptor || "").split(/\s+/);
}

function blockedAt(editor, row, column) {
  return scopesAt(editor, row, column).some((scope) => /^(?:comment|string)(?:\.|$)/.test(scope));
}

function quotedAt(editor, row, column) {
  return scopesAt(editor, row, column).some((scope) =>
    /^string\.(?:single|double)(?:\.|$)/.test(scope),
  );
}

function continues(editor, row, line) {
  for (const match of line.matchAll(/\$\$/g)) {
    if (!line.slice(0, match.index).trim()) return false;
    const scopes = scopesAt(editor, row, match.index);
    const preceding = scopesAt(editor, row, Math.max(0, match.index - 1));
    if (
      !scopes.some((scope) => /^string(?:\.|$)/.test(scope)) &&
      !preceding.some((scope) => /^comment(?:\.|$)/.test(scope))
    )
      return true;
  }
  return false;
}

// A single document model serves calculation, editing, manuals and Code Lens.
// The grammar owns lexical exclusion; only macro, prose and continuation state
// that the directive's own scope cannot express is tracked here.
function* scanDirectives(editor, lines) {
  let row = -1;
  let macroDepth = 0;
  let continued = false;
  let textBlock = false;
  let legacyText = false;
  for (const line of lines) {
    if (++row % 128 === 0) yield null;
    const joined = continued;
    continued = continues(editor, row, line);
    const events = [];
    const root = /(^|;)[ \t\uFEFF]*([+\-$]?)(PROG|SYS|APPLY|CHAPTER)\b([^;]*)/gi;
    for (const match of line.matchAll(root)) {
      const column = match.index + match[0].indexOf(match[2] + match[3]);
      events.push({ column, match, directive: true });
    }
    const controls =
      /(<TEXT(?=[>, \t]|$)|<[/\\]TEXT>)|(^|;)[ \t]*(#DEFINE\b|#ENDDEF\b|TXAB\b|TXBB\b|TXEB\b|TXEN\b)/gi;
    for (const match of line.matchAll(controls)) {
      const token = match[1] || match[3];
      events.push({ column: match.index + match[0].lastIndexOf(token), match, token });
    }
    events.sort((left, right) => left.column - right.column);
    for (const event of events) {
      const { column, match } = event;
      const name = event.token?.toUpperCase();
      if (textBlock) {
        if (/^<[/\\]TEXT>$/i.test(name) && !quotedAt(editor, row, column)) textBlock = false;
        continue;
      }
      if (legacyText) {
        if (name === "TXEN" && !quotedAt(editor, row, column)) legacyText = false;
        continue;
      }
      if (event.directive) {
        const prefix = match[2];
        const kind = match[3].toUpperCase();
        const disabledComment = prefix === "$" && kind === "PROG" && !line.slice(0, column).trim();
        if (macroDepth || joined || (blockedAt(editor, row, column) && !disabledComment)) continue;
        const module = /^[ \t]+([A-Za-z][A-Za-z0-9_]*)(?=[ \t;]|$)/.exec(match[4])?.[1] || null;
        yield Object.freeze({
          row,
          column,
          kind,
          prefix,
          active: prefix !== "-" && prefix !== "$",
          module,
          range: Object.freeze([
            [row, column],
            [row, column + prefix.length + kind.length],
          ]),
          headerRange: Object.freeze([
            [row, column],
            [row, match.index + match[0].length],
          ]),
        });
        continue;
      }
      if ((joined && !match[1] && match[2] !== ";") || blockedAt(editor, row, column)) continue;
      if (name.startsWith("<TEXT")) textBlock = true;
      else if (["TXAB", "TXBB", "TXEB"].includes(name)) legacyText = true;
      else if (name === "#ENDDEF") macroDepth = Math.max(0, macroDepth - 1);
      else if (name === "#DEFINE") {
        if (/^[ \t]+#?[A-Za-z0-9_.-]+[ \t]*=/.test(line.slice(column + event.token.length))) {
          continued = false;
          break;
        }
        macroDepth++;
      }
    }
  }
}

function documentStructure(editor, text = editor.getText(), options) {
  if (editor.getBuffer?.()?.getLanguageMode?.()?.asynchronousSyntax)
    return requestStructure(editor, text, "directives", options);
  return Object.freeze([...scanDirectives(editor, text.split(/\r\n|\n|\r/))].filter(Boolean));
}

async function requestStructure(editor, text, kind, options = {}) {
  if (text !== editor.getText()) return null;
  const records = [];
  const summary = await editor.analyzeSyntax(
    require.resolve("./document-structure"),
    "analyze",
    { kind },
    {
      signal: options.signal,
      onChunk: (packet) => {
        for (const record of packet) records.push(record);
      },
    },
  );
  if (!summary) return null;
  if (summary.count !== records.length) throw new Error("Incomplete SOFiSTiK structure stream");
  return Object.freeze(records);
}

function nearestDirective(directives, position, kinds) {
  const [row, column] = position;
  return (
    directives.findLast(
      (directive) =>
        (!kinds || kinds.includes(directive.kind)) &&
        (directive.row < row || (directive.row === row && directive.column <= column)),
    ) || null
  );
}

function includeModule(editor) {
  const scope = editor.getGrammar()?.scopeName;
  return (
    /^source\.sofistik\.include\.(aqua|sofimshc|sofiload|decreator|tendon)$/
      .exec(scope)?.[1]
      ?.toUpperCase() || null
  );
}

function programHeaders(editor, text = editor.getText(), options) {
  if (editor.getBuffer?.()?.getLanguageMode?.()?.asynchronousSyntax)
    return requestStructure(editor, text, "headers", options);
  const directives = documentStructure(editor, text);
  const lines = text.split(/\r\n|\n|\r/);
  return selectHeaders(directives, (row) => lines[row]);
}
function selectHeaders(directives, lineForRow) {
  const rowCounts = new Map();
  for (const directive of directives) {
    if (directive.kind !== "CHAPTER")
      rowCounts.set(directive.row, (rowCounts.get(directive.row) || 0) + 1);
  }
  return directives
    .filter(
      (directive) =>
        directive.kind === "PROG" &&
        directive.prefix === "+" &&
        directive.module &&
        !lineForRow(directive.row).slice(0, directive.column).trim() &&
        rowCounts.get(directive.row) === 1,
    )
    .map((directive) => ({ ...directive, range: directive.headerRange }));
}

module.exports = { documentStructure, nearestDirective, programHeaders, blockedAt, includeModule };

module.exports.manualDestination = function (context, { commands, range }) {
  const regex = new RegExp("(?:^[ \\t]*|; *)(" + commands.join("|") + ")\\b", "gi");
  let destination = null;
  context.backwardsScanInBufferRange(regex, range, (finder) => {
    if (!blockedAt(context, finder.range.start.row, finder.range.start.column)) {
      destination = finder.match[1].toUpperCase();
      finder.stop();
    }
  });
  return { destination };
};

module.exports.analyze = async function (context, { kind }, { signal, emit }) {
  let records = [];
  for (const directive of scanDirectives(context, context.buffer.getTextSnapshot().lines())) {
    signal.throwIfAborted();
    if (directive) records.push(directive);
    else {
      await new Promise((resolve) => setImmediate(resolve));
      signal.throwIfAborted();
    }
  }
  if (kind === "headers")
    records = selectHeaders(records, (row) => context.lineTextForBufferRow(row));
  for (let start = 0; start < records.length; start += 256) {
    signal.throwIfAborted();
    await emit(records.slice(start, start + 256));
  }
  return { count: records.length };
};
