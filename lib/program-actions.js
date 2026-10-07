const { documentStructure, nearestDirective } = require("./document-structure");

function toggleable(directive) {
  return ["PROG", "SYS", "APPLY"].includes(directive.kind) && ["+", "-"].includes(directive.prefix);
}

function replacePrefix(editor, directive, mode) {
  const prefix = mode === "ON" ? "+" : mode === "OFF" ? "-" : directive.active ? "-" : "+";
  if (prefix !== directive.prefix)
    editor.setTextInBufferRange(
      [
        [directive.row, directive.column],
        [directive.row, directive.column + 1],
      ],
      prefix,
    );
}

module.exports = {
  changeProg() {
    const editor = this.getEditor();
    const position = this.context?.position || editor.getCursorBufferPosition().toArray();
    const directive = nearestDirective(documentStructure(editor).filter(toggleable), position);
    if (!directive) {
      lumine.notifications.addWarning("No switchable SOFiSTiK directive above the cursor.");
      return;
    }
    editor.transact(() => replacePrefix(editor, directive));
  },

  changeProgs(range, mode) {
    const editor = this.getEditor();
    const [row, column] = this.context?.position || editor.getCursorBufferPosition().toArray();
    const directives = documentStructure(editor).filter(
      (directive) =>
        toggleable(directive) &&
        (range === "all" ||
          (range === "above"
            ? directive.row < row || (directive.row === row && directive.column <= column)
            : directive.row > row || (directive.row === row && directive.column >= column))),
    );
    editor.transact(() => {
      for (const directive of directives.toReversed()) replacePrefix(editor, directive, mode);
    });
  },

  cleanUrsTags() {
    const editor = this.getEditor();
    const directives = documentStructure(editor).filter((directive) => directive.kind === "PROG");
    editor.transact(() => {
      for (const directive of directives.toReversed()) {
        const line = editor.lineTextForBufferRow(directive.row);
        const match = /[ \t]+URS\b[^;]*/i.exec(line.slice(directive.column));
        if (match)
          editor.setTextInBufferRange(
            [
              [directive.row, directive.column + match.index],
              [directive.row, directive.column + match.index + match[0].length],
            ],
            "",
          );
      }
    });
  },
};
