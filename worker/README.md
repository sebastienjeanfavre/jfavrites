# Worker

Serves the app as static files from the repo root and proxies one audio chunk
at a time to Infomaniak's Whisper transcription for the Sing feature. It
holds the Infomaniak token so the browser never sees it. `.assetsignore` at the
repo root lists what stays out of the upload.

Deploy from this folder:

    npx wrangler login
    npx wrangler secret put INFOMANIAK_TOKEN
    npx wrangler secret put INFOMANIAK_PRODUCT_ID
    npx wrangler secret put SING_PASSWORD
    npx wrangler deploy

One `wrangler deploy` ships the app and the worker together. The product id
comes from `GET https://api.infomaniak.com/1/ai` with the token as a bearer
header.

A push to `main` deploys automatically.
