const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { suffixForLanguage, otherSuffix } = require("./manuals");
const { documentStructure, nearestDirective, blockedAt } = require("./document-structure");

module.exports = {
  currentHelp(mode, version) {
    const editor = this.getEditor();
    if (!editor) return;
    const position = this.context?.position || editor.getCursorBufferPosition().toArray();
    const directive = nearestDirective(documentStructure(editor), position, ["PROG"]);
    if (!directive?.module) {
      lumine.notifications.addWarning("No PROG block above the cursor");
      return;
    }
    const environment = this.resolveEnvironment(version, editor.getPath(), editor);
    const sofPath = this.getSofPath(version, editor.getPath(), editor);
    if (!sofPath) return;
    const prog = directive.module.toUpperCase();
    const name = { WING: "wingraf", RESULTS: "resultviewer" }[prog] || prog.toLowerCase();
    const filePath = [
      `${name}${suffixForLanguage(environment.language)}.pdf`,
      `${name}.pdf`,
      `${name}${otherSuffix(environment.language)}.pdf`,
    ]
      .map((fileName) => path.join(sofPath, fileName))
      .find((candidate) => fs.existsSync(candidate));
    if (!filePath) {
      lumine.notifications.addWarning(`Cannot find the manual for program "${prog}"`);
      return;
    }
    return this.inViewer(
      { range: { start: directive.range[0] } },
      [directive.range[0], position],
      filePath,
      prog,
      mode === 1,
      editor,
      environment,
    );
  },

  /**
   * Open or reuse a PDF view for SOFiSTiK help
   * @param {string} filePath - Path to the PDF file
   * @param {string} dest - Named destination to scroll to
   * @param {boolean} reuse - If true, reuse existing SOFiSTiK viewer
   */
  getViewer(filePath, dest, reuse) {
    const tag = "SOFiSTiK";

    // Use pdf-viewer service if available
    if (this.pdfViewService) {
      if (reuse) {
        // Try to find existing SOFiSTiK viewer
        const viewer = this.pdfViewService.getViewerByTag(tag);
        if (viewer) {
          if (viewer.getPath() === filePath) {
            // Same file, just scroll to destination
            if (dest) {
              this.pdfViewService.scrollToDestination(viewer, dest);
            }
          } else {
            // Different file, update viewer
            this.pdfViewService.setFile(viewer, filePath, dest, tag);
          }
          // Reveal it: make it the active item of its own pane, without
          // taking focus off the editor the lookup came from.
          lumine.workspace.open(viewer.getURI(), {
            searchAllPanes: true,
            activatePane: false,
          });
          return;
        }
      }
      // Open new viewer
      this.pdfViewService.open(filePath, {
        dest,
        tag: reuse ? tag : this.makeID(9),
        split: "right",
        activatePane: false,
      });
      return;
    }

    // A fragment belongs to a URI, never to a raw filesystem path. Using a
    // file URI lets the cold opener match the `.pdf` pathname while preserving
    // the named destination for PDF View's real opener.
    const uri = pathToFileURL(filePath);
    if (dest) uri.hash = `nameddest=${dest}`;
    lumine.workspace.open(uri.href, {
      split: "right",
      activatePane: false,
    });
  },

  /**
   * Open help in PDF view, finding the command at cursor
   * @param {Object} object - Scan result object
   * @param {Array} range - Buffer range
   * @param {string} filePath - Path to the PDF file
   * @param {string} prog - Program/module name
   * @param {boolean} reuse - If true, reuse existing SOFiSTiK viewer
   */
  inViewer(
    object,
    range,
    filePath,
    prog,
    reuse,
    editor = this.getEditor(),
    environment = this.resolveEnvironment(null, editor.getPath(), editor),
  ) {
    // The command nearest above the cursor within this PROG block, which is the
    // destination to open the manual at. Resolved whether or not the pdf-view
    // service is here: without it `getViewer` opens the manual through the
    // workspace, and pdf-view's own opener reads the same `#nameddest=`.
    let dest = null;
    const keywordContext = this.keywordContext(environment);
    const commands = keywordContext?.getModuleCommands(prog) || [];
    if (commands.length > 0) {
      const regex = new RegExp("(?:^[ \\t]*|; *)(" + commands.join("|") + ")\\b", "i");
      const searchRange = [object.range.start, range[1]];
      editor.backwardsScanInBufferRange(regex, searchRange, (finder) => {
        if (!blockedAt(editor, finder.range.start.row, finder.range.start.column)) {
          dest = finder.match[1].toUpperCase();
          finder.stop();
        }
      });
    }

    this.getViewer(filePath, dest, reuse);
  },

  makeID(length) {
    var result = "";
    var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  },
};
