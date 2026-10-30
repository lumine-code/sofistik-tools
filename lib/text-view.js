const { CompositeDisposable, Emitter, Range, Point } = require("lumine");

module.exports = class TextView {
  constructor(defaultText, select, iconClass, prompt, window = lumine.workspace.getMainWindow()) {
    this.window = window;
    const document = window.getDocument();
    this.emitter = new Emitter();
    this.disposables = new CompositeDisposable();

    this.promptText = document.createElement("div");
    this.promptText.classList.add("dialog-header", "dialog-label");
    if (iconClass) {
      this.promptText.classList.add("icon");
      this.promptText.classList.add(iconClass);
    }
    this.promptText.textContent = prompt;
    this.inputDialogHost = lumine.workspace.addInputDialog(
      { query: defaultText, headerElement: this.promptText },
      { window, className: "text-view-dialog" },
    );
    this.inputDialog = this.inputDialogHost.getModel();
    this.element = this.inputDialog.getElement();
    this.miniEditor = this.inputDialog.getQueryEditor();
    this.disposables.add(
      this.inputDialog.onDidConfirm(({ query }) => this.onConfirm(query)),
      this.inputDialogHost.onDidCancel(() => this.cancel()),
      this.inputDialogHost.onDidDestroy(() => this.close()),
    );

    if (select) {
      this.miniEditor.setSelectedBufferRange(
        new Range(new Point(0, 0), new Point(0, defaultText.length)),
      );
    }
  }

  attach(onSelected) {
    const query = this.miniEditor.getBuffer().getTextSnapshot();
    const selection = this.miniEditor.getSelectedBufferRange();
    this.onSelected = onSelected;
    this.panel = this.inputDialogHost.getPanel();
    this.inputDialogHost.show();
    this.inputDialog.setQuery(query);
    this.miniEditor.setSelectedBufferRange(selection);
    this.miniEditor.scrollToCursorPosition();
  }

  onDidClose(callback) {
    return this.emitter.on("did-close", callback);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.panel = null;
    this.disposables.dispose();
    const destroyed = this.inputDialogHost.destroyed ? undefined : this.inputDialogHost.destroy();
    this.emitter.emit("did-close");
    this.emitter.dispose();
    return destroyed;
  }

  cancel() {
    this.close();
  }

  showError(message = "") {
    return this.inputDialog.setStatus(message ? { type: "error", message } : null);
  }

  onConfirm(item) {
    if (this.onSelected(item) !== false) this.close();
  }
};
