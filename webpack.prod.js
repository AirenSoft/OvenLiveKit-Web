const path = require("path");

const config = [
    {
        mode: 'production',
        entry: "./src/OvenLiveKit.js",
        output: {
            path: path.resolve(__dirname + "/dist"),
            filename: "OvenLiveKit.min.js",
            library: "OvenLiveKit",
            libraryTarget: "umd",
            libraryExport: "default",
        },
        devtool: 'source-map',
    }
];

module.exports = config;