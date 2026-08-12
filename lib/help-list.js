const { CompositeDisposable } = require("lumine");
const path = require("path");
const { shell } = require("electron");
const { findFiles } = require("./ripgrep");
const { MANUAL, suffixForLanguage } = require("./manuals");

module.exports = class HelpList {
  constructor(S) {
    this.S = S;
    this.items = null;
    this.qdest = false;
    this.selectList = lumine.workspace.buildSelectList({
      className: "sofistik-tools help-list",
      crumb: "SOFiSTiK Help",
      emptyMessage: "No matches found",
      algorithm: "fuzzaldrin", // General text matching
      // The colon-query syntax is the one thing the rows cannot explain.
      infoMessage: "A query like name:dest opens the manual at that destination, e.g. aqua:grp",
      filterKeyForItem: (item) => item.displayName,
      filterQuery: (query) => {
        const colon = query.indexOf(":");
        if (colon !== -1) {
          this.qdest = query.substring(colon + 1);
          return query.slice(0, colon);
        }
        this.qdest = false;
        return query;
      },
      willShow: () => this.update(),
      elementForItem: (item, { filterKey, highlight }) => {
        return {
          primary: highlight(filterKey),
        };
      },
      didConfirmSelection: (item) => this.performAction(item, "open-in"),
      didCancelSelection: () => this.selectList.hide(),
    });
    this.disposables = new CompositeDisposable();
    // Registered in the package's own namespace: the item-actions list (F12)
    // derives its rows — label, description, keybinding — from these
    // registrations and the keymap.
    this.disposables.add(
      lumine.commands.add(this.selectList.element, {
        "sofistik-tools:open-in": {
          description:
            "Open the manual in the editor, at the destination given after a colon in the query",
          didDispatch: () => this.performAction(null, "open-in"),
        },
        "sofistik-tools:open-ex": {
          description: "Open the manual in the system PDF viewer",
          didDispatch: () => this.performAction(null, "open-ex"),
        },
      }),
      // No config observer for the version or the language: `update` compares
      // the *resolved* installation path and language it last crawled, which
      // also catches `version: "Auto"` resolving somewhere else without any
      // config having changed.
      lumine.commands.add("lumine-workspace", {
        "sofistik-tools:toggle-help": () => this.selectList.toggle(),
        "sofistik-tools:cache-help": () => {
          this.items = null;
          this.update();
        },
      }),
    );
  }

  destroy() {
    this.disposables.dispose();
    this.selectList.destroy();
  }

  async update() {
    const sofPath = this.S.getSofPath();
    // `getSofPath` reports the missing installation itself and returns nothing;
    // crawling from here anyway would spawn ripgrep with no `cwd`, which is the
    // editor's own working directory rather than a SOFiSTiK installation.
    if (!sofPath) {
      return;
    }
    const lang = lumine.config.get("language-sofistik.language");
    if (this.items && this.sofPath === sofPath && this.lang === lang) {
      return;
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
    this.selectList.update({ items: this.items });
  }

  performAction(item, mode) {
    if (!item) {
      item = this.selectList.getSelectedItem();
    }
    if (!item) {
      return;
    }
    this.selectList.hide();

    if (!mode) {
      mode = "open-in";
    }

    let filePath = path.join(this.sofPath, item.fileName);
    if (mode === "open-in") {
      if (this.qdest) {
        filePath += `#nameddest=${this.qdest.toUpperCase().trim().replace(/ /g, "")}`;
      }
      lumine.workspace.open(filePath);
    } else if (mode === "open-ex") {
      shell.openPath(filePath);
    }
  }
};
