# IXIA Online

IXIA Online is a compact static site for an AI intake and conversion systems offer aimed at service businesses with expensive leads and messy handoffs.

## Local commands

- `npm test`
- `npm run build`
- `npm run cf:pages:ensure`
- `npm run cf:pages:deploy`
- `npm run cf:pages:domains`
- `npm run namecheap:dns:sync`

## DNS note

- `www.ixia.online` should stay `CNAME -> ixia-online.pages.dev`
- `ixia.online` should redirect to `https://www.ixia.online`
- The static build injects an apex-host redirect so the browser canonicalizes to `www` even when both hosts are attached to the same Pages project

## Site structure

- `/` home
- `/services/`
- `/sectors/`
- `/audit/`
- `/contact/`
- `/privacy/`
- `/thank-you/`
