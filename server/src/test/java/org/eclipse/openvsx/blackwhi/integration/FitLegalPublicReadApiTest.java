/* BlackWhi Store FIT Registry legal public bridge contract tests.
 * SPDX-License-Identifier: EPL-2.0
 */
package org.eclipse.openvsx.blackwhi.integration;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import static org.junit.jupiter.api.Assertions.*;

class FitLegalPublicReadApiTest {
    private static final String ID = "org.maobits.my-first-training-app";
    private static final String VERSION = "1.0.1";
    private static final String ARTIFACT = "b1da61dc5c43ce604e9163be05e80e8bfcbca57590df9ab1360a44bb22236890";
    private static final byte[] LICENSE = "MIT License\nCopyright 2026\n".getBytes(StandardCharsets.UTF_8);
    private static final byte[] NOTICES = "org.blackwhi.math: MIT\n".getBytes(StandardCharsets.UTF_8);

    static String sha(byte[] raw) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw)); }
        catch (Exception e) { throw new AssertionError(e); }
    }
    static String release(String digest) {
        return "{\"contract\":\"blackwhi.fit.registry.catalog.v1\",\"readOnly\":true,\"release\":{"
                + "\"id\":\"" + ID + "\",\"version\":\"" + VERSION + "\","
                + "\"title\":\"Training App\",\"state\":\"published\","
                + "\"sha256\":\"" + digest + "\",\"publishedAt\":\"2026-11-15T12:00:00Z\"}}";
    }
    static String manifest(String artifact, boolean reviewed, String licenseSha) {
        String lSha = licenseSha;
        String nSha = sha(NOTICES);
        String docs = "[{\"key\":\"application-license\",\"sha256\":\"" + lSha + "\",\"bytes\":"
                + LICENSE.length + "},{\"key\":\"third-party-notices\",\"sha256\":\"" + nSha
                + "\",\"bytes\":" + NOTICES.length + "}]";
        String canonical = "BLACKWHI-FIT-LEGAL-V1\n[\"" + ID + "\",\"" + VERSION + "\",\""
                + artifact + "\",\"MIT\",\"free-open-source\",\"free\",\"third-party\",[[\"application-license\",\""
                + lSha + "\"," + LICENSE.length + "],[\"third-party-notices\",\"" + nSha + "\"," + NOTICES.length + "]]]";
        String digest = sha(canonical.getBytes(StandardCharsets.UTF_8));
        return "{\"contract\":\"blackwhi.fit.registry.legal.public.v1\",\"readOnly\":true,"
                + "\"id\":\"" + ID + "\",\"version\":\"" + VERSION + "\",\"artifactSha256\":\""
                + artifact + "\",\"manifestSha256\":\"" + digest + "\",\"licenseExpression\":\"MIT\","
                + "\"businessModel\":\"free-open-source\",\"distribution\":\"free\",\"publisherOrigin\":\"third-party\","
                + "\"independentlyRightsReviewed\":" + reviewed + ",\"documents\":" + docs + "}";
    }
    static void respond(HttpExchange exchange, int status, String contentType, byte[] body) {
        try {
            if (contentType != null) exchange.getResponseHeaders().add("Content-Type", contentType);
            if (status == 302 || status == 404) {
                exchange.sendResponseHeaders(status, -1);
            } else {
                exchange.sendResponseHeaders(status, body.length);
                try (var output = exchange.getResponseBody()) { output.write(body); }
            }
        } catch (IOException ignored) { /* client deliberately refuses invalid responses */ }
        finally { exchange.close(); }
    }
    static void respondString(HttpExchange exchange, int status, String contentType, String value) {
        respond(exchange, status, contentType, value.getBytes(StandardCharsets.UTF_8));
    }
    static Consumer<HttpExchange> fake(String artifact, boolean reviewed, boolean tamperText) {
        return exchange -> {
            String path = exchange.getRequestURI().getPath();
            assertNull(exchange.getRequestHeaders().getFirst("Authorization"));
            if (path.endsWith("/legal/documents/application-license")) {
                respond(exchange, 200, "text/plain; charset=utf-8",
                        tamperText ? "tampered".getBytes(StandardCharsets.UTF_8) : LICENSE);
            } else if (path.endsWith("/legal/documents/third-party-notices")) {
                respond(exchange, 200, "text/plain; charset=utf-8", NOTICES);
            } else if (path.endsWith("/legal")) {
                respondString(exchange, 200, "application/json", manifest(artifact, reviewed, sha(LICENSE)));
            } else if (path.contains("/releases/")) {
                respondString(exchange, 200, "application/json", release(ARTIFACT));
            } else {
                respondString(exchange, 404, "application/json", "{}");
            }
        };
    }
    @Test void exposesReviewedManifestAndHashVerifiedLicense() throws Exception {
        try (Server remote = new Server(fake(ARTIFACT, true, false))) {
            var api = new FitLegalPublicReadApi(new FitRegistryCatalogService(remote.origin()), remote.origin());
            var receipt = api.manifest(ID, VERSION);
            assertEquals(HttpStatus.OK, receipt.getStatusCode());
            assertTrue(String.valueOf(receipt.getBody()).contains("blackwhi.store.fit.legal.public.v1"));
            var text = api.document(ID, VERSION, "application-license");
            assertEquals(HttpStatus.OK, text.getStatusCode());
            assertArrayEquals(LICENSE, (byte[]) text.getBody());
            assertEquals(sha(LICENSE), text.getHeaders().getFirst("X-BlackWhi-Legal-Document-SHA256"));
            assertEquals("no-store", text.getHeaders().getCacheControl());
        }
    }
    @Test void digestMismatchNeverDisclosesDocument() throws Exception {
        try (Server remote = new Server(fake(ARTIFACT, true, true))) {
            var api = new FitLegalPublicReadApi(new FitRegistryCatalogService(remote.origin()), remote.origin());
            assertEquals(HttpStatus.BAD_GATEWAY, api.document(ID, VERSION, "application-license").getStatusCode());
        }
    }
    @Test void unpublishedLegalStatusNeverEscapes() throws Exception {
        try (Server remote = new Server(fake(ARTIFACT, false, false))) {
            var api = new FitLegalPublicReadApi(new FitRegistryCatalogService(remote.origin()), remote.origin());
            assertEquals(HttpStatus.BAD_GATEWAY, api.manifest(ID, VERSION).getStatusCode());
        }
    }
    @Test void manifestMustBeBoundToExactArtifact() throws Exception {
        try (Server remote = new Server(fake("a".repeat(64), true, false))) {
            var api = new FitLegalPublicReadApi(new FitRegistryCatalogService(remote.origin()), remote.origin());
            assertEquals(HttpStatus.BAD_GATEWAY, api.manifest(ID, VERSION).getStatusCode());
        }
    }
    @Test void missingLegalSidecarsReturnNotFoundWithoutInventingLicenses() throws Exception {
        try (Server remote = new Server(exchange -> {
            if (exchange.getRequestURI().getPath().endsWith("/legal"))
                respondString(exchange, 404, "application/json", "{}");
            else respondString(exchange, 200, "application/json", release(ARTIFACT));
        })) {
            var api = new FitLegalPublicReadApi(new FitRegistryCatalogService(remote.origin()), remote.origin());
            assertEquals(HttpStatus.NOT_FOUND, api.manifest(ID, VERSION).getStatusCode());
        }
    }
    @Test void disabledOriginAndInvalidInputsFailClosed() {
        var api = new FitLegalPublicReadApi(new FitRegistryCatalogService(""), "");
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, api.manifest(ID, VERSION).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, api.manifest("../etc", VERSION).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, api.document(ID, VERSION, "../../etc/passwd").getStatusCode());
        assertThrows(IllegalArgumentException.class,
                () -> new FitLegalPublicReadApi(new FitRegistryCatalogService(""), "http://evil.example"));
    }
    @Test void redirectsAndOversizedManifestFailClosed() throws Exception {
        for (int n = 0; n < 2; n++) {
            int mode = n;
            try (Server remote = new Server(exchange -> {
                if (exchange.getRequestURI().getPath().endsWith("/legal")) {
                    if (mode == 0) {
                        exchange.getResponseHeaders().add("Location", "http://127.0.0.1:1/other");
                        respond(exchange, 302, "application/json", new byte[0]);
                    } else respond(exchange, 200, "application/json", new byte[20_000]);
                } else respondString(exchange, 200, "application/json", release(ARTIFACT));
            })) {
                var api = new FitLegalPublicReadApi(new FitRegistryCatalogService(remote.origin()), remote.origin());
                assertEquals(HttpStatus.BAD_GATEWAY, api.manifest(ID, VERSION).getStatusCode());
            }
        }
    }
    @Test void acceptsExplicitSelfReviewWithoutClaimingIndependence() throws Exception {
        try (Server remote = new Server(exchange -> {
            String path = exchange.getRequestURI().getPath();
            if (path.endsWith("/legal")) {
                String body = manifest(ARTIFACT, false, sha(LICENSE)).replace(
                        "\"independentlyRightsReviewed\":false,",
                        "\"independentlyRightsReviewed\":false,\"reviewMode\":\"single-maintainer\",");
                respondString(exchange, 200, "application/json", body);
            } else if (path.endsWith("/legal/documents/application-license")) {
                respond(exchange, 200, "text/plain", LICENSE);
            } else if (path.endsWith("/legal/documents/third-party-notices")) {
                respond(exchange, 200, "text/plain", NOTICES);
            } else respondString(exchange, 200, "application/json", release(ARTIFACT));
        })) {
            var api = new FitLegalPublicReadApi(new FitRegistryCatalogService(remote.origin()), remote.origin());
            var result = api.manifest(ID, VERSION);
            assertEquals(HttpStatus.OK, result.getStatusCode());
            assertTrue(String.valueOf(result.getBody()).contains("single-maintainer"));
            assertTrue(String.valueOf(result.getBody()).contains("independentlyRightsReviewed=false"));
        }
    }
    @Test void deniesFalseIndependenceWithoutExplicitSelfReviewKind() throws Exception {
        try (Server remote = new Server(fake(ARTIFACT, false, false))) {
            var api = new FitLegalPublicReadApi(new FitRegistryCatalogService(remote.origin()), remote.origin());
            assertEquals(HttpStatus.BAD_GATEWAY, api.manifest(ID, VERSION).getStatusCode());
        }
    }
    private static final class Server implements AutoCloseable {
        private final HttpServer http;
        Server(Consumer<HttpExchange> action) throws IOException {
            http = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            http.createContext("/", action::accept);
            http.start();
        }
        String origin() { return "http://127.0.0.1:" + http.getAddress().getPort(); }
        @Override public void close() { http.stop(0); }
    }
}
