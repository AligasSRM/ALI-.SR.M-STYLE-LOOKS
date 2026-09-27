exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ ok:false, error:"POST required" }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 503, headers, body: JSON.stringify({
      ok:false,
      code:"AI_NOT_CONFIGURED",
      error:"AI provider is not configured on the server yet."
    }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ ok:false, error:"Invalid JSON" }) };
  }

  const image = body.image;
  const mimeType = body.mimeType || "image/jpeg";
  const look = body.look || {};

  if (!image || typeof image !== "string") {
    return { statusCode: 400, headers, body: JSON.stringify({ ok:false, error:"Image is required" }) };
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
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gemini-3.1-flash-image",
        input: [
          { type: "text", text: prompt },
          { type: "image", data: image.replace(/^data:[^;]+;base64,/, ""), mime_type: mimeType }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          ok:false,
          code:"AI_PROVIDER_ERROR",
          error:data?.error?.message || "AI provider request failed."
        })
      };
    }

    const outputImage = data?.output_image;
    if (!outputImage?.data) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ ok:false, code:"NO_IMAGE", error:"The AI provider returned no generated image." })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok:true,
        mimeType: outputImage.mime_type || "image/png",
        image: outputImage.data
      })
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ ok:false, code:"NETWORK_ERROR", error:"Could not reach the AI provider." })
    };
  }
};
