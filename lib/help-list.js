const InstallationList = require("./installation-list");
const path = require("path");
const { pathToFileURL } = require("url");
const { MANUAL, suffixForLanguage } = require("./manuals");

module.exports = class HelpList extends InstallationList {
  constructor(owner) {
    super(owner, "*.pdf");
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
    return this.selectListHost;
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

  performAction(item, mode, destination = null) {
    if (!item) {
      return;
    }

    if (!mode) {
      mode = "open-in";
    }

    const filePath = item.filePath;
    if (!this.owner.isActive() || !filePath) return;
    if (mode === "open-in") {
      const uri = pathToFileURL(filePath);
      if (destination) {
        uri.hash = `nameddest=${destination.toUpperCase().trim().replace(/ /g, "")}`;
      }
      lumine.workspace.open(uri.href);
    } else if (mode === "open-ex") {
      return lumine.shell.openPath(filePath);
    }
  }
};
