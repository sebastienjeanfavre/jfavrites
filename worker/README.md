# Follow worker

Proxies one audio chunk at a time to Infomaniak's Whisper transcription for the
Follow feature. It holds the Infomaniak token so the browser never sees it.

Deploy from this folder:

    npx wrangler login
    npx wrangler secret put INFOMANIAK_TOKEN
    npx wrangler secret put INFOMANIAK_PRODUCT_ID
    npx wrangler secret put FOLLOW_PASSWORD
    npx wrangler deploy

`wrangler deploy` prints the worker URL. Put it in `WORKER_URL` in `js/follow.js`.

The product id comes from `GET https://api.infomaniak.com/1/ai` with the token
as a bearer header.
