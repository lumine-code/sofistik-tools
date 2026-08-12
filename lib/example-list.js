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
      algorithm: "command-t", // Path-aware for file paths
      filterKeyForItem: (item) => item.text,
      willShow: () => this.update(),
      elementForItem: (item, { matchIndices, highlight }) => {
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
      didConfirmSelection: (item) => {
        this.selectList.hide();
        lumine.workspace.open(path.join(this.sofPath, item.fileName));
      },
      didCancelSelection: () => this.selectList.hide(),
    });
    this.disposables = new CompositeDisposable();
    this.disposables.add(
      lumine.commands.add("lumine-workspace", {
        "sofistik-tools:toggle-examples": () => this.selectList.toggle(),
        "sofistik-tools:cache-examples": () => {
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
    this.selectList.update({ items: this.items });
  }
};
