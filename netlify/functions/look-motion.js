exports.handler = async function(event) {
  const headers = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
  const json = (statusCode, body) => ({statusCode, headers, body:JSON.stringify(body)});
  if (event.httpMethod === "OPTIONS") return {statusCode:204,headers};
  if (event.httpMethod !== "POST") return json(405,{ok:false,error:"POST required"});
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(503,{ok:false,code:"AI_NOT_CONFIGURED",error:"AI video provider is not configured on the server yet."});
  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return json(400,{ok:false,error:"Invalid JSON"}); }
  if (!body.image || typeof body.image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/i.test(body.image)) {
    return json(400,{ok:false,error:"A valid image data URL is required."});
  }
  const mimeType = body.mimeType || (body.image.match(/^data:([^;]+);/) || [])[1] || "image/jpeg";
  const imageData = body.image.replace(/^data:[^;]+;base64,/i,"");
  const prompt = [
    "Create an 8-second horizontal 360-degree fashion rotation video from this exact finished AI styling image.",
    "Keep the same adult person, face, identity, body proportions, hairstyle, outfit, colors and accessories.",
    "Make one smooth, level, horizontal YAW rotation around the person's vertical body axis: front view, right side, back view, left side, front view. Turntable spin in place, not a camera orbit.",
    "Lock camera height, distance and framing. YAW ONLY. No pitch, roll, tilt, overhead/low angle, vertical movement or camera orbit. Keep the person centered and fully visible.",
    "Preserve garment construction, silhouette, texture and colors. No scene change, extra people, text, logos, watermark or cuts."
  ].join("\n");
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning",{
      method:"POST",
      headers:{"x-goog-api-key":apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({instances:[{prompt,image:{inlineData:{mimeType,data:imageData}}}],parameters:{aspectRatio:"9:16",durationSeconds:8,resolution:"720p",personGeneration:"allow_adult",numberOfVideos:1}})
    });
    const data = await response.json().catch(()=>({}));
    if (!response.ok || !data.name) return json(response.status || 502,{ok:false,code:"AI_PROVIDER_ERROR",error:data?.error?.message || "The AI video provider could not start generation."});
    return json(202,{ok:true,jobId:data.name,status:"processing"});
  } catch {
    return json(502,{ok:false,code:"NETWORK_ERROR",error:"Could not reach the AI video provider."});
  }
};
