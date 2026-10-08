const InstallationList = require("./installation-list");
const path = require("path");

module.exports = class ExampleList extends InstallationList {
  constructor(owner) {
    super(owner, "*.dat/**/*.dat");
  }

  ensureSelectList() {
    if (this.selectListHost) return this.selectListHost;

    this.selectListHost = lumine.workspace.addSelectList(
      {
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
              this.owner.isActive() ? lumine.workspace.open(event.detail.item.filePath) : undefined,
          },
          "sofistik-tools:cache-examples": {
            description: "Index the examples again after installing another release.",
            didDispatch: () => this.refresh(),
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
          {
            command: "sofistik-tools:cache-examples",
            context: "dialog",
            group: "Index",
            disposition: "stay",
            dispatch: "local",
          },
        ],
      },
      { className: "sofistik-tools example-list", crumb: "Examples" },
    );
    this.selectList = this.selectListHost.getModel();
    return this.selectListHost;
  }

  buildItems(files, directory, lang) {
    // Examples live under a `<prog>.dat` directory, either directly or below a
    // `deutsch`/`english` directory when the program ships both languages.
    const items = [];
    for (const file of files) {
      const parts = file.split(path.sep);
      const prog = parts[0].split(".")[0];
      let i;
      if (lang === "de") {
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
        filePath: path.join(directory, file),
        prog: prog,
        title: title,
        text: `${title} ${prog}`, // Title first for better scoring
      });
    }

    // ripgrep walks in parallel, so its output order differs between runs.
    return items.sort((a, b) => a.text.localeCompare(b.text));
  }
};
