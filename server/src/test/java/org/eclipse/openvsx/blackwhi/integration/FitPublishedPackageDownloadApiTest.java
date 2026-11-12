/* BlackWhi Store FIT package download tests. SPDX-License-Identifier: EPL-2.0 */
package org.eclipse.openvsx.blackwhi.integration;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.junit.jupiter.api.Assertions.*;

class FitPublishedPackageDownloadApiTest {
    private static final String ID = "com.blackwhi.std.validation.core";
    private static final String VERSION = "0.1.0";
    private static final byte[] ARCHIVE = "synthetic FIT package bytes".getBytes(StandardCharsets.UTF_8);

    private static String digest(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (Exception exception) { throw new AssertionError(exception); }
    }

    private static String release(String sha, String state) {
        return "{\"contract\":\"blackwhi.fit.registry.catalog.v1\",\"readOnly\":true,\"release\":{"
                + "\"id\":\"" + ID + "\",\"version\":\"" + VERSION + "\","
                + "\"title\":\"Validation Core\",\"state\":\"" + state + "\","
                + "\"sha256\":\"" + sha + "\",\"publishedAt\":\"2026-11-12T01:52:22.870Z\"}}";
    }

    @Test void publishedArtifactIsDownloadedByExactReleaseAndShaChecked() throws Exception {
        var paths = new AtomicReference<String>();
        try (Server remote = new Server(exchange -> {
            if (exchange.getRequestURI().getPath().contains("/releases/")) {
                respond(exchange, 200, "application/json", release(digest(ARCHIVE), "published").getBytes(StandardCharsets.UTF_8));
            } else {
                paths.set(exchange.getRequestURI().getPath());
                assertNull(exchange.getRequestHeaders().getFirst("Authorization"));
                respond(exchange, 200, "application/octet-stream", ARCHIVE);
            }
        })) {
            var api = new FitPublishedPackageDownloadApi(new FitRegistryCatalogService(remote.origin()), remote.origin());
            var response = api.download(ID, VERSION);
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertArrayEquals(ARCHIVE, (byte[]) response.getBody());
            assertEquals(digest(ARCHIVE), response.getHeaders().getFirst("X-BlackWhi-Artifact-SHA256"));
            assertTrue(response.getHeaders().getFirst("Content-Disposition").contains(".fitpkg"));
            assertEquals("/fit-registry/v1/packages/" + ID + "/" + VERSION, paths.get());
        }
    }

    @Test void tamperedArtifactIsNeverDelivered() throws Exception {
        try (Server remote = new Server(exchange -> {
            if (exchange.getRequestURI().getPath().contains("/releases/")) {
                respond(exchange, 200, "application/json", release("a".repeat(64), "published").getBytes(StandardCharsets.UTF_8));
            } else {
                respond(exchange, 200, "application/octet-stream", ARCHIVE);
            }
        })) {
            var response = new FitPublishedPackageDownloadApi(new FitRegistryCatalogService(remote.origin()),
                    remote.origin()).download(ID, VERSION);
            assertEquals(HttpStatus.BAD_GATEWAY, response.getStatusCode());
            assertFalse(response.getBody() instanceof byte[]);
        }
    }

    @Test void redirectsAndOversizeArtifactsFailClosed() throws Exception {
        for (int mode = 0; mode < 2; mode++) {
            final int testMode = mode;
            try (Server remote = new Server(exchange -> {
                if (exchange.getRequestURI().getPath().contains("/releases/")) {
                    respond(exchange, 200, "application/json", release(digest(ARCHIVE), "published").getBytes(StandardCharsets.UTF_8));
                } else if (testMode == 0) {
                    exchange.getResponseHeaders().add("Location", "http://127.0.0.1:1/other");
                    respond(exchange, 302, "application/octet-stream", new byte[0]);
                } else {
                    respond(exchange, 200, "application/octet-stream", new byte[2 * 1024 * 1024 + 1]);
                }
            })) {
                var response = new FitPublishedPackageDownloadApi(new FitRegistryCatalogService(remote.origin()),
                        remote.origin()).download(ID, VERSION);
                assertEquals(HttpStatus.BAD_GATEWAY, response.getStatusCode());
            }
        }
    }

    @Test void disabledOriginAndInvalidIdentityRejectWithoutDownloading() {
        var api = new FitPublishedPackageDownloadApi(new FitRegistryCatalogService(""), "");
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, api.download(ID, VERSION).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, api.download("../bad", VERSION).getStatusCode());
        assertThrows(IllegalArgumentException.class,
                () -> new FitPublishedPackageDownloadApi(new FitRegistryCatalogService(""), "http://evil.example"));
    }

    @Test void unpublishedReleaseIsNotDownloadable() throws Exception {
        try (Server remote = new Server(exchange -> respond(exchange, 404, "application/json", "{}".getBytes(StandardCharsets.UTF_8)))) {
            var response = new FitPublishedPackageDownloadApi(new FitRegistryCatalogService(remote.origin()),
                    remote.origin()).download(ID, VERSION);
            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        }
    }

    private static void respond(HttpExchange exchange, int status, String type, byte[] bytes) {
        try {
            exchange.getResponseHeaders().add("Content-Type", type);
            if (status == 302) { exchange.sendResponseHeaders(status, -1); }
            else {
                exchange.sendResponseHeaders(status, bytes.length);
                try (var out = exchange.getResponseBody()) { out.write(bytes); }
            }
        } catch (IOException ignored) { /* bounded clients may cancel */ }
        finally { exchange.close(); }
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
