const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const MAX_BODY = 25 * 1024 * 1024;

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

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (Buffer.byteLength(data) > MAX_BODY) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

async function generateLook(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, "");
  if (req.method !== "POST") return send(res, 405, {ok:false,error:"POST required"});

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return send(res, 503, {ok:false,code:"AI_NOT_CONFIGURED",error:"AI provider is not configured on the server yet."});
  }

  let body;
  try { body = await readJson(req); }
  catch (e) {
    return send(res, 400, {ok:false,error:e.message || "Invalid JSON"});
  }

  const image = body.image;
  const mimeType = body.mimeType || "image/jpeg";
  const look = body.look || {};

  if (!image || typeof image !== "string") {
    return send(res, 400, {ok:false,error:"Image is required"});
  }

  const prompt = [
    "You are the private AI fashion stylist for Ali Sr.M — Style & Looks.",
    "Edit the supplied person's photo into a realistic fashion try-on.",
    "Preserve the person's identity, face, body proportions, pose, skin tone and original scene as much as possible.",
    "Change only the styling requested below. Do not add text, logos, watermarks, extra people, or unrelated objects.",
    "Create a polished luxury fashion result suitable for a private styling preview.",
    "Requested styling:",
    JSON.stringify(look)
  ].join("\n");

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method:"POST",
      headers:{"x-goog-api-key":apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"gemini-3.1-flash-image",
        input:[
          {type:"text",text:prompt},
          {type:"image",data:image.replace(/^data:[^;]+;base64,/,""),mime_type:mimeType}
        ],
        response_format:{
          type:"image",mime_type:"image/png",aspect_ratio:"3:4",image_size:"1K"
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return send(res, response.status, {
        ok:false,code:"AI_PROVIDER_ERROR",
        error:data?.error?.message || "AI provider request failed."
      });
    }

    const stepImage = (data?.steps || [])
      .filter(step => step?.type === "model_output")
      .flatMap(step => Array.isArray(step.content) ? step.content : [])
      .find(block => block?.type === "image" && block?.data);

    const outputImage = data?.output_image || stepImage;
    if (!outputImage?.data) {
      return send(res, 502, {ok:false,code:"NO_IMAGE",error:"The AI provider returned no generated image."});
    }

    return send(res, 200, {
      ok:true,
      mimeType:outputImage.mime_type || "image/png",
      image:outputImage.data
    });
  } catch (error) {
    return send(res, 502, {ok:false,code:"NETWORK_ERROR",error:"Could not reach the AI provider."});
  }
}

function serveStatic(req, res) {
  let requestPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
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
    fs.createReadStream(index).on("error", () => send(res, 404, {ok:false,error:"Not found"}))
      .pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.split("?")[0] === "/api/generate-look") return generateLook(req, res);
  serveStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("ALI SR.M server listening on port " + PORT);
});