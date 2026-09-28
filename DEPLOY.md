# IXIA Online Deploy Notes

## Local deploy flow

1. `npm test`
2. `npm run build`
3. `npm run cf:pages:ensure`
4. `npm run cf:pages:deploy`
5. `npm run cf:pages:domains`
6. If the domain uses Namecheap BasicDNS:
   `npm run namecheap:dns:sync`

## Expected environment

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PAGES_PROJECT=ixia-online`
- `CLOUDFLARE_PAGES_DOMAINS=ixia.online,www.ixia.online`
- `NAMECHEAP_DOMAIN=ixia.online`
- `NAMECHEAP_API_USER`
- `NAMECHEAP_USERNAME`
- `NAMECHEAP_API_KEY`
- `NAMECHEAP_CLIENT_IP`

## Domain strategy

- Primary URL: `https://www.ixia.online/`
- `www.ixia.online` and `ixia.online` should point to the same Pages project
- `ixia.online` should redirect to `https://www.ixia.online`
- If the domain still uses external nameservers, switch it to Namecheap BasicDNS first, then sync records

## Lead forms (since 2026-09-28)

- Forms `[data-mail-form]` (contact, audit, EN/FR/RU) POST JSON to `/api/lead`.
- `/api/lead*` is served by the Cloudflare Worker `ixia-lead` (zone route, runs in front of Pages), not by Pages.
  Source and deploy script: `/data/projects/site-leads-counters-2026-09/ixia.online/worker/`.
- The Worker sends the lead via Resend (from `leads@remolda.com`) to ctmakc@gmail.com, CC m@mmix.ua, reply-to = client.
- GA4 events from `site.js`: `form_start`, `generate_lead` (key event).
