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

- Primary URL: `https://ixia.online/`
- `www.ixia.online` should point to the same Pages project
- If the domain still uses external nameservers, switch it to Namecheap BasicDNS first, then sync records
