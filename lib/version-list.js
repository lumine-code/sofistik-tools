const { CompositeDisposable } = require("lumine");
const { getMetadata } = require("@lumine-code/sofistik-data");

module.exports = class VersionList {
  constructor(owner) {
    this.owner = owner;
    this.items = null;
    this.selectListHost = null;
    this.selectList = null;
    this.filePath = null;
    this.disposables = new CompositeDisposable();
    this.disposables.add(
      lumine.commands.add("lumine-workspace", {
        "sofistik-tools:change-version": {
          description: "Choose the SOFiSTiK release declared by the file's adjacent sofistik.def.",
          didDispatch: (event) => {
            const editor =
              event?.target?.closest?.("lumine-text-editor:not([mini])")?.getModel?.() ||
              lumine.workspace.getActiveTextEditor();
            this.filePath = this.owner.environmentContext(undefined, editor).filePath || null;
            return this.ensureSelectList().toggle();
          },
        },
      }),
    );
  }

  ensureSelectList() {
    if (this.selectListHost) return this.selectListHost;

    this.selectListHost = lumine.workspace.addSelectList(
      {
        emptyMessage: "No matches found",
        getItemId: (item) => item.version,
        search: {
          algorithm: "fuzzaldrin", // General text matching
          getFilterText: (item) => item.version,
        },
        source: { mode: "snapshot", load: () => this.loadItems() },
        renderItem: (item, { filterKey, highlight }) => {
          return {
            primary: highlight(filterKey),
          };
        },
        commands: {
          "sofistik-tools:select-version": {
            description: "Write the selected release to the file's adjacent sofistik.def.",
            didDispatch: (event) => this.owner.setVersion(event.detail.item.version, this.filePath),
          },
        },
        actions: [
          {
            command: "sofistik-tools:select-version",
            context: "item",
            primary: true,
            disposition: "close",
            dispatch: "local",
          },
        ],
      },
      { className: "sofistik-tools version-list", crumb: "SOFiSTiK Versions" },
    );
    this.selectList = this.selectListHost.getModel();
    return this.selectListHost;
  }

  destroy() {
    this.disposables.dispose();
    const destruction = this.selectListHost?.destroy();
    this.selectListHost = null;
    this.selectList = null;
    return destruction;
  }

  update() {
    const items = this.loadItems();
    return this.selectList ? this.selectList.setItems(items) : items;
  }

  loadItems() {
    if (!this.items) {
      this.items = [
        { version: "Auto" },
        ...getMetadata()
          .versions.toReversed()
          .map((version) => ({ version })),
      ];
    }
    return this.items;
  }
};
