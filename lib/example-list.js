const { CompositeDisposable } = require("lumine");
const path = require("path");
const { findFiles } = require("./ripgrep");

module.exports = class ExampleList {
  constructor(S) {
    this.S = S;
    this.items = null;
    this.selectList = lumine.workspace.buildSelectList({
      className: "sofistik-tools example-list",
      crumb: "Examples",
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
        li.classList.add("two-lines");
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
          description: "Open the selected installation example in the editor.",
          didDispatch: (event) =>
            lumine.workspace.open(path.join(this.sofPath, event.detail.item.fileName)),
        },
      },
      actions: [
        {
          command: "sofistik-tools:open-example",
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
        "sofistik-tools:toggle-examples": {
          description: "Browse the example files shipped with the installation.",
          didDispatch: () => this.selectList.toggle(),
        },
        "sofistik-tools:cache-examples": {
          description: "Index the examples again after installing another release.",
          didDispatch: () => {
            this.items = null;
            return this.selectList.isVisible() ? this.selectList.reload() : this.update();
          },
        },
      }),
    );
  }

  destroy() {
    this.disposables.dispose();
    return this.selectList.destroy();
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
    const crawl = findFiles(sofPath, "*.dat/**/*.dat");
    this.crawl = crawl;
    const files = await crawl;
    if (this.crawl !== crawl) {
      return;
    }
    this.crawl = null;

    // Examples live under a `<prog>.dat` directory, either directly or below a
    // `deutsch`/`english` directory when the program ships both languages.
    const items = [];
    for (const file of files) {
      const parts = file.split(path.sep);
      const prog = parts[0].split(".")[0];
      let i;
      if (lang === "German") {
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
        prog: prog,
        title: title,
        text: `${title} ${prog}`, // Title first for better scoring
      });
    }

    // ripgrep walks in parallel, so its output order differs between runs.
    this.items = items.sort((a, b) => a.text.localeCompare(b.text));
    return this.items;
  }
};
