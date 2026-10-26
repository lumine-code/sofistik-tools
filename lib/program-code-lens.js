const { Emitter } = require("lumine");
const { syntaxUnavailable } = require("./syntax-availability");

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

  async codeLenses(editor, { signal } = {}) {
    if (!this.enabledFor(editor)) return null;
    const buffer = editor.getBuffer();
    const mode = buffer.getLanguageMode();
    const sourceRevision = buffer.getTextRevision();
    const revision = this.revision;
    const sameLifetime = () =>
      !signal?.aborted &&
      this.enabledFor(editor) &&
      !syntaxUnavailable(editor) &&
      buffer.getLanguageMode() === mode &&
      this.revision === revision;
    const current = () => sameLifetime() && buffer.getTextRevision() === sourceRevision;
    if (!current()) return null;
    await mode.ready;
    if (!current()) return null;
    await mode.atTransactionEnd?.();
    if (!current()) return null;
    const snapshot = editor.getText();
    const filePath = editor.getPath();
    const headers = await require("./document-structure").programHeaders(editor, snapshot, {
      signal,
    });
    if (!headers || !current()) return null;
    return headers.map((header) => ({
      range: header.range,
      title: "Run",
      tooltip: `Run ${header.module} in WPS.`,
      execute: () => {
        if (!sameLifetime()) return;
        const run = (runtime) => {
          if (!runtime || !sameLifetime()) return;
          return runtime.runProgramAt(editor, header.row, snapshot, filePath);
        };
        return this.owner.runtime ? run(this.owner.runtime) : this.owner.ensureRuntime().then(run);
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
