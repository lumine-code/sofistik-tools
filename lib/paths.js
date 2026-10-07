module.exports = {
  changeExtension(filePath, ext) {
    if (!ext) {
      return filePath;
    }
    let dotIndex = filePath.lastIndexOf(".");
    let slsIndex = filePath.lastIndexOf("/");
    let slbIndex = filePath.lastIndexOf("\\");
    if (dotIndex < Math.max(slsIndex, slbIndex)) {
      return filePath + ext;
    } else {
      return filePath.substr(0, dotIndex) + ext;
    }
  },
};
