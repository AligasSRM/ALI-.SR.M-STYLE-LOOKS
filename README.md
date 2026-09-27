# Ali Sr.M — Style & Looks

## Real AI layer

The site now includes a real server-side AI try-on endpoint at:

`/.netlify/functions/generate-look`

The browser sends the selected photo to the serverless function. The Gemini API key is kept server-side in the `GEMINI_API_KEY` environment variable and is never placed in `index.html`.

The function uses Google's Gemini 3.1 Flash Image (Nano Banana 2) image model for image-to-image styling.

### Required deployment setting

On the hosting project, add:

`GEMINI_API_KEY`

as a server environment variable. Never commit the key to GitHub.

If the key is not configured, the endpoint fails closed with `AI_NOT_CONFIGURED`; the browser does not receive or expose a provider key.

Reference: https://ai.google.dev/gemini-api/docs/image-generation
