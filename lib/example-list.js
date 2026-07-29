const { CompositeDisposable } = require("atom");
const path = require("path");
const { findFiles } = require("./ripgrep");

module.exports = class ExampleList {
  constructor(S) {
    this.S = S;
    this.items = null;
    this.selectList = atom.workspace.buildSelectList({
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
        atom.workspace.open(path.join(this.sofPath, item.fileName));
      },
      didCancelSelection: () => this.selectList.hide(),
    });
    this.disposables = new CompositeDisposable();
    this.disposables.add(
      atom.commands.add("atom-workspace", {
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

  update() {
    if (!this.items) {
      let lang = atom.config.get("language-sofistik.language");
      this.sofPath = this.S.getSofPath();
      let filesSorted = [];
      let parts;
      let prog;
      let title;
      let i;
      findFiles(this.sofPath, "*.dat/**/*.dat").then((files) => {
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
        this.selectList.update({ items: this.items });
      });
    }
  }
};
