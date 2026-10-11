function validOperation(value) {
  return typeof value === "string" &&
    /^models\/[A-Za-z0-9._-]+\/operations\/[A-Za-z0-9._-]+$/.test(value);
}
exports.handler = async function(event) {
  const headers = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
  const json = (statusCode, body) => ({statusCode,headers,body:JSON.stringify(body)});
  if (event.httpMethod !== "GET") return json(405,{ok:false,error:"GET required"});
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(503,{ok:false,code:"AI_NOT_CONFIGURED",error:"AI video provider is not configured on the server yet."});
  const operation = event.queryStringParameters?.jobId || "";
  if (!validOperation(operation)) return json(400,{ok:false,error:"Invalid motion job identifier."});
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/" + operation,{headers:{"x-goog-api-key":apiKey}});
    const data = await response.json().catch(()=>({}));
    if (!response.ok) return json(response.status,{ok:false,status:"failed",error:data?.error?.message || "Could not check the video job."});
    if (data.done !== true) return json(200,{ok:true,status:"processing"});
    if (data.error) return json(200,{ok:false,status:"failed",error:data.error.message || "Video generation failed."});
    const uri = data?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri) return json(200,{ok:false,status:"failed",error:"The provider finished without returning a video."});
    return json(200,{ok:true,status:"ready",videoUrl:"/api/look-motion-video?jobId="+encodeURIComponent(operation)});
  } catch {
    return json(502,{ok:false,status:"failed",error:"Could not reach the video provider while checking the job."});
  }
};
