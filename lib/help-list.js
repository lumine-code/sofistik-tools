const { CompositeDisposable } = require("lumine");
const path = require("path");
const { shell } = require("electron");
const { findFiles } = require("./ripgrep");
const { MANUAL, suffixForLanguage } = require("./manuals");

module.exports = class HelpList {
  constructor(S) {
    this.S = S;
    this.items = null;
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
        renderItem: (item, { filterKey, highlight }) => {
          return {
            primary: highlight(filterKey),
          };
        },
        commands: {
          "sofistik-tools:open-in": {
            description: "Open the manual in the editor, at the destination after the colon.",
            didDispatch: (event) =>
              this.performAction(
                event.detail.item,
                "open-in",
                event.detail.parsedQuery.data?.destination,
              ),
          },
          "sofistik-tools:open-ex": {
            description: "Open the manual in the system PDF viewer.",
            didDispatch: (event) => this.performAction(event.detail.item, "open-ex"),
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
          {
            command: "sofistik-tools:cache-help",
            context: "dialog",
            group: "Index",
            disposition: "stay",
            dispatch: "workspace",
          },
        ],
      },
      { className: "sofistik-tools help-list", crumb: "SOFiSTiK Help" },
    );
    this.selectList = this.selectListHost.getModel();
    this.disposables = new CompositeDisposable();
    this.disposables.add(
      // No config observer for the version or the language: `update` compares
      // the *resolved* installation path and language it last crawled, which
      // also catches `version: "Auto"` resolving somewhere else without any
      // config having changed.
      lumine.commands.add("lumine-workspace", {
        "sofistik-tools:toggle-help": {
          description: "Search the installed manuals by program and command.",
          didDispatch: () => this.selectListHost.toggle(),
        },
        "sofistik-tools:cache-help": {
          description: "Index the manuals again after installing another release.",
          didDispatch: () => {
            this.items = null;
            return this.selectListHost.isVisible() ? this.selectList.reload() : this.update();
          },
        },
      }),
    );
  }

  destroy() {
    this.disposables.dispose();
    return this.selectListHost.destroy();
  }

  async update() {
    const items = await this.loadItems();
    if (items) return this.selectList.setItems(items);
  }

  async loadItems() {
    const sofPath = this.S.getSofPath();
    // `getSofPath` reports the missing installation itself and returns nothing;
    // crawling from here anyway would spawn ripgrep with no `cwd`, which is the
    // editor's own working directory rather than a SOFiSTiK installation.
    if (!sofPath) {
      return;
    }
    const lang = this.S.getLanguage();
    if (this.items && this.sofPath === sofPath && this.lang === lang) {
      return this.items;
    }
    this.sofPath = sofPath;
    this.lang = lang;

    // Showing the list twice before the first crawl lands would otherwise race
    // two of them into `this.items`.
    const crawl = findFiles(sofPath, "*.pdf");
    this.crawl = crawl;
    const files = await crawl;
    if (this.crawl !== crawl) {
      return;
    }
    this.crawl = null;

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
      if (!chosen || (suffix === wanted && chosen.suffix !== wanted)) {
        byName.set(displayName, { fileName, displayName, suffix });
      }
    }

    // ripgrep walks in parallel, so its output order differs between runs.
    this.items = [...byName.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
    return this.items;
  }

  performAction(item, mode, destination = null) {
    if (!item) {
      return;
    }

    if (!mode) {
      mode = "open-in";
    }

    let filePath = path.join(this.sofPath, item.fileName);
    if (mode === "open-in") {
      if (destination) {
        filePath += `#nameddest=${destination.toUpperCase().trim().replace(/ /g, "")}`;
      }
      lumine.workspace.open(filePath);
    } else if (mode === "open-ex") {
      shell.openPath(filePath);
    }
  }
};
