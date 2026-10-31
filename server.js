const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;

const MIME = {
  ".html":"text/html; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".js":"application/javascript; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".png":"image/png",
  ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg",
  ".webp":"image/webp",
  ".svg":"image/svg+xml",
  ".ico":"image/x-icon"
};

function send(res, status, body, contentType="application/json; charset=utf-8") {
  res.writeHead(status, {"Content-Type":contentType,"Cache-Control":"no-store"});
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function serveStatic(req, res) {
  let requestPath;
  try { requestPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
  catch { return send(res, 400, {ok:false,error:"Bad path"}); }
  if (requestPath === "/") requestPath = "/index.html";
  if (requestPath.includes("..")) return send(res, 400, {ok:false,error:"Bad path"});
  const filePath = path.join(ROOT, requestPath);
  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {"Content-Type":MIME[ext] || "application/octet-stream"});
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    const index = path.join(ROOT, "index.html");
    fs.createReadStream(index).on("error", () => send(res, 404, {ok:false,error:"Not found"})).pipe(res);
  });
}
const server = http.createServer((req, res) => serveStatic(req, res));
server.listen(PORT, "0.0.0.0", () => console.log("ALI SR.M server listening on port " + PORT));
