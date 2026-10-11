function validOperation(value) {
  return typeof value === "string" &&
    /^models\/[A-Za-z0-9._-]+\/operations\/[A-Za-z0-9._-]+$/.test(value);
}
exports.handler = async function(event) {
  const json = (statusCode, body) => ({statusCode,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"},body:JSON.stringify(body)});
  if (event.httpMethod !== "GET") return json(405,{ok:false,error:"GET required"});
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(503,{ok:false,code:"AI_NOT_CONFIGURED",error:"AI video provider is not configured on the server yet."});
  const operation = event.queryStringParameters?.jobId || "";
  if (!validOperation(operation)) return json(400,{ok:false,error:"Invalid motion job identifier."});
  try {
    const statusResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/" + operation,{headers:{"x-goog-api-key":apiKey}});
    const statusData = await statusResponse.json().catch(()=>({}));
    if (!statusResponse.ok) return json(statusResponse.status,{ok:false,error:statusData?.error?.message || "Could not retrieve the completed video job."});
    if (statusData.done !== true || statusData.error) return json(409,{ok:false,error:"The video is not ready yet."});
    const uri = statusData?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri) return json(502,{ok:false,error:"The provider did not return a video URI."});
    const parsed = new URL(uri);
    if (parsed.protocol !== "https:" || parsed.hostname !== "generativelanguage.googleapis.com") return json(502,{ok:false,error:"The provider returned an unexpected video URL."});
    const videoResponse = await fetch(parsed.toString(),{headers:{"x-goog-api-key":apiKey}});
    if (!videoResponse.ok) return json(502,{ok:false,error:"Could not download the generated video."});
    const bytes = Buffer.from(await videoResponse.arrayBuffer());
    return {statusCode:200,isBase64Encoded:true,headers:{"Content-Type":"video/mp4","Cache-Control":"private, no-store","Content-Length":String(bytes.length)},body:bytes.toString("base64")};
  } catch {
    return json(502,{ok:false,error:"Could not deliver the generated video."});
  }
};
