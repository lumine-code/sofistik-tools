const { CompositeDisposable } = require("atom");
const path = require("path");
const { findFiles } = require("./ripgrep");

module.exports = class ExampleList {
  constructor(S) {
    this.S = S;
    this.items = null;
    this.disposables = new CompositeDisposable(
      atom.commands.add("atom-workspace", {
        "sofistik-tools:toggle-examples": () => this.toggle(),
        "sofistik-tools:cache-examples": () => {
          this.items = null;
          this.load();
        },
      }),
    );
  }

  destroy() {
    this.disposables.dispose();
  }

  toggle() {
    return atom.modals.toggle({
      id: "sofistik-tools.examples",
      className: "sofistik-tools example-list",
      emptyMessage: "No matches found",
      source: () => this.load(),
      matcher: atom.modals.matchers.fuzzy({ algorithm: "command-t", maxResults: 50 }),
      renderer: {
        // The haystack reads "title prog" so a title hit outscores a program
        // hit, while the row draws the program tag first.
        entry: (item) => ({ id: item.fileName, text: item.text }),
        row: (item, ctx) => ({ label: this.label(item, ctx.highlights.label) }),
      },
      confirm: async ({ item }) => {
        // Confirming with nothing matched did nothing in the old list.
        if (!item) {
          return { keepOpen: true };
        }
        // Awaited so the kernel sees focus already inside the opened file and
        // its "auto" restore leaves it there.
        await atom.workspace.open(path.join(this.sofPath, item.fileName));
      },
    });
  }

  label(item, offsets) {
    const { highlight } = atom.modals.ui;
    const fragment = document.createDocumentFragment();
    const tag = document.createElement("span");
    tag.classList.add("tag");
    // The tag is drawn first but matched second, so its offsets sit past the
    // title and the space joining the two.
    const progOffset = item.title.length + 1;
    tag.appendChild(
      highlight(
        item.prog,
        (offsets ?? []).map((x) => x - progOffset),
      ),
    );
    fragment.append(tag, highlight(item.title, offsets));
    return fragment;
  }

  /**
   * Crawls the installation's example folders once and reuses the result until
   * `sofistik-tools:cache-examples` throws it away.
   */
  async load() {
    if (this.items) {
      return this.items;
    }
    let lang = atom.config.get("language-sofistik.language");
    this.sofPath = this.S.getSofPath();
    // getSofPath has already raised the notification; without a root, ripgrep
    // would fall back to the editor's own working directory.
    if (!this.sofPath) {
      return [];
    }
    let filesSorted = [];
    let parts;
    let prog;
    let title;
    let i;
    const files = await findFiles(this.sofPath, "*.dat/**/*.dat");
    for (let file of files) {
      parts = file.split(path.sep);
      prog = parts[0].split(".")[0];
      if (lang == "English") {
        if (parts[1] === "deutsch") {
          continue;
        } else if (parts[1] === "english") {
          i = 1;
        } else {
          i = 0;
        }
      } else if (lang == "German") {
        if (parts[1] === "english") {
          continue;
        } else if (parts[1] === "deutsch") {
          i = 1;
        } else {
          i = 0;
        }
      }
      title = parts.slice(1 + i).join("/");
      filesSorted.push({
        fileName: file,
        prog: prog,
        title: title,
        text: `${title} ${prog}`, // Title first for better scoring
      });
    }
    this.items = filesSorted;
    return this.items;
  }
};
