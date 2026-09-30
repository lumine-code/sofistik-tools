const { programHeaders } = require("./program-headers");

function supports(editor) {
  return (
    !!editor &&
    !editor.isDestroyed?.() &&
    !editor.isMini?.() &&
    editor.getGrammar?.()?.scopeName === "source.sofistik"
  );
}

class ProgramCodeLensProvider {
  constructor(owner) {
    this.owner = owner;
    this.grammarScopes = ["source.sofistik"];
    this.priority = 4;
    this.disposed = false;
  }

  async codeLenses(editor) {
    if (this.disposed || !supports(editor)) return null;
    const mode = editor.getBuffer().getLanguageMode();
    await mode.ready;
    await mode.atTransactionEnd?.();
    if (this.disposed || !supports(editor)) return null;
    const snapshot = editor.getText();
    const filePath = editor.getPath();
    return programHeaders(editor, snapshot).map((header) => ({
      range: header.range,
      title: "Run",
      tooltip: `Run ${header.module} in WPS.`,
      execute: () =>
        this.disposed ? undefined : this.owner.runProgramAt(editor, header.row, snapshot, filePath),
    }));
  }

  dispose() {
    this.disposed = true;
  }
}

module.exports = { ProgramCodeLensProvider, supports };
