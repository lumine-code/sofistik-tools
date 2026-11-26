const { TextBuffer } = require("lumine");
const { appendMissingScale } = require("./wing-source");
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

function fileFailure(failedPath, phase, { code, message, syscall }) {
  return { path: failedPath, phase, code, message, syscall };
}

function describeCount(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function failureDetail(failure, useProjectPaths) {
  let displayPath = failure.path;
  if (useProjectPaths) {
    const [root, relativePath] = lumine.project.relativizePath(failure.path);
    if (root) displayPath = relativePath || ".";
  }

  const suffix = `, ${failure.syscall} '${failure.path}'`;
  const reason =
    failure.syscall && failure.message.endsWith(suffix)
      ? failure.message.slice(0, -suffix.length)
      : failure.message;
  return `${displayPath} — ${reason}`;
}

function failureReport(failures, { action, fileNoun, scanNoun = "selected folder", deleted = 0 }) {
  const fileFailures = [];
  const scanFailures = [];
  const useProjectPaths = lumine.project.getPaths().length === 1;
  for (const failure of failures) {
    const list = failure.phase === "scan" ? scanFailures : fileFailures;
    list.push(failureDetail(failure, useProjectPaths));
  }

  const summary = [];
  if (deleted) summary.push(`Deleted ${describeCount(deleted, "file")}.`);
  if (fileFailures.length) {
    const count = deleted ? fileFailures.length : describeCount(fileFailures.length, fileNoun);
    summary.push(`Could not ${action} ${count}.`);
  }
  if (scanFailures.length) {
    summary.push(`Could not scan ${describeCount(scanFailures.length, scanNoun)}.`);
  }

  const detail =
    fileFailures.length && scanFailures.length
      ? ["Files", ...fileFailures, "", "Scans", ...scanFailures]
      : [...fileFailures, ...scanFailures];
  return { summary: summary.join(" "), detail: detail.join("\n") };
}

module.exports = {
  async cleanByPaths(paths, filter) {
    const result = await this.mutateSelectedFiles(
      paths,
      cleanupPattern(filter),
      (file) => fs.unlinkSync(file),
      false,
    );
    if (result.failed.length && this.isActive()) {
      const { summary, detail } = failureReport(result.failed, {
        action: "delete",
        fileNoun: "file",
        deleted: result.changed.length,
      });
      lumine.notifications.addWarning(summary, {
        detail,
        detailCollapsed: true,
        dismissable: true,
        window: this.context?.window,
      });
    }
    return result;
  },

  async wingFix(paths, filter) {
    const result = await this.mutateSelectedFiles(
      paths,
      filter,
      async (file) => {
        const before = fs.statSync(file);
        const buffer = await TextBuffer.load(file);
        const options = { signal: this.abortController.signal, isCurrent: () => this.isActive() };
        try {
          await buffer.replaceAllMatches(/ +MSCA \w+/gim, "", options);
          buffer.setTextViaDiff(await appendMissingScale(buffer.getTextSnapshot(), options));
          await buffer.replaceAllMatches(/^ *DB/gim, "$ DB", options);
          if (!this.isActive())
            throw Object.assign(new Error("SOFiSTiK operation cancelled"), { name: "AbortError" });
          if (buffer.getFileState() !== "unmodified") {
            const after = fs.statSync(file);
            if (
              ["dev", "ino", "size", "mtimeMs", "ctimeMs"].some((key) => before[key] !== after[key])
            )
              throw new Error(
                "The WING file changed during cleanup. No result was written; run the action again.",
              );
            await buffer.save();
          }
        } finally {
          buffer.destroy();
        }
      },
      true,
    );
    if (result.failed.length && this.isActive()) {
      const { summary, detail } = failureReport(result.failed, {
        action: "update",
        fileNoun: "WING file",
        scanNoun: "selected path",
      });
      lumine.notifications.addWarning(summary, {
        detail,
        detailCollapsed: result.failed.length > 1,
        window: this.context?.window,
      });
    }
    return result;
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
        result.failed.push(fileFailure(selectedPath, "scan", error));
      }
    }
    for (const file of files) {
      if (!this.isActive()) break;
      try {
        await mutate(file);
        result.changed.push(file);
      } catch (error) {
        result.failed.push(fileFailure(file, "mutation", error));
      }
    }
    result.cancelled = !this.isActive();
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
      this.context?.window ?? lumine.workspace.getMainWindow(),
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
