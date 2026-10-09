const { CompositeDisposable, Disposable } = require("lumine");
const { registerCommands } = require("./commands");
const { ProgramCodeLensProvider } = require("./program-code-lens");

module.exports = {
  activate() {
    this.disposables = new CompositeDisposable();
    this.owner = {
      disposables: this.disposables,
      edges: { treeView: new Set(), pdfViewService: new Set() },
      retired: false,
      creating: false,
    };
    this.runtime = null;
    this.treeView = null;
    this.pdfViewService = null;
    registerCommands(this);
  },

  ensureRuntime() {
    const owner = this.owner;
    if (
      !owner ||
      owner.retired ||
      owner.disposables.disposed ||
      owner.disposables !== this.disposables
    )
      return null;
    if (!this.runtime) {
      if (owner.creating) return null;
      const ToolsRuntime = require("./runtime");
      owner.creating = true;
      try {
        const runtime = new ToolsRuntime(this);
        if (this.owner !== owner || owner.retired || owner.disposables.disposed) {
          runtime.dispose();
          return null;
        }
        this.runtime = runtime;
      } finally {
        owner.creating = false;
      }
    }
    return this.runtime;
  },

  deactivate() {
    const owner = this.owner;
    const disposables = this.disposables;
    const provider = this.codeLensProvider;
    const runtime = this.runtime;
    this.owner = null;
    this.codeLensProvider = null;
    this.runtime = null;
    this.treeView = null;
    this.pdfViewService = null;
    if (owner) {
      owner.retired = true;
      for (const edges of Object.values(owner.edges)) {
        for (const edge of edges) edge.value = null;
        edges.clear();
      }
    }
    disposables?.dispose();
    provider?.dispose();
    runtime?.dispose();
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
    return this.consumeService("pdfViewService", service);
  },

  consumeTreeViewSelection(service) {
    return this.consumeService("treeView", service);
  },

  consumeService(field, value) {
    const owner = this.owner;
    if (!owner || owner.retired || owner.disposables.disposed) return new Disposable();
    const edges = owner.edges[field];
    const edge = { value };
    edges.add(edge);
    this[field] = value;
    const lease = new Disposable(() => {
      edge.value = null;
      if (!edges.delete(edge)) return;
      owner.disposables.remove(lease);
      if (this.owner === owner && !owner.retired)
        this[field] = Array.from(edges).at(-1)?.value ?? null;
    });
    owner.disposables.add(lease);
    return lease;
  },

  consumeOpenExternal(service) {
    const owner = this.owner;
    const activation = this.disposables;
    const current = () => owner && this.owner === owner && !owner.retired && !activation.disposed;
    if (!current()) return new Disposable();
    let registration = null;
    const lease = new Disposable(() => {
      activation.remove(lease);
      const resource = registration;
      registration = null;
      resource?.dispose();
    });
    activation.add(lease);
    try {
      const resource = service.registerHandler({
        priority: 10,
        openExternal: (filePath) => {
          if (!current()) return;
          return this.ensureRuntime()?.openExternal(filePath);
        },
      });
      if (!current() || lease.disposed) resource.dispose();
      else registration = resource;
    } catch (error) {
      lease.dispose();
      throw error;
    }
    return lease;
  },
};
