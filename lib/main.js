const { CompositeDisposable, Disposable } = require("lumine");
const { registerCommands } = require("./commands");
const { ProgramCodeLensProvider } = require("./program-code-lens");

module.exports = {
  activate() {
    this.disposables = new CompositeDisposable();
    this.runtime = null;
    this.treeView = null;
    this.pdfViewService = null;
    registerCommands(this);
  },

  ensureRuntime() {
    if (!this.runtime) {
      const ToolsRuntime = require("./runtime");
      this.runtime = new ToolsRuntime(this);
    }
    return this.runtime;
  },

  deactivate() {
    this.codeLensProvider?.dispose();
    this.codeLensProvider = null;
    this.runtime?.dispose();
    this.disposables.dispose();
    this.treeView = null;
    this.pdfViewService = null;
  },

  provideCodeLens() {
    this.codeLensProvider ||= new ProgramCodeLensProvider(this);
    return this.codeLensProvider;
  },

  provideBackgroundTips() {
    return {
      packageName: "sofistik-tools",
      tips: [
        "You can run a SOFiSTiK calculation on the current file with {{ 'sofistik-tools:calculation-wps' | keystroke }}",
      ],
    };
  },

  consumePdfView(service) {
    this.pdfViewService = service;
    return new Disposable(() => {
      if (this.pdfViewService === service) this.pdfViewService = null;
    });
  },

  consumeTreeViewSelection(service) {
    this.treeView = service;
    return new Disposable(() => {
      if (this.treeView === service) this.treeView = null;
    });
  },

  consumeOpenExternal(service) {
    const activation = this.disposables;
    return service.registerHandler({
      priority: 10,
      openExternal: (filePath) => {
        if (activation.disposed || this.disposables !== activation) return;
        return this.ensureRuntime().openExternal(filePath);
      },
    });
  },
};
