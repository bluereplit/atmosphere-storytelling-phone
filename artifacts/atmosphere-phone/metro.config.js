const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude pnpm's unpacked native _tmp_ directories from Metro's file watcher.
// expo-av (and some other packages) extract iOS native files into a temp path
// that doesn't actually exist on disk, causing an ENOENT watch error.
const { resolver } = config;
config.resolver = {
  ...resolver,
  blockList: [
    /node_modules\/\.pnpm\/.*_tmp_\d+\/.*/,
  ],
};

module.exports = config;
