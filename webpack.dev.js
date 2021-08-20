const path = require("path");

const config = [
    {
        mode: 'development',
        entry: "./src/OvenLiveKit.js",
        output: {
            path: path.resolve(__dirname + "/dist"),
            filename: "OvenLiveKit.js",
            library: "OvenLiveKit",
            libraryTarget: "umd",
            libraryExport: "default",
        }
    }
];

module.exports = config;