const InstallationList = require("./installation-list");
const path = require("path");
const { pathToFileURL } = require("url");
const { MANUAL, suffixForLanguage } = require("./manuals");
const { Disposable } = require("lumine");

module.exports = class HelpList extends InstallationList {
  constructor(owner, window = lumine.workspace.getMainWindow()) {
    super(owner, "*.pdf", window);
    this.openingPane = null;
  }

  ensureSelectList() {
    if (this.selectListHost) return this.selectListHost;

    this.selectListHost = lumine.workspace.addSelectList(
      {
        emptyMessage: "No matches found",
        // The colon-query syntax is the one thing the rows cannot explain.
        infoMessage: "A query like name:dest opens the manual at that destination, e.g. aqua:grp",
        getItemId: (item) => item.fileName,
        search: {
          algorithm: "fuzzaldrin", // General text matching
          getFilterText: (item) => item.displayName,
          parseQuery: (query) => {
            const colon = query.indexOf(":");
            return {
              text: colon === -1 ? query : query.slice(0, colon),
              data: { destination: colon === -1 ? null : query.substring(colon + 1) },
            };
          },
        },
        source: { mode: "snapshot", load: () => this.loadItems() },
        renderItem: (item, { filterKey, highlight }) => ({
          primary: highlight(filterKey),
          didRender: (element) => {
            const click = (event) => this.openModifiedClick(event, item);
            element.addEventListener("click", click, true);
            return new Disposable(() => element.removeEventListener("click", click, true));
          },
        }),
        commands: {
          "sofistik-tools:open-in": {
            description: "Open the manual with its default opener at the query destination.",
            didDispatch: (event) =>
              this.performAction(
                event.detail.item,
                "open-in",
                event.detail.parsedQuery?.data?.destination,
                event.detail,
              ),
          },
          "sofistik-tools:open-ex": {
            description: "Open the manual in the system PDF viewer.",
            didDispatch: ({ detail }) =>
              this.performAction(
                detail.item,
                "open-ex",
                detail.parsedQuery?.data?.destination,
                detail,
              ),
          },
          "sofistik-tools:open-help-with": {
            description: "Choose how and where to open the manual at the query destination.",
            didDispatch: ({ detail }) =>
              this.performAction(
                detail.item,
                "open-with",
                detail.parsedQuery?.data?.destination,
                detail,
              ),
          },
          "sofistik-tools:show-help-in-folder": {
            description: "Show the selected manual in the system file manager.",
            didDispatch: ({ detail }) => this.performAction(detail.item, "reveal", null, detail),
          },
          "sofistik-tools:cache-help": {
            description: "Index the manuals again after installing another release.",
            didDispatch: () => this.refresh(),
          },
        },
        actions: [
          {
            command: "sofistik-tools:open-in",
            context: "item",
            primary: true,
            group: "Open",
            disposition: "close",
            dispatch: "local",
          },
          {
            command: "sofistik-tools:open-ex",
            context: "item",
            group: "Open",
            disposition: "close",
            dispatch: "local",
          },
          ...["sofistik-tools:open-help-with", "sofistik-tools:show-help-in-folder"].map(
            (command) => ({
              command,
              context: "item",
              group: "Open",
              disposition: "close",
              dispatch: "local",
            }),
          ),
          {
            command: "sofistik-tools:cache-help",
            context: "dialog",
            group: "Index",
            disposition: "stay",
            dispatch: "local",
          },
        ],
      },
      { window: this.window, className: "sofistik-tools help-list", crumb: "SOFiSTiK Help" },
    );
    this.selectList = this.selectListHost.getModel();
    this.openingSubscription = this.selectListHost.onDidOpen(() => {
      this.openingPane = this.window.getEditorContainer().getActivePane();
    });
    return this.selectListHost;
  }

  openModifiedClick(event, item) {
    if (event.button !== 0 || (!event.altKey && !event.shiftKey)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.selectList.selectItem(item);
    if (!event.altKey) return;
    const command = event.shiftKey
      ? "sofistik-tools:show-help-in-folder"
      : event.ctrlKey
        ? "sofistik-tools:open-ex"
        : "sofistik-tools:open-help-with";
    void this.selectList.runAction(command).catch(() => {});
  }

  destroy() {
    this.openingSubscription?.dispose();
    this.openingSubscription = null;
    this.openingPane = null;
    return super.destroy();
  }

  buildItems(files, directory, lang) {
    const wanted = suffixForLanguage(lang);
    // One row per manual, keyed by the name without its language suffix. The
    // configured language wins where both exist; where only one does, that one
    // is still listed rather than being dropped for being the wrong language.
    const byName = new Map();
    for (const fileName of files) {
      const match = fileName.match(MANUAL);
      if (!match) {
        continue;
      }
      const displayName = match[1].toUpperCase();
      const suffix = match[2] ?? "";
      const chosen = byName.get(displayName);
      const rank = (value) => (value === wanted ? 2 : value === "" ? 1 : 0);
      if (
        !chosen ||
        rank(suffix) > rank(chosen.suffix) ||
        (rank(suffix) === rank(chosen.suffix) && fileName.localeCompare(chosen.fileName) < 0)
      ) {
        byName.set(displayName, {
          fileName,
          filePath: path.join(directory, fileName),
          displayName,
          suffix,
        });
      }
    }

    // ripgrep walks in parallel, so its output order differs between runs.
    return [...byName.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async performAction(item, mode, destination = null, { signal } = {}) {
    if (!item) {
      return;
    }

    if (!mode) {
      mode = "open-in";
    }

    const filePath = item.filePath;
    if (!this.owner.isActive() || this.window.isDestroyed() || !filePath) return;
    signal?.throwIfAborted();
    const pane = this.openingPane ?? this.window.getEditorContainer().getActivePane();
    if (pane.isDestroyed()) return;
    const uri = pathToFileURL(filePath);
    if (destination) {
      uri.hash = `nameddest=${destination.toUpperCase().trim().replace(/ /g, "")}`;
    }
    if (mode === "open-with") {
      const opened = await lumine.commands.dispatch(this.window.getElement(), "open-with:toggle", {
        path: filePath,
        pane,
        ...(uri.hash ? { uriFragment: uri.hash.slice(1) } : {}),
      });
      if (!opened) throw new Error("The Open With package is not available.");
      return opened;
    }
    if (mode === "open-ex" || mode === "reveal") {
      const opener = mode === "open-ex" ? "open-external" : "open-external:show";
      if (
        lumine.workspace
          .getAvailablePathOpeners(filePath, { pane, pathKind: "file" })
          .some((entry) => entry.id === opener)
      ) {
        return lumine.workspace.open(filePath, {
          pane,
          pathKind: "file",
          ...(uri.hash ? { uriFragment: uri.hash.slice(1) } : {}),
          opener,
          signal,
        });
      }
      return mode === "open-ex"
        ? lumine.shell.openPath(filePath)
        : lumine.shell.showItemInFolder(filePath);
    }
    if (mode !== "open-in") return;
    return lumine.workspace.open(uri.href, {
      pane,
      signal,
      pending: lumine.config.get("core.allowPendingPaneItems"),
    });
  }
};
