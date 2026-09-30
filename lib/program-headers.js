const HEADER = /^[ \t\uFEFF]*(\+PROG)[ \t]+([A-Za-z][A-Za-z0-9_]*)(?=[ \t;]|$)/i;

function scopesAt(editor, row, column) {
  const descriptor = editor.scopeDescriptorForBufferPosition?.([row, column]);
  return descriptor?.getScopes?.() || descriptor?.scopes || String(descriptor || "").split(/\s+/);
}

function blockedAt(editor, row, column) {
  return scopesAt(editor, row, column).some((scope) => /^(?:comment|string)(?:\.|$)/.test(scope));
}

function continues(editor, row, line) {
  for (const match of line.matchAll(/\$\$/g)) {
    if (!line.slice(0, match.index).trim()) return false;
    const scopes = scopesAt(editor, row, match.index);
    const preceding = scopesAt(editor, row, Math.max(0, match.index - 1));
    if (
      !scopes.some((scope) => /^string(?:\.|$)/.test(scope)) &&
      !preceding.some((scope) => /^(?:comment|string)(?:\.|$)/.test(scope))
    )
      return true;
  }
  return false;
}

// The grammar excludes quoted/comment content. Only the small state that a
// header's own scope cannot express (macro bodies and record joins) is tracked.
function programHeaders(editor, text) {
  const headers = [];
  let macroDepth = 0;
  let continued = false;
  let textBlock = false;
  let legacyText = false;
  for (const [row, line] of text.split(/\r\n|\n|\r/).entries()) {
    const head = line.search(/[^ \t\uFEFF]/);
    const joined = continued;
    continued = continues(editor, row, line);
    if (head < 0) continue;
    const match = HEADER.exec(line);
    // WPS accepts a physical line number, so another root directive on this
    // row makes selecting one program ambiguous.
    const ambiguous = [...line.matchAll(/;[ \t]*([+\-$]?(?:PROG|APPLY)|[+-]?SYS)\b/gi)].some(
      (other) => !blockedAt(editor, row, other.index + other[0].indexOf(other[1])),
    );
    if (
      match &&
      !joined &&
      !macroDepth &&
      !textBlock &&
      !legacyText &&
      !ambiguous &&
      !blockedAt(editor, row, head)
    ) {
      headers.push({
        row,
        module: match[2],
        range: [
          [row, head],
          [row, head + match[0].trimStart().length],
        ],
      });
    }
    // Markers may follow another record's semicolon. Inline DEFINE values own
    // the rest of their physical line, so their semicolons are literal.
    const controls =
      /(<TEXT(?=[>, \t]|$)|<[/\\]TEXT>)|(^|;)[ \t]*(#DEFINE\b|#ENDDEF\b|TXAB\b|TXBB\b|TXEB\b|TXEN\b)/gi;
    for (const event of line.matchAll(controls)) {
      const token = event[1] || event[3];
      const name = token.toUpperCase();
      const column = event.index + event[0].lastIndexOf(token);
      if (textBlock) {
        if (/^<[/\\]TEXT>$/i.test(name)) textBlock = false;
        continue;
      }
      if (legacyText) {
        if (
          name === "TXEN" &&
          !scopesAt(editor, row, column).some((scope) =>
            /^string\.(?:single|double)(?:\.|$)/.test(scope),
          )
        )
          legacyText = false;
        continue;
      }
      if ((joined && !event[1] && event[2] !== ";") || blockedAt(editor, row, column)) continue;
      if (name.startsWith("<TEXT")) textBlock = true;
      else if (["TXAB", "TXBB", "TXEB"].includes(name)) legacyText = true;
      else if (name === "#ENDDEF") macroDepth = Math.max(0, macroDepth - 1);
      else if (name === "#DEFINE") {
        if (/^[ \t]+#?[A-Za-z0-9_.-]+[ \t]*=/.test(line.slice(column + token.length))) {
          continued = false;
          break;
        }
        macroDepth++;
      }
    }
  }
  return headers;
}

module.exports = { programHeaders };
