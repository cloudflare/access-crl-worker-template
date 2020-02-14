/**
 * This worker script will handle loading a CRL and doing a cert revocation check
 *
 * You can force a refresh of the CRL by adding a `force-crl-refresh: 1` header to the original request
 */

import * as asn1js from 'asn1js'
import { CertificateRevocationList } from 'pkijs'

// The URL where your CRL is located. We will fetch it from here.
// Uncomment this line if you can't use wrangler >= 1.8.0
// const CRL_URL = '<REPLACE_ME>'

// The key we store your crl under in your namespace
const CRL_KV_KEY = `CRL_${btoa(CRL_URL)}`

// Optional header that will force the worker to get an updated CRL
const FORCE_CRL_REFRESH_HEADER = 'force-crl-refresh'

/**
 * Worker entry point
 */
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event))
})

/**
 * Return a 403 response
 */
function forbidden() {
  return new Response('client certificate was revoked', { status: 403 })
}

/**
 * Helper function that converts a buffer to a hex string
 * @param {*} inputBuffer
 */
function bufToHex(inputBuffer) {
  let result = ''
  for (const item of new Uint8Array(inputBuffer, 0, inputBuffer.byteLength)) {
    const str = item.toString(16).toUpperCase()
    if (str.length === 1) result += '0'
    result += str
  }
  return result.trim()
}

/**
 * Fetchs a CRL list, parses out the serial numbers, and stores them into workers kv
 */
async function updateCRL() {
  const crlResp = await fetch(CRL_URL)
  if (crlResp.status == 200) {
    const buf = await crlResp.arrayBuffer()
    const asn1 = asn1js.fromBER(buf)
    const crlSimpl = new CertificateRevocationList({
      schema: asn1.result,
    })
    const newCRL = {
      nextUpdate: crlSimpl.nextUpdate.value,
      thisUpdate: crlSimpl.thisUpdate.value,
      revokedSerialNumbers: crlSimpl.revokedCertificates.reduce(
        (revokedSerialNums, cert) => {
          let serialNum = bufToHex(cert.userCertificate.valueBlock.valueHex)
          revokedSerialNums[serialNum] = true
          return revokedSerialNums
        },
        {},
      ),
    }
    CRL_NAMESPACE.put(CRL_KV_KEY, JSON.stringify(newCRL))
    return newCRL
  }
  throw new Error(`failed to fetch crl with status ${crlResp.status}`)
}

/**
 * Load a CRL from workers kv. Handles refreshing the crl as needed.
 */
async function loadCRL(event, forceCRLRefresh = false) {
  // Force a refresh of the CRL list if needed
  if (forceCRLRefresh) {
    return await updateCRL()
  }

  // attempt to get the CRL from workers kv first
  let crl = await CRL_NAMESPACE.get(CRL_KV_KEY, 'json')
  if (!crl) {
    // the CRL wasn't in workers kv, so go fetch it from the source
    crl = await updateCRL()
  }

  // Check to see if we should refresh the CRL
  const nextUpdate = Date.parse(crl.next_update)
  const now = new Date()
  if (now > nextUpdate) {
    // it is time to update the CRL. Out of band send a request to update the workers kv key
    event.waitUntil(updateCRL())
  }

  return crl
}

async function handleRequest(event) {
  try {
    const request = event.request
    // Ensure the request has the Cloudflare cf object and certificate headers and that the certificate was successfully presented
    // If so, then check the CRL to see if the cert was revoked.
    if (
      request.cf &&
      request.cf.tlsClientAuth &&
      request.cf.tlsClientAuth.certPresented &&
      request.cf.tlsClientAuth.certVerified === 'SUCCESS'
    ) {
      // Check to see if we were asked to force a CRL refresh
      const forceCRLRefresh = request.headers.get(FORCE_CRL_REFRESH_HEADER)
        ? true
        : false

      // Load the crl
      const crl = await loadCRL(event, forceCRLRefresh)
      if (!crl) {
        return new Response('failed to load CRL', { status: 500 })
      }

      // Check to see if the certificate the user presented is in the crl
      if (crl.revokedSerialNumbers[request.cf.tlsClientAuth.certSerial]) {
        return forbidden()
      }
    }
    return await fetch(request)
  } catch (e) {
    return new Response(`failed to load CRL ${e}`, { status: 500 })
  }
}
