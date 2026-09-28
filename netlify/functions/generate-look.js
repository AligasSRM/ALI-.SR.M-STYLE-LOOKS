exports.handler = async function(event) {
  const headers = {
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store"
  };

  if (event.httpMethod === "OPTIONS") return {statusCode:204,headers};
  if (event.httpMethod !== "POST") return json(405,{ok:false,error:"POST required"});

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(503,{ok:false,code:"AI_NOT_CONFIGURED",error:"AI provider is not configured on the server yet."});
  }

  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "{}");
    const body = JSON.parse(raw);

    const image = body.image;
    const mimeType = body.mimeType || "image/jpeg";
    const look = body.look || {};

    if (!image || typeof image !== "string") return json(400,{ok:false,error:"Image is required."});

    const imageData = image.replace(/^data:[^;]+;base64,/,"");
    if (!imageData) return json(400,{ok:false,error:"The uploaded image is empty."});

    const prompt = [
      "You are the private AI fashion try-on engine for Ali Sr.M — Style & Looks.",
      "Edit the supplied person's photograph into a realistic fashion try-on result.",
      "Preserve the person's identity, face, body proportions, skin tone, hairstyle, pose and original environment as much as possible.",
      "Change the clothing and beauty styling only according to the requested look.",
      "Keep the whole person visible when the source is full-body.",
      "Create a photorealistic, natural, polished luxury fashion preview.",
      "Do not add text, logos, watermarks, extra people, invented accessories or unrelated objects.",
      "Requested look:",
      JSON.stringify(look)
    ].join("\n");

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
      method:"POST",
      headers:{"x-goog-api-key":apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"gemini-3.1-flash-image",
        input:[
          {type:"image",mime_type:mimeType,data:imageData},
          {type:"text",text:prompt}
        ],
        response_format:{
          type:"image",
          mime_type:"image/png",
          aspect_ratio:"3:4",
          image_size:"1K"
        }
      })
    });

    const data = await response.json().catch(()=>({}));

    if(!response.ok){
      return json(response.status,{
        ok:false,
        code:"AI_PROVIDER_ERROR",
        error:data?.error?.message||"The AI provider rejected the request."
      });
    }

    const stepImage=(data?.steps||[])
      .filter(step=>step?.type==="model_output")
      .flatMap(step=>Array.isArray(step.content)?step.content:[])
      .find(block=>block?.type==="image"&&block?.data);

    const outputImage=data?.output_image||stepImage;
    if(!outputImage?.data){
      return json(502,{ok:false,code:"NO_IMAGE",error:"The AI provider finished without returning an image."});
    }

    return json(200,{
      ok:true,
      mimeType:outputImage.mime_type||"image/png",
      image:outputImage.data
    });
  } catch(error) {
    return json(502,{
      ok:false,
      code:"FUNCTION_ERROR",
      error:error?.message||"The Try-On function failed."
    });
  }

  function json(statusCode,body){
    return {statusCode,headers,body:JSON.stringify(body)};
  }
};
