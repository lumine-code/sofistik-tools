const { TextEditor, CompositeDisposable, Disposable, Emitter, Range, Point } = require("lumine");

module.exports = class TextView {
  constructor(defaultText, select, iconClass, prompt) {
    this.emitter = new Emitter();
    this.disposables = new CompositeDisposable();

    this.element = document.createElement("div");
    this.element.classList.add("dialog");
    this.element.classList.add("text-view-dialog");

    this.promptText = document.createElement("label");
    if (iconClass) {
      this.promptText.classList.add("icon");
      this.promptText.classList.add(iconClass);
    }
    this.promptText.textContent = prompt;
    this.element.appendChild(this.promptText);

    this.miniEditor = new TextEditor({ mini: true });
    const blurHandler = () => {
      if (document.hasFocus()) {
        this.close();
      }
    };
    this.miniEditor.element.addEventListener("blur", blurHandler);
    this.disposables.add(lumine.textEditors.add(this.miniEditor));
    this.disposables.add(
      new Disposable(() => this.miniEditor.element.removeEventListener("blur", blurHandler)),
    );
    this.disposables.add(this.miniEditor.onDidChange(() => this.showError()));
    this.element.appendChild(this.miniEditor.element);

    this.errorMessage = document.createElement("div");
    this.errorMessage.classList.add("error-message");
    this.element.appendChild(this.errorMessage);

    lumine.commands.add(this.element, {
      "core:confirm": () => this.onConfirm(this.miniEditor.getText()),
      "core:cancel": () => this.cancel(),
    });

    this.miniEditor.setText(defaultText);

    if (select) {
      this.miniEditor.setSelectedBufferRange(
        new Range(new Point(0, 0), new Point(0, defaultText.length)),
      );
    }
  }

  attach(onSelected) {
    this.panel = lumine.workspace.addModalPanel({ item: this });
    this.onSelected = onSelected;
    this.miniEditor.element.focus();
    this.miniEditor.scrollToCursorPosition();
  }

  close() {
    const panel = this.panel;
    this.panel = null;
    if (panel) {
      panel.destroy();
    }
    this.emitter.dispose();
    this.disposables.dispose();
    this.miniEditor.destroy();
    const activePane = lumine.workspace.getCenter().getActivePane();
    if (!activePane.isDestroyed()) {
      activePane.activate();
    }
  }

  cancel() {
    this.close();
    let treeView = document.querySelector(".tree-view");
    if (treeView) {
      treeView.focus();
    }
  }

  showError(message = "") {
    this.errorMessage.textContent = message;
    if (message) {
      this.element.classList.add("error");
      window.setTimeout(() => this.element.classList.remove("error"), 300);
    }
  }

  onConfirm(item) {
    this.onSelected(item);
    this.close();
  }
};
