const { CompositeDisposable } = require("atom");

const VERSIONS = ["Auto", "2026", "2025", "2024", "2023", "2022", "2020", "2018"];

module.exports = class VersionList {
  constructor() {
    this.disposables = new CompositeDisposable(
      atom.commands.add("atom-workspace", {
        "sofistik-tools:change-version": () => this.toggle(),
      }),
    );
  }

  destroy() {
    this.disposables.dispose();
  }

  toggle() {
    return atom.modals.toggle({
      id: "sofistik-tools.versions",
      className: "sofistik-tools version-list",
      emptyMessage: "No matches found",
      source: VERSIONS,
      matcher: atom.modals.matchers.fuzzy({ algorithm: "fuzzaldrin", maxResults: 50 }),
      renderer: { row: (version) => ({ label: version }) },
      confirm: ({ item }) => {
        // Confirming with nothing matched did nothing in the old list.
        if (!item) {
          return { keepOpen: true };
        }
        atom.config.set("language-sofistik.version", item);
      },
    });
  }
};
