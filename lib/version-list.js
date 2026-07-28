const { CompositeDisposable } = require("atom");

module.exports = class VersionList {
  constructor() {
    this.items = null;
    this.selectList = atom.workspace.buildSelectList({
      maxResults: 50,
      className: "sofistik-tools version-list",
      emptyMessage: "No matches found",
      algorithm: "fuzzaldrin", // General text matching
      filterKeyForItem: (item) => item.version,
      willShow: () => this.update(),
      elementForItem: (item, { filterKey, highlight }) => {
        return {
          primary: highlight(filterKey),
        };
      },
      didConfirmSelection: (item) => {
        this.selectList.hide();
        atom.config.set("language-sofistik.version", item.version);
      },
      didCancelSelection: () => this.selectList.hide(),
    });
    this.disposables = new CompositeDisposable();
    this.disposables.add(
      atom.commands.add("atom-workspace", {
        "sofistik-tools:change-version": () => this.selectList.toggle(),
      }),
    );
  }

  destroy() {
    this.disposables.dispose();
    this.selectList.destroy();
  }

  update() {
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
      this.selectList.update({ items: this.items });
    }
  }
};
