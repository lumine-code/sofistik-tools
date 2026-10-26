const fs = require("node:fs");
const MAX_BYTES = 1024 * 1024;

function readDefinitionFile(file) {
  let descriptor;
  try {
    descriptor = fs.openSync(file, "r");
    const reject = () => {
      throw Object.assign(
        new RangeError(
          "sofistik.def exceeds its 1 MiB configuration limit. The file was not changed.",
        ),
        { code: "ERR_SOFISTIK_DEFINITION_LIMIT" },
      );
    };
    if (fs.fstatSync(descriptor).size > MAX_BYTES) reject();
    // One extra byte detects concurrent growth without an unbounded readFile.
    const bytes = Buffer.allocUnsafe(MAX_BYTES + 1);
    let length = 0,
      count;
    while (
      length <= MAX_BYTES &&
      (count = fs.readSync(descriptor, bytes, length, bytes.length - length, null))
    )
      length += count;
    if (length > MAX_BYTES) reject();
    return bytes.toString("utf8", 0, length);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

module.exports = { readDefinitionFile, MAX_BYTES };
