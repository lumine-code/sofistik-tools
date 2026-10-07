const path = require("node:path");
const fs = require("node:fs");
const { findFiles } = require("./ripgrep");
const TextView = require("./text-view");

const RESULT_EXTENSIONS = [
  ".erg",
  ".prt",
  ".lst",
  ".urs",
  ".sdb",
  ".db-2",
  ".pl",
  ".$*",
  ".#*",
  ".grb",
  ".err",
  ".error_positions",
  ".dwl",
  ".dwl2",
  ".cfg",
];
const ADDITIONS = [
  [],
  [".cdi", ".cde"],
  [".cdb", ".sqlite"],
  [".plb", ".bak", "_csm.dat", "_csmlf.dat"],
];

function cleanupPattern(filter) {
  if (typeof filter === "string") {
    if (!filter.trim()) throw new Error("Enter a glob pattern before cleaning files.");
    return filter;
  }
  const { level, recursive = false } = filter;
  if (!Number.isInteger(level) || level < 1 || level > 4)
    throw new RangeError("Choose a cleanup level from 1 to 4.");
  const extensions = [...RESULT_EXTENSIONS, ...ADDITIONS.slice(0, level).flat()];
  return `${recursive ? "**/" : ""}*{${extensions.join(",")}}`;
}

function wingFixed(text) {
  return text
    .replace(/ +MSCA \w+/gim, "")
    .replace(/^AND (.*)(?<!MSCA .*)$/gim, "AND $1 MSCA NO")
    .replace(/^ *DB/gim, "$ DB");
}

module.exports = {
  async cleanByPaths(paths, filter) {
    return this.mutateSelectedFiles(
      paths,
      cleanupPattern(filter),
      (file) => fs.unlinkSync(file),
      false,
    );
  },

  async wingFix(paths, filter) {
    return this.mutateSelectedFiles(
      paths,
      filter,
      (file) => {
        const text = fs.readFileSync(file, "utf8");
        const updated = wingFixed(text);
        if (updated !== text) fs.writeFileSync(file, updated, "utf8");
      },
      true,
    );
  },

  async mutateSelectedFiles(paths, pattern, mutate, allowFiles) {
    const result = { changed: [], failed: [], skipped: [], cancelled: false };
    const selectedPaths = [...paths];
    const files = new Set();
    for (const selectedPath of selectedPaths) {
      if (!this.isActive()) break;
      try {
        if (fs.statSync(selectedPath).isDirectory()) {
          const found = await findFiles(selectedPath, pattern, {
            signal: this.abortController.signal,
          });
          for (const file of found) files.add(path.resolve(selectedPath, file));
        } else if (allowFiles && path.extname(selectedPath).toLowerCase() === ".gra") {
          files.add(path.resolve(selectedPath));
        } else {
          result.skipped.push(selectedPath);
        }
      } catch (error) {
        result.failed.push({ path: selectedPath, message: error.message });
      }
    }
    for (const file of files) {
      if (!this.isActive()) break;
      try {
        mutate(file);
        result.changed.push(file);
      } catch (error) {
        result.failed.push({ path: file, message: error.message });
      }
    }
    result.cancelled = !this.isActive();
    if (result.failed.length && this.isActive())
      lumine.notifications.addWarning(
        `Cannot update ${result.failed.length} SOFiSTiK ${result.failed.length === 1 ? "file" : "files"}.`,
        {
          detail: result.failed
            .map((failure) => `${failure.path}\n${failure.message}`)
            .join("\n\n"),
        },
      );
    return result;
  },

  selectedFolders() {
    const paths = this.getTreePaths();
    if (!paths?.length) {
      lumine.notifications.addWarning("Select a folder in the tree view first.");
      return null;
    }
    return paths;
  },

  cleanSelectedFolders(filter) {
    const paths = this.selectedFolders();
    if (paths) return this.cleanByPaths(paths, filter);
  },

  cleanCustomFilters() {
    const paths = this.selectedFolders();
    if (!paths) return;
    const selectedPaths = Object.freeze([...paths]);
    const textView = new TextView(
      "",
      false,
      false,
      "Enter the glob pattern to find the files to be deleted",
    );
    this.dialogs.add(textView);
    textView.onDidClose(() => this.dialogs.delete(textView));
    textView.attach((filter) => {
      if (!this.isActive()) return;
      try {
        cleanupPattern(filter);
        return this.cleanByPaths(selectedPaths, filter);
      } catch (error) {
        textView.showError(error.message);
        return false;
      }
    });
    return textView;
  },

  wingFixTreeS() {
    const paths = this.selectedFolders();
    if (paths) return this.wingFix(paths, "*.gra");
  },

  wingFixTreeR() {
    const paths = this.selectedFolders();
    if (paths) return this.wingFix(paths, "**/*.gra");
  },
};

module.exports.cleanupPattern = cleanupPattern;
module.exports.wingFixed = wingFixed;
