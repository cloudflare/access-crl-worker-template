# Access CRL Worker Template

This worker fetches a CRL from a given endpoint and uses it to check if a certificate used with [Cloudflare Access Mutual TLS](https://developers.cloudflare.com/access/service-auth/mtls/) is valid.

## Configuration

There are a few setup steps needed to use this worker

1. Create or reuse a Cloudflare Workers KV namespace and put the ID in your `wrangler.toml` file on the `kv-namespaces` line.
    1. If you are creating a new namespace, you can use wrangler to do it.
        ```shell
        $ wrangler kv:namespace create CRL_NAMESPACE 
        ```
    1. Copy the output of the command into your `wrangler.toml` file and replace the stub.

1. Set the URL of your CRL
    1. **If you are using wrangler version 1.8.0 or higher.** Set the `CRL_URL` variable in your `wrangler.toml` file to your CRL URL.
    1. **If you are using a wrangler version older than 1.8.0** Uncomment and replace the CRL_URL variable in `index.js` with the location of your CRL. Remove the `vars` line in the `wrangler.toml` file.

## Deployment
Make sure you have set the needed configuration and then run the following.
```
wrangler publish
```

#### Force refetch

By default we rely on the next update field in the CRL to know when to refresh the CRL. However you can force a refresh of the CRL by adding a `force-crl-refresh: 1` header to the your request

## Caveats

1. Due to workers CPU time limits any CRL with more than 5000 serial numbers on it has a chance to hit the CPU time limit and fail.
1. This worker will only check the CRL if the request coming in had a certifcate successfully presented to the Cloudflare edge.