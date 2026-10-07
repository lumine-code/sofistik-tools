const { ripgrepPath } = require("lumine");
const { spawn } = require("child_process");

/**
 * Find files under a directory matching a glob pattern using the editor's
 * bundled ripgrep binary (replaces the former `glob` dependency).
 *
 * Pattern semantics mirror the old glob usage:
 * - a pattern without `/` matches top-level files only,
 * - a pattern containing `/` (e.g. `**\/*.gra`) matches per its own structure.
 *
 * `.git`/`.hg` directories are always excluded, and ignore files are not
 * honored (a positive `-g` would override .gitignore anyway, and cleanup
 * crawlers must see every file).
 *
 * @param {string} dirPath - Directory to search in
 * @param {string} pattern - Glob pattern (gitignore-style, `{a,b}` alternation)
 * @returns {Promise<string[]>} Paths relative to dirPath
 */
function findFiles(dirPath, pattern, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return resolve([]);
    // `--null` terminates each path with NUL instead of a newline. A newline is
    // a legal character in a filename, so splitting on one would break such a
    // path into two that do not exist — the same reason core's crawler in
    // `lumine/src/ripgrep-file-crawler.js` passes it.
    const args = [
      "--files",
      "--no-ignore",
      "--hidden",
      "--no-messages",
      "--null",
      "-g",
      "!.git",
      "-g",
      "!.hg",
      "-g",
      pattern,
    ];
    if (!pattern.includes("/")) {
      args.push("--max-depth", "1");
    }

    let child;
    try {
      child = spawn(ripgrepPath, args, { cwd: dirPath, signal });
    } catch (error) {
      if (signal?.aborted) resolve([]);
      else reject(error);
      return;
    }

    let output = "";
    let errors = "";
    // Guard against UTF-8 code points split across chunk boundaries.
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    child.on("error", (error) => (signal?.aborted ? resolve([]) : reject(error)));
    child.on("close", (code) => {
      if (signal?.aborted) return resolve([]);
      if (code > 1)
        return reject(new Error(errors.trim() || `File discovery exited with code ${code}.`));
      // Records are NUL-terminated rather than separated, so the trailing empty
      // element falls out with the filter.
      resolve(output.split("\0").filter(Boolean));
    });
  });
}

module.exports = { findFiles };
