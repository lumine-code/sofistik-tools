const InstallationList = require("./installation-list");
const path = require("path");

module.exports = class ExampleList extends InstallationList {
  constructor(owner, window = lumine.workspace.getMainWindow()) {
    super(owner, "*.dat/**/*.dat", window);
    this.openingPane = null;
  }

  ensureSelectList() {
    if (this.selectListHost) return this.selectListHost;

    this.selectListHost = lumine.workspace.addSelectList(
      {
        emptyMessage: "No matches found",
        getItemId: (item) => item.fileName,
        search: {
          algorithm: "command-t", // Path-aware for file paths
          getFilterText: (item) => item.text,
        },
        source: { mode: "snapshot", load: () => this.loadItems() },
        renderItem: (item, { matchIndices, highlight }) => {
          // Text format: "title prog" - title first for better scoring
          const li = document.createElement("li");
          const matches = matchIndices || [];

          const priBlock = document.createElement("div");
          priBlock.classList.add("primary-line");

          // Program tag - offset: title.length + space
          const progOffset = item.title.length + 1;
          const progBlock = document.createElement("span");
          progBlock.classList.add("tag");
          progBlock.appendChild(
            highlight(
              item.prog,
              matches.map((x) => x - progOffset),
            ),
          );
          priBlock.appendChild(progBlock);

          // Title - offset: 0
          priBlock.appendChild(highlight(item.title, matches));

          li.appendChild(priBlock);
          return li;
        },
        commands: {
          "sofistik-tools:open-example": {
            description: "Open the selected example with its default file opener.",
            didDispatch: ({ detail }) => this.performAction("open", detail),
          },
          "sofistik-tools:open-example-with": {
            description: "Choose how and where to open the selected example.",
            didDispatch: ({ detail }) => this.performAction("open-with", detail),
          },
          "sofistik-tools:open-example-external": {
            description: "Open the selected example in its default external program.",
            didDispatch: ({ detail }) => this.performAction("external", detail),
          },
          "sofistik-tools:show-example-in-folder": {
            description: "Show the selected example in the system file manager.",
            didDispatch: ({ detail }) => this.performAction("reveal", detail),
          },
          "sofistik-tools:cache-examples": {
            description: "Index the examples again after installing another release.",
            didDispatch: () => this.refresh(),
          },
        },
        actions: [
          {
            command: "sofistik-tools:open-example",
            context: "item",
            primary: true,
            group: "Open",
            disposition: "close",
            dispatch: "local",
          },
          ...[
            "sofistik-tools:open-example-with",
            "sofistik-tools:open-example-external",
            "sofistik-tools:show-example-in-folder",
          ].map((command) => ({
            command,
            context: "item",
            group: "Open",
            disposition: "close",
            dispatch: "local",
          })),
          {
            command: "sofistik-tools:cache-examples",
            context: "dialog",
            group: "Index",
            disposition: "stay",
            dispatch: "local",
          },
        ],
      },
      { window: this.window, className: "sofistik-tools example-list", crumb: "Examples" },
    );
    this.selectList = this.selectListHost.getModel();
    this.openingSubscription = this.selectListHost.onDidOpen(() => {
      this.openingPane = this.window.getEditorContainer().getActivePane();
    });
    return this.selectListHost;
  }

  async performAction(mode, { item, signal } = {}) {
    if (!this.owner.isActive() || this.window.isDestroyed() || !item?.filePath) return;
    signal?.throwIfAborted();
    const pane = this.openingPane ?? this.window.getEditorContainer().getActivePane();
    if (pane.isDestroyed()) return;
    if (mode === "open-with") {
      const opened = await lumine.commands.dispatch(this.window.getElement(), "open-with:toggle", {
        path: item.filePath,
        pane,
      });
      if (!opened) throw new Error("The Open With package is not available.");
      return opened;
    }
    if (mode === "external" || mode === "reveal") {
      const opener = mode === "external" ? "open-external" : "open-external:show";
      if (
        lumine.workspace
          .getAvailablePathOpeners(item.filePath, { pane, pathKind: "file" })
          .some((entry) => entry.id === opener)
      ) {
        return lumine.workspace.open(item.filePath, { pane, pathKind: "file", opener, signal });
      }
      return mode === "external"
        ? lumine.shell.openPath(item.filePath)
        : lumine.shell.showItemInFolder(item.filePath);
    }
    if (mode !== "open") return;
    return lumine.workspace.open(item.filePath, {
      pane,
      signal,
      pending: lumine.config.get("core.allowPendingPaneItems"),
    });
  }

  destroy() {
    this.openingSubscription?.dispose();
    this.openingSubscription = null;
    this.openingPane = null;
    return super.destroy();
  }

  buildItems(files, directory, lang) {
    // Examples live under a `<prog>.dat` directory, either directly or below a
    // `deutsch`/`english` directory when the program ships both languages.
    const items = [];
    for (const file of files) {
      const parts = file.split(path.sep);
      const prog = parts[0].split(".")[0];
      let i;
      if (lang === "de") {
        if (parts[1] === "english") {
          continue;
        }
        i = parts[1] === "deutsch" ? 1 : 0;
      } else {
        if (parts[1] === "deutsch") {
          continue;
        }
        i = parts[1] === "english" ? 1 : 0;
      }
      const title = parts.slice(1 + i).join("/");
      items.push({
        fileName: file,
        filePath: path.join(directory, file),
        prog: prog,
        title: title,
        text: `${title} ${prog}`, // Title first for better scoring
      });
    }

    // ripgrep walks in parallel, so its output order differs between runs.
    return items.sort((a, b) => a.text.localeCompare(b.text));
  }
};
