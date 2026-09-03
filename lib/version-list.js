const { CompositeDisposable } = require("lumine");

module.exports = class VersionList {
  constructor() {
    this.items = null;
    this.selectList = lumine.workspace.buildSelectList({
      className: "sofistik-tools version-list",
      crumb: "SOFiSTiK Versions",
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
          description: "Use the selected installed SOFiSTiK release for this project.",
          didDispatch: (event) =>
            lumine.config.set("sofistik-environment.version", event.detail.item.version),
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
    });
    this.disposables = new CompositeDisposable();
    this.disposables.add(
      lumine.commands.add("lumine-workspace", {
        "sofistik-tools:change-version": {
          description: "Choose which installed SOFiSTiK release this project uses.",
          didDispatch: () => this.selectList.toggle(),
        },
      }),
    );
  }

  destroy() {
    this.disposables.dispose();
    return this.selectList.destroy();
  }

  update() {
    return this.selectList.setItems(this.loadItems());
  }

  loadItems() {
    if (!this.items) {
      this.items = [
        { version: "Auto" },
        { version: "2026" },
        { version: "2025" },
        { version: "2024" },
        { version: "2023" },
        { version: "2022" },
        { version: "2020" },
        { version: "2018" },
      ];
    }
    return this.items;
  }
};
