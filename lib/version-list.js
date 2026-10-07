const { getMetadata } = require("@lumine-code/sofistik-data");

module.exports = class VersionList {
  constructor(owner) {
    this.owner = owner;
    this.items = null;
    this.selectListHost = null;
    this.selectList = null;
    this.filePath = null;
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
            didDispatch: (event) =>
              this.owner.setVersion(event.detail.item.version, event.detail.item.filePath),
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

  toggle(operation) {
    this.filePath = operation.context.filePath;
    this.environment = operation.resolveEnvironment(null, this.filePath);
    return this.ensureSelectList().toggle();
  }

  destroy() {
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
    this.items = [
      { version: "Auto", filePath: this.filePath },
      ...[
        ...new Set([
          ...getMetadata().versions,
          ...this.owner.ensureEnvironment().getInstalledVersions(),
          ...(this.environment?.version ? [this.environment.version] : []),
        ]),
      ]
        .sort()
        .reverse()
        .map((version) => ({ version, filePath: this.filePath })),
    ];
    return this.items;
  }
};
