const { scanSourceDirectives, scopesAt, MAX_RECORDS, limitError } = require("./source-structure");
const { sourceSnapshot, sourceMatches } = require("./source-snapshot");
const { collect } = require("./source-traversal");
const { scanManualDestination } = require("./source-metadata");

function blockedAt(context, row, column) {
  return scopesAt(context, row, column).some((scope) => /^(?:comment|string)(?:\.|$)/.test(scope));
}

function documentStructure(editor, text, options) {
  if (
    options?.signal?.aborted ||
    editor.getGrammar?.() === lumine.grammars.nullGrammar ||
    syntaxUnavailable(editor)
  )
    return null;
  const source = sourceSnapshot(editor, text);
  if (!source || !sourceMatches(editor, source)) return null;
  if (editor.getBuffer?.()?.getLanguageMode?.()?.asynchronousSyntax)
    return requestStructure(editor, source, "directives", options);
  const buffer = editor.getBuffer(),
    mode = buffer.getLanguageMode(),
    revision = buffer.getTextRevision();
  return collect(scanSourceDirectives(editor, source), source, {
    ...options,
    isCurrent: () =>
      !editor.isDestroyed() &&
      !syntaxUnavailable(editor) &&
      buffer.getLanguageMode() === mode &&
      buffer.getTextRevision() === revision,
  });
}

async function requestStructure(editor, text, kind, options = {}) {
  const buffer = editor.getBuffer();
  const mode = buffer.getLanguageMode();
  const revision = buffer.getTextRevision();
  const epoch = mode.getSyntaxRequestEpoch?.();
  const current = () =>
    !options.signal?.aborted &&
    !editor.isDestroyed() &&
    editor.getGrammar() !== lumine.grammars.nullGrammar &&
    !syntaxUnavailable(editor) &&
    buffer.getLanguageMode() === mode &&
    buffer.getTextRevision() === revision &&
    mode.getSyntaxRequestEpoch?.() === epoch;
  if (!current()) return null;
  if (!sourceMatches(editor, text)) return null;
  const records = [];
  const summary = await editor.analyzeSyntax(
    require.resolve("./document-structure"),
    "analyze",
    { kind },
    {
      signal: options.signal,
      onChunk: (packet) => {
        if (!current()) return;
        for (const record of packet) {
          if (records.length >= MAX_RECORDS) throw limitError();
          records.push(record);
        }
      },
    },
  );
  if (!summary || !current()) return null;
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

function programHeaders(editor, text, options) {
  if (
    options?.signal?.aborted ||
    editor.getGrammar?.() === lumine.grammars.nullGrammar ||
    syntaxUnavailable(editor)
  )
    return null;
  const source = sourceSnapshot(editor, text);
  if (!source || !sourceMatches(editor, source)) return null;
  if (editor.getBuffer?.()?.getLanguageMode?.()?.asynchronousSyntax)
    return requestStructure(editor, source, "headers", options);
  const directives = documentStructure(editor, source, options);
  return directives?.then
    ? directives.then((records) => records && selectHeaders(records))
    : directives && selectHeaders(directives);
}
function selectHeaders(directives) {
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
        directive.leading &&
        rowCounts.get(directive.row) === 1,
    )
    .map((directive) => ({ ...directive, range: directive.headerRange }));
}

module.exports = { documentStructure, nearestDirective, programHeaders, blockedAt, includeModule };

module.exports.manualDestination = async function (context, { commands, range }, { signal } = {}) {
  const source = context.buffer.getTextSnapshot();
  const records = await collect(scanManualDestination(context, source, commands, range), source, {
    signal,
  });
  return { destination: records?.at(-1) ?? null };
};

module.exports.analyze = async function (context, { kind }, { signal, emit }) {
  const source = context.buffer.getTextSnapshot();
  let records = await collect(scanSourceDirectives(context, source), source, { signal });
  signal.throwIfAborted();
  if (kind === "headers") records = selectHeaders(records);
  for (let start = 0; start < records.length; start += 256) {
    signal.throwIfAborted();
    await emit(records.slice(start, start + 256));
  }
  return { count: records.length };
};
const { syntaxUnavailable } = require("./syntax-availability");
