const path = require("node:path");

const { syntaxUnavailable } = require("./syntax-availability");

function captureContext(event, treeView, { includeSnapshot = true } = {}) {
  const target = event?.target;
  const editor =
    target?.closest?.("lumine-text-editor:not([mini])")?.getModel?.() ??
    event?.context?.embeddedEditor ??
    lumine.workspace.getActiveTextEditor() ??
    null;
  const filePath = editor?.getPath();
  const position = editor?.getCursorBufferPosition();
  const buffer = editor?.getBuffer();
  const mode = buffer?.getLanguageMode();
  const revision = buffer?.getTextRevision();
  const isSourceCurrent = () =>
    !!editor &&
    !editor.isDestroyed() &&
    editor.getGrammar() !== lumine.grammars.nullGrammar &&
    !syntaxUnavailable(editor) &&
    editor.getBuffer() === buffer &&
    buffer.getLanguageMode() === mode &&
    editor.getPath() === filePath;
  const tree = !!target?.closest?.(".tree-view");
  return Object.freeze({
    window:
      event?.context?.window ??
      lumine.workspace.getWindowForElement(target) ??
      lumine.workspace.getMainWindow(),
    surface: tree ? "tree" : "editor",
    editor,
    paneItem: editor || lumine.workspace.getActivePaneItem() || null,
    filePath: filePath ? path.resolve(filePath) : null,
    position: position ? Object.freeze([position.row, position.column]) : null,
    snapshot: includeSnapshot && isSourceCurrent() ? editor.getText() : null,
    sourceRevision: revision,
    sourceBound: includeSnapshot && !!editor,
    isSourceCurrent,
    isCurrent: () => isSourceCurrent() && buffer.getTextRevision() === revision,
    treePaths: Object.freeze([...(treeView?.selectedPaths() || [])]),
  });
}

function editorContext(editor, position) {
  const context = captureContext({ target: editor?.getElement?.() });
  return Object.freeze({
    ...context,
    editor,
    filePath: editor?.getPath() ? path.resolve(editor.getPath()) : null,
    snapshot: context.snapshot,
    position: position || context.position,
  });
}

module.exports = { captureContext, editorContext, syntaxUnavailable };
