/*
 * BlackWhi Store - STORE-01.3 tests.
 * SPDX-License-Identifier: EPL-2.0
 */
package org.eclipse.openvsx.blackwhi.integration;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class FitRegistryCatalogClientTest {
    private static final String RELEASE = """
        {"id":"org.blackwhi.examples.strength","version":"1.0.0","title":"Strength Calculator",
         "state":"published","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
         "publishedAt":"2026-11-06T12:00:00.000Z"}
        """.replaceAll("\\s+", " ");
    private static final String VALID = "{" +
            "\"contract\":\"blackwhi.fit.registry.catalog.v1\",\"readOnly\":true,\"releases\":[" + RELEASE + "]}";

    @Test void validHttpCatalogIsProjectedWithNoInstallOrTrustGrant() throws Exception {
        try (MockRegistry server = new MockRegistry(exchange -> reply(exchange, 200, "application/json", VALID))) {
            var products = new FitRegistryCatalogClient(server.origin()).listProducts();
            assertEquals(1, products.size());
            assertEquals("org.blackwhi.examples.strength", products.getFirst().productId());
            assertEquals("fit-package", products.getFirst().artifactType());
            assertEquals("published", products.getFirst().registryRelease().state());
            assertEquals("GET", server.method().get());
            assertEquals("/fit-registry/v1/catalog", server.path().get());
            assertEquals("application/json", server.accept().get());
            assertNull(server.authorization().get());
        }
    }

    @Test void disabledByDefault() {
        assertCode("BLACKWHI_STORE_REGISTRY_DISABLED", () -> new FitRegistryCatalogClient("").listProducts());
    }

    @Test void foreignDestinationsAndUrlSmugglingAreDeniedBeforeNetwork() {
        for (String bad : new String[] {
                "https://127.0.0.1:43181", "http://localhost:43181", "http://[::1]:43181",
                "http://10.0.0.2:43181", "http://127.0.0.1:43181/health",
                "http://127.0.0.1:43181/?x=1", "http://127.0.0.1:43181#x",
                "http://user:pass@127.0.0.1:43181", "http://127.0.0.1:65536",
                "http://127.0.0.1:0", "http://127.0.0.1:043181", "http://127.0.0.1:43181 ",
                "http://127.0.0.1:43181\\@evil.example", "file:///etc/passwd"
        }) {
            assertCode("BLACKWHI_STORE_REGISTRY_ORIGIN_DENIED", () -> new FitRegistryCatalogClient(bad));
        }
    }

    @Test void refusesRedirectEvenToSameHost() throws Exception {
        try (MockRegistry server = new MockRegistry(exchange -> {
            exchange.getResponseHeaders().add("Location", "http://127.0.0.1:1/fit-registry/v1/catalog");
            reply(exchange, 302, "application/json", "{}");
        })) {
            assertCode("BLACKWHI_STORE_REGISTRY_UNAVAILABLE", () -> new FitRegistryCatalogClient(server.origin()).listProducts());
        }
    }

    @Test void rejectsNon200WithoutDisclosingResponse() throws Exception {
        try (MockRegistry server = new MockRegistry(exchange -> reply(exchange, 503, "application/json", "private database error"))) {
            assertCode("BLACKWHI_STORE_REGISTRY_UNAVAILABLE", () -> new FitRegistryCatalogClient(server.origin()).listProducts());
        }
    }

    @Test void rejectsWrongContentType() throws Exception {
        try (MockRegistry server = new MockRegistry(exchange -> reply(exchange, 200, "text/html", VALID))) {
            assertCode("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE", () -> new FitRegistryCatalogClient(server.origin()).listProducts());
        }
    }

    @Test void rejectsEncodedResponse() throws Exception {
        try (MockRegistry server = new MockRegistry(exchange -> {
            exchange.getResponseHeaders().add("Content-Encoding", "gzip");
            reply(exchange, 200, "application/json", VALID);
        })) {
            assertCode("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE", () -> new FitRegistryCatalogClient(server.origin()).listProducts());
        }
    }

    @Test void rejectsStreamingBodyLargerThan64KiB() throws Exception {
        var body = "X".repeat(70_000);
        try (MockRegistry server = new MockRegistry(exchange -> reply(exchange, 200, "application/json", body))) {
            assertCode("BLACKWHI_STORE_REGISTRY_UNAVAILABLE", () -> new FitRegistryCatalogClient(server.origin()).listProducts());
        }
    }

    @Test void rejectsMalformedJson() throws Exception {
        try (MockRegistry server = new MockRegistry(exchange -> reply(exchange, 200, "application/json", "{"))) {
            assertCode("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE", () -> new FitRegistryCatalogClient(server.origin()).listProducts());
        }
    }

    @Test void rejectsDuplicateJsonFields() throws Exception {
        var duplicate = "{\"contract\":\"blackwhi.fit.registry.catalog.v1\",\"readOnly\":true,"
                + "\"readOnly\":false,\"releases\":[]}";
        try (MockRegistry server = new MockRegistry(exchange -> reply(exchange, 200, "application/json", duplicate))) {
            assertCode("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE", () -> new FitRegistryCatalogClient(server.origin()).listProducts());
        }
    }

    @Test void rejectsTrailingJsonPayload() throws Exception {
        try (MockRegistry server = new MockRegistry(exchange -> reply(exchange, 200, "application/json", VALID + "{}"))) {
            assertCode("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE", () -> new FitRegistryCatalogClient(server.origin()).listProducts());
        }
    }

    @Test void rejectsUnexpectedPrivateField() throws Exception {
        var poisoned = VALID.replace("\"readOnly\":true,", "\"readOnly\":true,\"authorization\":\"token\",");
        try (MockRegistry server = new MockRegistry(exchange -> reply(exchange, 200, "application/json", poisoned))) {
            assertCode("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE", () -> new FitRegistryCatalogClient(server.origin()).listProducts());
        }
    }

    @Test void rejectsMissingContractAndNotPublished() throws Exception {
        var poisoned = VALID.replace("\"published\"", "\"submitted\"");
        try (MockRegistry server = new MockRegistry(exchange -> reply(exchange, 200, "application/json", poisoned))) {
            assertCode("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE", () -> new FitRegistryCatalogClient(server.origin()).listProducts());
        }
    }

    @Test void requestTimeoutAlsoBoundsBodyStreaming() throws Exception {
        try (MockRegistry server = new MockRegistry(exchange -> {
            try { Thread.sleep(650); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            reply(exchange, 200, "application/json", VALID);
        })) {
            var client = new FitRegistryCatalogClient(server.origin(), Duration.ofMillis(120));
            assertCode("BLACKWHI_STORE_REGISTRY_UNAVAILABLE", client::listProducts);
        }
    }

    @Test void springServiceUsesSameReadOnlyClient() throws Exception {
        try (MockRegistry server = new MockRegistry(exchange -> reply(exchange, 200, "application/json", VALID))) {
            var service = new FitRegistryCatalogService(server.origin());
            assertEquals(1, service.listPublicProducts().size());
        }
    }

    private static void assertCode(String expected, Runnable action) {
        var ex = assertThrows(FitRegistryCatalogClient.StoreRegistryException.class, action::run);
        assertEquals(expected, ex.getMessage());
        assertNull(ex.getCause());
    }

    private static void reply(HttpExchange exchange, int status, String type, String text) {
        try {
            var bytes = text.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", type);
            exchange.sendResponseHeaders(status, bytes.length);
            try (var output = exchange.getResponseBody()) { output.write(bytes); }
        } catch (IOException ignored) { /* Client may have cancelled a timed-out request. */ }
    }

    private static final class MockRegistry implements AutoCloseable {
        private final HttpServer http;
        private final AtomicReference<String> method = new AtomicReference<>();
        private final AtomicReference<String> path = new AtomicReference<>();
        private final AtomicReference<String> accept = new AtomicReference<>();
        private final AtomicReference<String> authorization = new AtomicReference<>();

        MockRegistry(Consumer<HttpExchange> responder) throws IOException {
            http = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            http.createContext("/", exchange -> {
                method.set(exchange.getRequestMethod());
                path.set(exchange.getRequestURI().getPath());
                accept.set(exchange.getRequestHeaders().getFirst("Accept"));
                authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
                responder.accept(exchange);
            });
            http.start();
        }
        String origin() { return "http://127.0.0.1:" + http.getAddress().getPort(); }
        AtomicReference<String> method() { return method; }
        AtomicReference<String> path() { return path; }
        AtomicReference<String> accept() { return accept; }
        AtomicReference<String> authorization() { return authorization; }
        @Override public void close() { http.stop(0); }
    }
}
