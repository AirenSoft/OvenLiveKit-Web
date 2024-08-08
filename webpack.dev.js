const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const config = [
    {
        devServer: {
            port: 8085,
            allowedHosts: "all"
        },
        mode: 'development',
        entry: "./src/OvenLiveKit.js",
        output: {
            path: path.resolve(__dirname + "/dist"),
            filename: "OvenLiveKit.js",
            library: "OvenLiveKit",
            libraryTarget: "umd",
            libraryExport: "default",
        },
        plugins: [
            new HtmlWebpackPlugin({
                template: "./index.html"
            })
        ]
    }
];

module.exports = config;