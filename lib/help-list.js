const { CompositeDisposable } = require("atom");
const fs = require("fs");
const path = require("path");
const { shell } = require("electron");

const HELP =
  "Available commands:\n" + "- **Enter**: Open in Lumine\n" + "- **Alt+Enter**: Open externally";

module.exports = class HelpList {
  constructor(S) {
    this.S = S;
    this.items = null;
    this.sofPath = null;
    this.disposables = new CompositeDisposable(
      atom.config.observe("language-sofistik.version", () => {
        this.items = null;
      }),
      atom.commands.add("atom-workspace", {
        "sofistik-tools:toggle-help": () => this.toggle(),
        "sofistik-tools:cache-help": () => {
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
      id: "sofistik-tools.help",
      className: "sofistik-tools help-list",
      emptyMessage: "No matches found",
      help: HELP,
      // One query carries two things: the manual to open, and — after a colon —
      // the named destination to jump to inside it.
      parseQuery: (raw) => {
        const colon = raw.indexOf(":");
        if (colon === -1) return { text: raw };
        return { text: raw.slice(0, colon), dest: raw.slice(colon + 1) };
      },
      source: () => this.load(),
      matcher: atom.modals.matchers.fuzzy({ algorithm: "fuzzaldrin", maxResults: 50 }),
      renderer: {
        entry: (item) => ({ id: item.fileName, text: item.displayName }),
        row: (item) => ({ label: item.displayName }),
      },
      actions: [
        {
          name: "open-in",
          label: "Open in Lumine",
          keystroke: "enter",
          run: (ctx) => this.open(ctx, "open-in"),
        },
        {
          name: "open-ex",
          label: "Open externally",
          keystroke: "alt-enter",
          run: (ctx) => this.open(ctx, "open-ex"),
        },
      ],
      confirm: (ctx) => this.open(ctx, "open-in"),
    });
  }

  /**
   * Lists the manuals shipped with the resolved installation, reusing the last
   * scan until the version — and with it the installation folder — changes.
   */
  load() {
    const sofPath = this.S.getSofPath();
    // getSofPath has already raised the notification; there is nothing to list.
    if (!sofPath) {
      return [];
    }
    if (this.items && this.sofPath === sofPath) {
      return this.items;
    }
    let lang = "English";
    let reTest;
    if (lang == "English") {
      reTest = /^[^\n0]+\.pdf$/i;
    } else if (lang == "German") {
      reTest = /^[^\n1]+\.pdf$/i;
    }
    this.sofPath = sofPath;
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
    return this.items;
  }

  async open({ item, query }, mode) {
    // Confirming with nothing matched did nothing in the old list; the kernel
    // would otherwise read the bare return as "confirmed" and close.
    if (!item) {
      return { keepOpen: true };
    }
    let filePath = path.join(this.sofPath, item.fileName);
    if (mode === "open-ex") {
      shell.openPath(filePath);
      return;
    }
    if (query.dest) {
      filePath += `#nameddest=${query.dest.toUpperCase().trim().replace(/ /g, "")}`;
    }
    // Awaited so the kernel sees focus already inside the opened item and its
    // "auto" restore leaves it there instead of bouncing back to the editor.
    await atom.workspace.open(filePath);
  }
};
