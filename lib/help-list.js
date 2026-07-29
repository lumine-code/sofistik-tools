const { CompositeDisposable } = require("atom");
const fs = require("fs");
const path = require("path");
const { shell } = require("electron");

module.exports = class HelpList {
  constructor(S) {
    this.S = S;
    this.items = null;
    this.qdest = false;
    this.selectList = atom.workspace.buildSelectList({
      maxResults: 50,
      className: "sofistik-tools help-list",
      crumb: "SOFiSTiK Help",
      emptyMessage: "No matches found",
      algorithm: "fuzzaldrin", // General text matching
      // The colon-query syntax is the one thing the rows cannot explain.
      infoMessage: "A query like name:dest opens the manual at that destination, e.g. aqua:grp",
      filterKeyForItem: (item) => item.displayName,
      filterQuery: (query) => {
        const colon = query.indexOf(":");
        if (colon !== -1) {
          this.qdest = query.substring(colon + 1);
          return query.slice(0, colon);
        }
        this.qdest = false;
        return query;
      },
      willShow: () => this.update(),
      elementForItem: (item, { filterKey, highlight }) => {
        return {
          primary: highlight(filterKey),
        };
      },
      didConfirmSelection: (item) => this.performAction(item, "open-in"),
      didCancelSelection: () => this.selectList.hide(),
    });
    this.disposables = new CompositeDisposable();
    // Registered in the package's own namespace: the item-actions list (F12)
    // derives its rows — label, description, keybinding — from these
    // registrations and the keymap.
    this.disposables.add(
      atom.commands.add(this.selectList.element, {
        "sofistik-tools:open-in": {
          description:
            "Open the manual in the editor, at the destination given after a colon in the query",
          didDispatch: () => this.performAction(null, "open-in"),
        },
        "sofistik-tools:open-ex": {
          description: "Open the manual in the system PDF viewer",
          didDispatch: () => this.performAction(null, "open-ex"),
        },
      }),
      atom.config.observe("language-sofistik.version", () => {
        this.items = null;
      }),
      atom.commands.add("atom-workspace", {
        "sofistik-tools:toggle-help": () => this.selectList.toggle(),
        "sofistik-tools:cache-help": () => {
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
    if (!this.items || this.sofPath !== this.S.getSofPath()) {
      let lang = "English";
      let reTest;
      if (lang == "English") {
        reTest = /^[^\n0]+\.pdf$/i;
      } else if (lang == "German") {
        reTest = /^[^\n1]+\.pdf$/i;
      }
      this.sofPath = this.S.getSofPath();
      let files = fs.readdirSync(this.sofPath);
      let filesSorted = [];
      for (let fileName of files) {
        if (fileName.match(reTest)) {
          filesSorted.push({
            fileName: fileName,
            displayName: fileName.match(/(.+?)(_.)?.pdf/i)[1].toUpperCase(),
          });
        }
      }
      this.items = filesSorted;
      this.selectList.update({ items: this.items });
    }
  }

  performAction(item, mode) {
    if (!item) {
      item = this.selectList.getSelectedItem();
    }
    if (!item) {
      return;
    }
    this.selectList.hide();

    if (!mode) {
      mode = "open-in";
    }

    let filePath = path.join(this.sofPath, item.fileName);
    if (mode === "open-in") {
      if (this.qdest) {
        filePath += `#nameddest=${this.qdest.toUpperCase().trim().replace(/ /g, "")}`;
      }
      atom.workspace.open(filePath);
    } else if (mode === "open-ex") {
      shell.openPath(filePath);
    }
  }
};
