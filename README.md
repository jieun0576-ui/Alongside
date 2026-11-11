# Alongside

*Move Together. Stay Together.*

A browser-based 3D social space where people rest and run together along a virtual Toronto Waterfront.

## Run it

```
npm install
npm run dev       # just the 3D scene, fast reload; open the "Network" URL on your phone
npm run dev:full  # scene + room server (Cloudflare running locally) on port 8787
npm test          # checks for what the server accepts from phones
npm run build     # type check + static site in dist/
```

## Publish

Cloudflare Workers, connected to this repo: build command `npm run build`, deploy
`npx wrangler deploy`. `wrangler.jsonc` serves `dist/` and runs the room server in
`worker/` (a Durable Object, one per waterfront). Every merge to `main` goes live by itself.
