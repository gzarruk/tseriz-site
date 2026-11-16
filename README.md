# tseriz site

The static front end of [tseriz](https://tseriz.gzarruk.com), served by GitHub Pages. It talks only to
the tseriz API gateway; nothing runs server-side here.

Today it holds the **"Try it" page** (`index.html`): anyone can generate a synthetic series of up to
10,000 points without an account, from one of six examples or a short form, see it charted and
download it as CSV. Requests go to the API in anonymous mode, each with a fresh Cloudflare Turnstile
token.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | The page (Alpine.js and Plotly from jsDelivr, pinned versions). |
| `assets/app.js` | The page's Alpine component: Turnstile, API calls, chart, download. |
| `assets/lib.js` | Pure helpers: request building, point estimates, CSV, chart thinning, error text. |
| `assets/config.js` | Public settings: API address, Turnstile site key, sign-up link. |
| `data/presets.json` | The six examples, exported from `apps/phoenix/library_templates.py` in the tseriz repo as API requests, with their thumbnails. Each was validated and run on the engine when exported. |
| `tests/lib.test.mjs` | Unit tests for `assets/lib.js` and the presets file. |

Limits shown on the page (points, channels) are read from the API's `GET capabilities/`, so they follow
the plan data in the tseriz repo rather than being copied here.

## Develop

```bash
node --test
```

To try the page against a local gateway and engine, run both (see `gateway/README.md` in the tseriz
repo, with `APP_URL` set to this server's origin), point `apiBase` in `assets/config.js` at the
gateway, and serve this directory:

```bash
python3 -m http.server 8000
```

The Turnstile key in `assets/config.js` is Cloudflare's always-pass test key, which works with the
gateway's test secret.

## Before going live

1. Put the real Turnstile site key in `assets/config.js` (the secret goes on the gateway).
2. Set `apiBase` to where the gateway answers: its `workers.dev` address, or `https://tseriz.com`
   once `tseriz.com/api/*` is routed to it.
3. In this repository's **Settings → Pages**, publish from the default branch, root folder. The
   `CNAME` file asks for `tseriz.gzarruk.com`; add a `CNAME` DNS record for `tseriz` pointing to
   `gzarruk.github.io`.
