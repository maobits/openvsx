/*
 * BlackWhi Store - STORE-01.4 service identity boundary.
 * SPDX-License-Identifier: EPL-2.0
 */
package org.eclipse.openvsx.blackwhi.identity;

import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

/**
 * Explicit signed assertion for a single, read-only internal catalog operation.
 * This does not represent a user session, a package publisher or a FIT capability.
 * Wire transport and NestJS verification are NOT implemented in this milestone.
 */
public record StoreServiceProof(
        String contract, String keyId, String subject, String audience,
        String method, String path, String permission, String bodySha256,
        long issuedAtEpochSec, long expiresAtEpochSec, String nonce, String signature) {
    public static final String CONTRACT = "blackwhi.store.service-proof.v1";
    public static final String AUDIENCE = "blackwhi-store";
    public static final String CATALOG_SUBJECT = "service.store.catalog";
    public static final String CATALOG_PATH = "/fit-registry/v1/catalog";
    public static final String CATALOG_PERMISSION = "fit.registry.catalog.read";
    // SHA-256 of empty HTTP request body, for the only GET operation supported here.
    public static final String EMPTY_BODY_SHA256 =
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    private static final Pattern ID = Pattern.compile("[a-z][a-z0-9._-]{2,63}");
    private static final Pattern NONCE = Pattern.compile("[A-Za-z0-9_-]{22}");
    private static final Pattern SIG = Pattern.compile("[A-Za-z0-9_-]{86}");

    public StoreServiceProof {
        if (!CONTRACT.equals(contract) || !id(keyId) || !id(subject)
                || !AUDIENCE.equals(audience) || !"GET".equals(method)
                || !CATALOG_PATH.equals(path) || !CATALOG_PERMISSION.equals(permission)
                || !EMPTY_BODY_SHA256.equals(bodySha256)
                || issuedAtEpochSec <= 0 || expiresAtEpochSec <= issuedAtEpochSec
                || expiresAtEpochSec - issuedAtEpochSec > 120
                || !matches(NONCE, nonce) || !matches(SIG, signature)) {
            throw new ServiceIdentityDenied();
        }
    }

    static boolean id(String s) { return matches(ID, s); }
    private static boolean matches(Pattern p, String value) {
        return value != null && p.matcher(value).matches();
    }

    /** Canonical, ASCII-only, fixed-field payload; all content is strictly bounded. */
    public byte[] signedPayload() {
        return ("BLACKWHI_STORE_SERVICE_PROOF_V1\n" + contract + "\n" + keyId + "\n"
                + subject + "\n" + audience + "\n" + method + "\n" + path + "\n"
                + permission + "\n" + bodySha256 + "\n" + issuedAtEpochSec + "\n"
                + expiresAtEpochSec + "\n" + nonce + "\n").getBytes(StandardCharsets.US_ASCII);
    }

    /** Stable, redacted denial. No secret material or submitted proof is reflected. */
    public static final class ServiceIdentityDenied extends SecurityException {
        public ServiceIdentityDenied() { super("BLACKWHI_STORE_SERVICE_IDENTITY_DENIED"); }
    }
}
