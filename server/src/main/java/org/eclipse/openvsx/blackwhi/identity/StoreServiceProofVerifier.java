/*
 * BlackWhi Store - STORE-01.4 service trust gate.
 * SPDX-License-Identifier: EPL-2.0
 */
package org.eclipse.openvsx.blackwhi.identity;

import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.interfaces.EdECPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.time.Clock;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

import static org.eclipse.openvsx.blackwhi.identity.StoreServiceProof.ServiceIdentityDenied;

/**
 * Offline identity and least-privilege verification; never mints a proof or
 * asserts any rights at FIT Registry/NestJS. Denies when no public key is pinned.
 * Replay cache is per JVM and deliberately NOT a distributed auth solution.
 */
public final class StoreServiceProofVerifier {
    private static final int MAX_KEYS = 16;
    private static final int MAX_REPLAY = 4096;
    private final Map<String, PublicKey> trusted;
    private final Clock clock;
    // Guarded by synchronized verify. Store only the nonce and expiry, never a token.
    private final Map<String, Long> seen = new HashMap<>();

    public StoreServiceProofVerifier(Map<String, PublicKey> trusted, Clock clock) {
        if (trusted == null || clock == null || trusted.size() > MAX_KEYS) {
            throw new ServiceIdentityDenied();
        }
        for (var entry : trusted.entrySet()) {
            if (!StoreServiceProof.id(entry.getKey())
                    || !(entry.getValue() instanceof EdECPublicKey key)
                    || !"Ed25519".equals(key.getParams().getName())) {
                throw new ServiceIdentityDenied();
            }
        }
        this.trusted = Map.copyOf(trusted);
        this.clock = clock;
    }

    /** Public keys only: base64 DER/SPKI. Missing configuration means deny-all. */
    public static StoreServiceProofVerifier fromPinnedKey(
            String keyId, String publicKeySpkiBase64, Clock clock) {
        if ((keyId == null || keyId.isEmpty())
                && (publicKeySpkiBase64 == null || publicKeySpkiBase64.isEmpty())) {
            return new StoreServiceProofVerifier(Map.of(), clock);
        }
        if (!StoreServiceProof.id(keyId) || publicKeySpkiBase64 == null
                || publicKeySpkiBase64.length() > 512) {
            throw new ServiceIdentityDenied();
        }
        try {
            byte[] der = Base64.getDecoder().decode(publicKeySpkiBase64);
            if (der.length != 44 || !Base64.getEncoder().encodeToString(der)
                    .equals(publicKeySpkiBase64)) throw new ServiceIdentityDenied();
            PublicKey key = KeyFactory.getInstance("Ed25519")
                    .generatePublic(new X509EncodedKeySpec(der));
            return new StoreServiceProofVerifier(Map.of(keyId, key), clock);
        } catch (Exception ex) {
            throw new ServiceIdentityDenied();
        }
    }

    /**
     * Authenticates ONLY the pinned service subject for the exact catalog GET.
     * No arbitrary scope, HTTP method, path, request body or published status may
     * grant access. Must be called before invoking a protected operation.
     */
    public synchronized VerifiedService verifyCatalogRead(StoreServiceProof proof) {
        if (proof == null || !StoreServiceProof.CATALOG_SUBJECT.equals(proof.subject())
                || !trusted.containsKey(proof.keyId())) {
            throw new ServiceIdentityDenied();
        }
        long now = clock.instant().getEpochSecond();
        if (proof.issuedAtEpochSec() > now + 5 || proof.expiresAtEpochSec() <= now
                || proof.issuedAtEpochSec() < now - 125) {
            throw new ServiceIdentityDenied();
        }
        try {
            byte[] encoded = Base64.getUrlDecoder().decode(proof.signature());
            if (encoded.length != 64 || !Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(encoded).equals(proof.signature())) {
                throw new ServiceIdentityDenied();
            }
            Signature signature = Signature.getInstance("Ed25519");
            signature.initVerify(trusted.get(proof.keyId()));
            signature.update(proof.signedPayload());
            if (!signature.verify(encoded)) throw new ServiceIdentityDenied();
        } catch (ServiceIdentityDenied ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ServiceIdentityDenied();
        }
        // Never accept the same signed nonce twice within a process.
        seen.entrySet().removeIf(e -> e.getValue() <= now);
        String replayKey = proof.keyId() + ":" + proof.nonce();
        if (seen.containsKey(replayKey) || seen.size() >= MAX_REPLAY) {
            throw new ServiceIdentityDenied();
        }
        seen.put(replayKey, proof.expiresAtEpochSec());
        return new VerifiedService(proof.subject(), proof.keyId(), proof.permission());
    }

    /** Verifier-issued identity, never deserialized from client-provided claims. */
    public record VerifiedService(String subject, String keyId, String permission) { }
}
