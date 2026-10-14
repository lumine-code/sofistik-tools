const { Emitter } = require("lumine");

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
    this.revision = 0;
    this.emitter = new Emitter();
    this.configSubscription = lumine.config.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("sofistik-tools.inlineActions")) {
        this.revision++;
        this.emitter.emit("invalidate", {});
      }
    });
  }

  onDidInvalidate(callback) {
    return this.emitter.on("invalidate", callback);
  }

  enabledFor(editor) {
    return (
      !this.disposed &&
      supports(editor) &&
      !!lumine.config.get("sofistik-tools.inlineActions", {
        scope: editor.getRootScopeDescriptor(),
      })
    );
  }

  async codeLenses(editor) {
    if (!this.enabledFor(editor)) return null;
    const mode = editor.getBuffer().getLanguageMode();
    await mode.ready;
    await mode.atTransactionEnd?.();
    if (!this.enabledFor(editor)) return null;
    const snapshot = editor.getText();
    const filePath = editor.getPath();
    const revision = this.revision;
    return require("./document-structure")
      .programHeaders(editor, snapshot)
      .map((header) => ({
        range: header.range,
        title: "Run",
        tooltip: `Run ${header.module} in WPS.`,
        execute: () => {
          if (this.revision !== revision || !this.enabledFor(editor)) return;
          const run = (runtime) => {
            if (!runtime || this.revision !== revision || !this.enabledFor(editor)) return;
            return runtime.runProgramAt(editor, header.row, snapshot, filePath);
          };
          return this.owner.runtime
            ? run(this.owner.runtime)
            : this.owner.ensureRuntime().then(run);
        },
      }));
  }

  dispose() {
    this.disposed = true;
    this.configSubscription.dispose();
    this.emitter.dispose();
  }
}

module.exports = { ProgramCodeLensProvider, supports };
