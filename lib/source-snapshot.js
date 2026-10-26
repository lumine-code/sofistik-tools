function currentSource(editor) {
  return (editor.getBuffer?.() ?? editor.buffer).getTextSnapshot();
}

function sourceSnapshot(editor, value) {
  const current = currentSource(editor);
  if (value === undefined) return current;
  if (value && typeof value.subtext === "function") return value;
  return typeof value === "string" ? current.subtext(0, 0).replace(0, 0, value) : null;
}

function sourceMatches(editor, value) {
  const source = sourceSnapshot(editor, value);
  return Boolean(source?.equals(currentSource(editor)));
}

function rowBounds(source, row) {
  const start = source.lineStart(row);
  let end = row + 1 < source.lineCount ? source.lineStart(row + 1) - 1 : source.length;
  if (end > start && row + 1 < source.lineCount && source.charCodeAt(end - 1) === 13) end--;
  return { start, end };
}

module.exports = { currentSource, sourceSnapshot, sourceMatches, rowBounds };
