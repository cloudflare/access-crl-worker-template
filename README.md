# Access CRL Worker Template

This worker fetches a CRL from a given endpoint and uses it to check if a certificate used for Access MTLS is valid.

## Configuration

There are a few setup steps needed to use this worker

1. Replace the CRL_URL variable in `index.js` with the location of your CRL.
1. Create a Cloudflare Workers KV namespace and set it in your `wrangler.toml` file.

## Deployment
Make sure you have set the needed configuration and then run the following.
```
wrangler publish
```

## Force refetch

By default we rely on the next update field in the CRL to know when to refresh the CRL. However you can force a refresh of the CRL by adding a `force-crl-refresh: 1` header to the your request

## Caveats

1. Due to workers CPU time limits any CRL with more than 5000 serial numbers on it has a chance to hit the CPU time limit and fail.
1. This worker will only check the CRL if the request coming in had a certifcate successfully presented to the Cloudflare edge.