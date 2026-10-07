const path = require("node:path");

function captureContext(event, treeView) {
  const target = event?.target;
  const editor =
    target?.closest?.("lumine-text-editor:not([mini])")?.getModel?.() ??
    lumine.workspace.getActiveTextEditor() ??
    null;
  const filePath = editor?.getPath();
  const position = editor?.getCursorBufferPosition();
  const tree = !!target?.closest?.(".tree-view");
  return Object.freeze({
    surface: tree ? "tree" : "editor",
    editor,
    filePath: filePath ? path.resolve(filePath) : null,
    position: position ? Object.freeze([position.row, position.column]) : null,
    snapshot: editor?.getText() ?? null,
    treePaths: Object.freeze([...(treeView?.selectedPaths() || [])]),
  });
}

function editorContext(editor, position) {
  const context = captureContext({ target: editor?.getElement?.() });
  return Object.freeze({
    ...context,
    editor,
    filePath: editor?.getPath() ? path.resolve(editor.getPath()) : null,
    snapshot: editor?.getText() ?? null,
    position: position || context.position,
  });
}

module.exports = { captureContext, editorContext };
