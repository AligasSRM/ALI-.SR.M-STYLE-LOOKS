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

const motionJobs = new Map();

async function startLookMotion(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, "");
  if (req.method !== "POST") return send(res, 405, {ok:false,error:"POST required"});
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return send(res, 503, {ok:false,code:"AI_NOT_CONFIGURED",error:"AI provider is not configured on the server yet."});
  let body;
  try { body = await readJson(req); } catch (e) {
    return send(res, 400, {ok:false,error:e.message || "Invalid JSON"});
  }
  const image = body.image;
  const mimeType = body.mimeType || "image/png";
  if (!image || typeof image !== "string") return send(res, 400, {ok:false,error:"AI Try-On image is required"});
  const imageData = image.replace(/^data:[^;]+;base64,/,"");
  const prompt = [
    "Create a premium fashion try-on motion preview from this single finished AI styling image.",
    "The adult model remains the same person with the same face, body proportions, hairstyle, outfit, colors and environment.",
    "Slow controlled fashion-model rotation: front view, right three-quarter view, side view, back three-quarter view, back view, then return toward front.",
    "Show the outfit naturally from multiple angles with stable anatomy and fabric. Keep the camera at a consistent full-body distance.",
    "Do not change the garment design, color, silhouette or accessories. Do not add people, text, logos or watermarks.",
    "Luxury fashion showroom realism, smooth movement, clean lighting, no sudden cuts."
  ].join("\n");
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning", {
      method:"POST",
      headers:{"x-goog-api-key":apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({
        instances:[{
          prompt,
          image:{inlineData:{mimeType,data:imageData}}
        }],
        parameters:{aspectRatio:"9:16",resolution:"720p",numberOfVideos:1}
      })
    });
    const data=await response.json();
    if(!response.ok || !data.name) return send(res,response.status||502,{ok:false,code:"AI_PROVIDER_ERROR",error:data?.error?.message||"Could not start motion generation."});
    const id="motion_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8);
    motionJobs.set(id,{operation:data.name,status:"processing",createdAt:Date.now()});
    return send(res,202,{ok:true,jobId:id,status:"processing"});
  } catch(error) {
    return send(res,502,{ok:false,code:"NETWORK_ERROR",error:"Could not reach the AI video provider."});
  }
}

async function motionStatus(req,res) {
  if (req.method !== "GET") return send(res,405,{ok:false,error:"GET required"});
  const id=new URL(req.url,"http://localhost").searchParams.get("jobId");
  const job=id && motionJobs.get(id);
  if(!job) return send(res,404,{ok:false,error:"Motion job not found"});
  if(job.status==="ready" || job.status==="failed") return send(res,200,{ok:job.status==="ready",status:job.status,error:job.error||null});
  const apiKey=process.env.GEMINI_API_KEY;
  try {
    const response=await fetch("https://generativelanguage.googleapis.com/v1beta/"+job.operation,{headers:{"x-goog-api-key":apiKey}});
    const data=await response.json();
    if(!response.ok) return send(res,502,{ok:false,status:"failed",error:data?.error?.message||"Could not check motion generation."});
    if(data.done===true) {
      if(data.error) {
        job.status="failed"; job.error=data.error.message||"Motion generation failed.";
        return send(res,200,{ok:false,status:"failed",error:job.error});
      }
      const videoUri=data?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      if(!videoUri) {
        job.status="failed"; job.error="The AI provider finished without a video.";
        return send(res,200,{ok:false,status:"failed",error:job.error});
      }
      job.videoUri=videoUri; job.status="ready";
      return send(res,200,{ok:true,status:"ready",videoUrl:"/api/look-motion-video?jobId="+encodeURIComponent(id)});
    }
    return send(res,200,{ok:true,status:"processing"});
  } catch(error) {
    return send(res,200,{ok:true,status:"processing"});
  }
}

async function motionVideo(req,res) {
  if (req.method !== "GET") return send(res,405,{ok:false,error:"GET required"});
  const id=new URL(req.url,"http://localhost").searchParams.get("jobId");
  const job=id && motionJobs.get(id);
  if(!job || job.status!=="ready" || !job.videoUri) return send(res,404,{ok:false,error:"Motion video is not ready"});
  try {
    const response=await fetch(job.videoUri,{headers:{"x-goog-api-key":process.env.GEMINI_API_KEY}});
    if(!response.ok) return send(res,502,{ok:false,error:"Could not download the generated motion video."});
    res.writeHead(200,{"Content-Type":"video/mp4","Cache-Control":"no-store"});
    const buffer=Buffer.from(await response.arrayBuffer());
    res.end(buffer);
  } catch(error) {
    return send(res,502,{ok:false,error:"Could not deliver the generated motion video."});
  }
}

const server = http.createServer((req, res) => {
  if (req.url.split("?")[0] === "/api/generate-look") return generateLook(req, res);\n  if (req.url.split("?")[0] === "/api/look-motion") return startLookMotion(req, res);\n  if (req.url.split("?")[0] === "/api/look-motion-status") return motionStatus(req, res);\n  if (req.url.split("?")[0] === "/api/look-motion-video") return motionVideo(req, res);
  serveStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("ALI SR.M server listening on port " + PORT);
});