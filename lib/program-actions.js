const { currentSource, sourceMatches } = require("./source-snapshot");
const { documentStructure, nearestDirective } = require("./document-structure");
const { syntaxUnavailable } = require("./syntax-availability");

function toggleable(directive) {
  return ["PROG", "SYS", "APPLY"].includes(directive.kind) && ["+", "-"].includes(directive.prefix);
}

function prefixEdit(directive, mode) {
  const prefix = mode === "ON" ? "+" : mode === "OFF" ? "-" : directive.active ? "-" : "+";
  if (prefix !== directive.prefix)
    return {
      range: [
        [directive.row, directive.column],
        [directive.row, directive.column + 1],
      ],
      text: prefix,
    };
}

function writableEditor(operation) {
  const editor = operation.getEditor();
  if (!editor || editor.isDestroyed?.()) return null;
  if (
    editor.getGrammar() === lumine.grammars.nullGrammar ||
    syntaxUnavailable(editor) ||
    operation.context?.isSourceCurrent?.() === false
  )
    return null;
  if (editor.isReadOnly?.()) {
    lumine.notifications.addWarning("Cannot change SOFiSTiK directives in a read-only editor.");
    return null;
  }
  return editor;
}

function capture(operation, editor) {
  const buffer = editor.getBuffer(),
    revision = buffer.getTextRevision(),
    mode = buffer.getLanguageMode();
  const source = operation.context?.snapshot ?? currentSource(editor);
  return {
    buffer,
    revision,
    source,
    current: () =>
      operation.isActive?.() !== false &&
      operation.context?.isSourceCurrent?.() !== false &&
      !editor.isDestroyed() &&
      !editor.isReadOnly() &&
      buffer.getTextRevision() === revision &&
      buffer.getLanguageMode() === mode &&
      sourceMatches(editor, source),
  };
}

module.exports = {
  async changeProg() {
    const editor = writableEditor(this);
    if (!editor) return;
    const position = this.context?.position || editor.getCursorBufferPosition().toArray();
    const state = capture(this, editor);
    if (!state.current()) return;
    let structure = documentStructure(editor, state.source);
    if (structure?.then) structure = await structure;
    if (!structure || !state.current()) return;
    const directive = nearestDirective(structure.filter(toggleable), position);
    if (!directive) {
      lumine.notifications.addWarning("No switchable SOFiSTiK directive above the cursor.");
      return;
    }
    const edit = prefixEdit(directive);
    if (edit)
      editor.transact(() =>
        state.buffer.setTextInIndependentRanges([edit], { expectedRevision: state.revision }),
      );
  },

  async changeProgs(range, mode) {
    const editor = writableEditor(this);
    if (!editor) return;
    const [row, column] = this.context?.position || editor.getCursorBufferPosition().toArray();
    const state = capture(this, editor);
    if (!state.current()) return;
    let structure = documentStructure(editor, state.source);
    if (structure?.then) structure = await structure;
    if (!structure || !state.current()) return;
    const directives = structure.filter(
      (directive) =>
        toggleable(directive) &&
        (range === "all" ||
          (range === "above"
            ? directive.row < row || (directive.row === row && directive.column <= column)
            : directive.row > row || (directive.row === row && directive.column >= column))),
    );
    editor.transact(() => {
      editor
        .getBuffer()
        .setTextInIndependentRanges(
          directives.map((directive) => prefixEdit(directive, mode)).filter(Boolean),
          { expectedRevision: state.revision },
        );
    });
  },

  async cleanUrsTags() {
    const editor = writableEditor(this);
    if (!editor) return;
    const state = capture(this, editor);
    if (!state.current()) return;
    let structure = documentStructure(editor, state.source);
    if (structure?.then) structure = await structure;
    if (!structure || !state.current()) return;
    const directives = structure.filter((directive) => directive.kind === "PROG");
    editor.transact(() => {
      const edits = [];
      for (const directive of directives) {
        if (directive.ursRange) edits.push({ range: directive.ursRange, text: "" });
      }
      state.buffer.setTextInIndependentRanges(edits, { expectedRevision: state.revision });
    });
  },
};
