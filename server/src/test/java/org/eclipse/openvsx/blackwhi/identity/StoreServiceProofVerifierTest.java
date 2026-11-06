/*
 * BlackWhi Store - STORE-01.4 security regression tests.
 * SPDX-License-Identifier: EPL-2.0
 */
package org.eclipse.openvsx.blackwhi.identity;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.Signature;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import com.sun.net.httpserver.HttpServer;
import org.eclipse.openvsx.blackwhi.integration.FitRegistryCatalogService;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.eclipse.openvsx.blackwhi.identity.StoreServiceProof.ServiceIdentityDenied;

class StoreServiceProofVerifierTest {
    private static final long NOW = 1_784_000_000L;
    private static final Clock CLOCK = Clock.fixed(Instant.ofEpochSecond(NOW), ZoneOffset.UTC);
    private static final String KEY_ID = "store-s2s-key-01";
    private static final String SUBJECT = "service.store.catalog";
    private static final String NONCE = "abcdefghijklmnopqrstuv";

    private static KeyPair keyPair() throws Exception {
        return KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
    }

    private static StoreServiceProof sign(KeyPair pair, String keyId, String subject,
                                          String nonce, long issued, long expires) throws Exception {
        var untrusted = new StoreServiceProof(StoreServiceProof.CONTRACT, keyId, subject,
                StoreServiceProof.AUDIENCE, "GET", StoreServiceProof.CATALOG_PATH,
                StoreServiceProof.CATALOG_PERMISSION, StoreServiceProof.EMPTY_BODY_SHA256,
                issued, expires, nonce, "A".repeat(86));
        Signature signer = Signature.getInstance("Ed25519");
        signer.initSign(pair.getPrivate());
        signer.update(untrusted.signedPayload());
        String encoded = Base64.getUrlEncoder().withoutPadding().encodeToString(signer.sign());
        return new StoreServiceProof(untrusted.contract(), keyId, subject,
                untrusted.audience(), untrusted.method(), untrusted.path(), untrusted.permission(),
                untrusted.bodySha256(), issued, expires, nonce, encoded);
    }

    private static StoreServiceProof good(KeyPair pair) throws Exception {
        return sign(pair, KEY_ID, SUBJECT, NONCE, NOW - 10, NOW + 70);
    }

    private static StoreServiceProofVerifier verifier(KeyPair pair) {
        return new StoreServiceProofVerifier(Map.of(KEY_ID, pair.getPublic()), CLOCK);
    }

    @Test void acceptsValidPinnedProofForOnlyReadOnlyCatalogOperation() throws Exception {
        var pair = keyPair();
        var identity = verifier(pair).verifyCatalogRead(good(pair));
        assertEquals(SUBJECT, identity.subject());
        assertEquals(KEY_ID, identity.keyId());
        assertEquals(StoreServiceProof.CATALOG_PERMISSION, identity.permission());
    }

    @Test void rejectsMissingProofAndMissingPinnedAuthority() throws Exception {
        var pair = keyPair();
        assertThrows(ServiceIdentityDenied.class, () -> verifier(pair).verifyCatalogRead(null));
        var denied = new StoreServiceProofVerifier(Map.of(), CLOCK);
        assertThrows(ServiceIdentityDenied.class, () -> denied.verifyCatalogRead(good(pair)));
    }

    @Test void rejectsUntrustedSignerEvenWithSameKeyId() throws Exception {
        var signer = keyPair();
        var trusted = keyPair();
        assertThrows(ServiceIdentityDenied.class, () -> verifier(trusted).verifyCatalogRead(good(signer)));
    }

    @Test void deniesUnknownKeyId() throws Exception {
        var pair = keyPair();
        var proof = sign(pair, "unknown-key-01", SUBJECT, NONCE, NOW - 10, NOW + 70);
        assertThrows(ServiceIdentityDenied.class, () -> verifier(pair).verifyCatalogRead(proof));
    }

    @Test void deniesTamperingWithSignedSubject() throws Exception {
        var pair = keyPair();
        var proof = good(pair);
        var altered = new StoreServiceProof(proof.contract(), proof.keyId(), "service.other.catalog",
                proof.audience(), proof.method(), proof.path(), proof.permission(),
                proof.bodySha256(), proof.issuedAtEpochSec(), proof.expiresAtEpochSec(),
                proof.nonce(), proof.signature());
        assertThrows(ServiceIdentityDenied.class, () -> verifier(pair).verifyCatalogRead(altered));
    }

    @Test void deniesDifferentSubjectEvenIfTrustedSignerSignsIt() throws Exception {
        var pair = keyPair();
        var proof = sign(pair, KEY_ID, "service.other.catalog", NONCE, NOW - 10, NOW + 70);
        assertThrows(ServiceIdentityDenied.class, () -> verifier(pair).verifyCatalogRead(proof));
    }

    @Test void deniesWrongAudienceAndWritePermissionBeforeCryptography() throws Exception {
        var pair = keyPair();
        var proof = good(pair);
        assertThrows(ServiceIdentityDenied.class, () -> new StoreServiceProof(
                proof.contract(), proof.keyId(), proof.subject(), "blackwhi-v2", proof.method(),
                proof.path(), proof.permission(), proof.bodySha256(), proof.issuedAtEpochSec(),
                proof.expiresAtEpochSec(), proof.nonce(), proof.signature()));
        assertThrows(ServiceIdentityDenied.class, () -> new StoreServiceProof(
                proof.contract(), proof.keyId(), proof.subject(), proof.audience(), "POST",
                proof.path(), proof.permission(), proof.bodySha256(), proof.issuedAtEpochSec(),
                proof.expiresAtEpochSec(), proof.nonce(), proof.signature()));
        assertThrows(ServiceIdentityDenied.class, () -> new StoreServiceProof(
                proof.contract(), proof.keyId(), proof.subject(), proof.audience(), proof.method(),
                proof.path(), "fit.registry.release.write", proof.bodySha256(), proof.issuedAtEpochSec(),
                proof.expiresAtEpochSec(), proof.nonce(), proof.signature()));
    }

    @Test void deniesPathBodyHashAndContractTampering() throws Exception {
        var pair = keyPair();
        var proof = good(pair);
        assertThrows(ServiceIdentityDenied.class, () -> new StoreServiceProof(
                proof.contract(), proof.keyId(), proof.subject(), proof.audience(), proof.method(),
                "/fit-registry/v1/catalog/../private", proof.permission(), proof.bodySha256(),
                proof.issuedAtEpochSec(), proof.expiresAtEpochSec(), proof.nonce(), proof.signature()));
        assertThrows(ServiceIdentityDenied.class, () -> new StoreServiceProof(
                proof.contract(), proof.keyId(), proof.subject(), proof.audience(), proof.method(),
                proof.path(), proof.permission(), "0".repeat(64), proof.issuedAtEpochSec(),
                proof.expiresAtEpochSec(), proof.nonce(), proof.signature()));
        assertThrows(ServiceIdentityDenied.class, () -> new StoreServiceProof(
                "blackwhi.store.service-proof.v2", proof.keyId(), proof.subject(), proof.audience(),
                proof.method(), proof.path(), proof.permission(), proof.bodySha256(),
                proof.issuedAtEpochSec(), proof.expiresAtEpochSec(), proof.nonce(), proof.signature()));
    }

    @Test void deniesExpiredFutureAndExcessiveLifetime() throws Exception {
        var pair = keyPair();
        assertThrows(ServiceIdentityDenied.class, () -> verifier(pair).verifyCatalogRead(
                sign(pair, KEY_ID, SUBJECT, NONCE, NOW - 120, NOW - 1)));
        assertThrows(ServiceIdentityDenied.class, () -> verifier(pair).verifyCatalogRead(
                sign(pair, KEY_ID, SUBJECT, NONCE, NOW + 10, NOW + 20)));
        assertThrows(ServiceIdentityDenied.class, () -> sign(pair, KEY_ID, SUBJECT, NONCE, NOW - 10, NOW + 121));
    }

    @Test void deniesReusedNonceEvenIfSignatureIsValid() throws Exception {
        var pair = keyPair();
        var v = verifier(pair);
        v.verifyCatalogRead(good(pair));
        assertThrows(ServiceIdentityDenied.class, () -> v.verifyCatalogRead(good(pair)));
        assertThrows(ServiceIdentityDenied.class, () -> v.verifyCatalogRead(
                sign(pair, KEY_ID, SUBJECT, NONCE, NOW - 5, NOW + 80)));
    }

    @Test void distinctNoncesAllowDistinctSignedRequests() throws Exception {
        var pair = keyPair();
        var v = verifier(pair);
        v.verifyCatalogRead(good(pair));
        assertEquals(SUBJECT, v.verifyCatalogRead(sign(pair, KEY_ID, SUBJECT,
                "wxyzabcdefghijklmnopqr", NOW - 5, NOW + 20)).subject());
    }

    @Test void rejectsMalformedNonceAndNewlineIdentity() throws Exception {
        var pair = keyPair();
        assertThrows(ServiceIdentityDenied.class, () -> sign(pair, KEY_ID, "service\nother",
                NONCE, NOW - 10, NOW + 70));
        assertThrows(ServiceIdentityDenied.class, () -> sign(pair, KEY_ID, SUBJECT,
                "short", NOW - 10, NOW + 70));
    }

    @Test void loadsOnlyPinnedEd25519SpkiAndDeniesBrokenConfig() throws Exception {
        var pair = keyPair();
        String publicSpki = Base64.getEncoder().encodeToString(pair.getPublic().getEncoded());
        assertEquals(SUBJECT, StoreServiceProofVerifier.fromPinnedKey(KEY_ID, publicSpki, CLOCK)
                .verifyCatalogRead(good(pair)).subject());
        assertThrows(ServiceIdentityDenied.class, () -> StoreServiceProofVerifier.fromPinnedKey(
                KEY_ID, "!!!", CLOCK));
        assertThrows(ServiceIdentityDenied.class, () -> StoreServiceProofVerifier.fromPinnedKey(
                KEY_ID, "", CLOCK));
        assertThrows(ServiceIdentityDenied.class, () -> StoreServiceProofVerifier.fromPinnedKey(
                "", publicSpki, CLOCK));
    }

    @Test void deniesNonEd25519AuthorityAndTooManyKeys() throws Exception {
        var wrong = java.security.KeyPairGenerator.getInstance("RSA");
        wrong.initialize(2048);
        var rsa = wrong.generateKeyPair();
        assertThrows(ServiceIdentityDenied.class, () -> new StoreServiceProofVerifier(
                Map.of(KEY_ID, rsa.getPublic()), CLOCK));
    }

    @Test void protectedFacadeFailsBeforeAccessingUnconfiguredRegistry() throws Exception {
        var pair = keyPair();
        var facade = new AuthenticatedFitCatalogFacade(new FitRegistryCatalogService(""),
                new StoreServiceProofVerifier(Map.of(), CLOCK));
        assertThrows(ServiceIdentityDenied.class, () -> facade.listPublicProducts(good(pair)));
    }

    @Test void protectedFacadeUsesExistingReadOnlyClientAfterAuthentication() throws Exception {
        var pair = keyPair();
        var calls = new AtomicInteger();
        try (var mock = new LocalCatalogMock(calls)) {
            var facade = new AuthenticatedFitCatalogFacade(
                    new FitRegistryCatalogService(mock.origin()), verifier(pair));
            assertThrows(ServiceIdentityDenied.class, () -> facade.listPublicProducts(null));
            assertEquals(0, calls.get()); // validation precedes HTTP
            var products = facade.listPublicProducts(good(pair));
            assertEquals(1, products.size());
            assertEquals("org.blackwhi.examples.strength", products.getFirst().productId());
            assertEquals(1, calls.get());
            assertThrows(ServiceIdentityDenied.class, () -> facade.listPublicProducts(good(pair)));
            assertEquals(1, calls.get());
        }
    }

    private static final class LocalCatalogMock implements AutoCloseable {
        private final HttpServer http;
        LocalCatalogMock(AtomicInteger calls) throws Exception {
            http = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            http.createContext("/fit-registry/v1/catalog", exchange -> {
                calls.incrementAndGet();
                var body = ("{\"contract\":\"blackwhi.fit.registry.catalog.v1\",\"readOnly\":true,\"releases\":["
                        + "{\"id\":\"org.blackwhi.examples.strength\",\"version\":\"1.0.0\","
                        + "\"title\":\"Strength\",\"state\":\"published\",\"sha256\":\"" + "a".repeat(64)
                        + "\",\"publishedAt\":\"2026-11-06T12:00:00.000Z\"}]}")
                        .getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                try (var out = exchange.getResponseBody()) { out.write(body); }
            });
            http.start();
        }
        String origin() { return "http://127.0.0.1:" + http.getAddress().getPort(); }
        @Override public void close() { http.stop(0); }
    }
}
