// From chinamvp

var port = 8000;

var http = require("http");
var path = require("path");
var fs = require("fs");

console.log("Starting web server at " + port);

http.createServer( function(req, res) {

    var now = new Date();

    var filename = req.url === "" ||req.url === "/" ? "index.html" : req.url;
    var ext = path.extname(filename);
    var localPath = __dirname;
    var validExtensions = {
        ".html" : "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".txt": "text/plain",
        ".jpg": "image/jpeg",
        ".gif": "image/gif",
        ".png": "image/png",
        ".svg": "image/svg+xml"
    };


    localPath += "/" + filename;
    path.exists(localPath, function(exists) {
        if(exists) {
            console.log("Serving file: " + localPath);
            getFile(localPath, res, validExtensions[ext]);
        } else {
            console.log("File not found: " + localPath);
            res.writeHead(404);
            res.end();
        }
    });



}).listen(port);

function getFile(localPath, res, mimeType) {
    fs.readFile(localPath, function(err, contents) {
        if(!err) {
            res.setHeader("Content-Length", contents.length);
            res.setHeader("Content-Type", mimeType);
            res.statusCode = 200;
            res.end(contents);
        } else {
            res.writeHead(500);
            res.end();
        }
    });
}