/* STORE-04.2: strict paginated and exact Registry reads, loopback-only. SPDX-License-Identifier: EPL-2.0 */
package org.eclipse.openvsx.blackwhi.integration;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class FitRegistryPagingIntegrationTest {
    private static final String RELEASE = """
      {"id":"org.maobits.example","version":"1.0.0","title":"Example",
       "state":"published","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
       "publishedAt":"2026-11-09T20:00:00Z"}
      """;
    private static final String CURSOR = "aGVsbG9fY3Vyc29y";
    private static final String PAGE = """
      {"contract":"blackwhi.fit.registry.catalog.page.v1","readOnly":true,
       "limit":25,"returnedCount":1,"hasMore":true,"nextCursor":"aGVsbG9fY3Vyc29y",
       "releases":[%s]}
      """.formatted(RELEASE);
    private static final String EXACT = """
      {"contract":"blackwhi.fit.registry.catalog.v1","readOnly":true,"release":%s}
      """.formatted(RELEASE);

    @Test void nextPageProjectsPublishedDataWithoutCredentials() throws Exception {
        try (Server server = new Server(200, PAGE)) {
            var page = new FitRegistryCatalogClient(server.origin()).listProductsPage(25, null);
            assertEquals(1, page.products().size());
            assertEquals(CURSOR, page.nextCursor());
            assertTrue(page.hasMore());
            assertEquals("/fit-registry/v1/catalog/page", server.lastPath);
            assertEquals("limit=25", server.lastQuery);
            assertNull(server.lastAuthorization);
        }
    }

    @Test void exactPublishedReleaseDoesNotDependOnCatalogWindow() throws Exception {
        try (Server server = new Server(200, EXACT)) {
            var product = new FitRegistryCatalogClient(server.origin()).exactRelease("org.maobits.example", "1.0.0");
            assertEquals("org.maobits.example", product.productId());
            assertEquals("/fit-registry/v1/releases/org.maobits.example/1.0.0", server.lastPath);
        }
    }

    @Test void missingExactReleaseIsNotFabricated() throws Exception {
        try (Server server = new Server(404, "{}")) {
            assertNull(new FitRegistryCatalogClient(server.origin()).exactRelease("org.maobits.example", "1.0.0"));
        }
    }

    @Test void rejectsUnpublishedDataAndMalformedPage() throws Exception {
        try (Server server = new Server(200, PAGE.replace("\"published\"", "\"submitted\""))) {
            var client = new FitRegistryCatalogClient(server.origin());
            assertThrows(FitRegistryCatalogClient.StoreRegistryException.class,
                () -> client.listProductsPage(25, null));
        }
    }

    @Test void springPageDoesNotClaimGlobalCount() {
        var service = mock(FitRegistryCatalogService.class);
        when(service.page(25, null)).thenReturn(new FitRegistryCatalogClient.CatalogPage(
            25, 0, false, null, java.util.List.of()));
        var response = new FitCatalogReadApi(service).page("25", null);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("cursor-page", response.getBody().get("coverage"));
        assertEquals(false, response.getBody().get("hasMore"));
        assertEquals(null, response.getBody().get("nextCursor"));
        assertFalse(response.getBody().containsKey("totalCount"));
        assertEquals(HttpStatus.BAD_REQUEST, new FitCatalogReadApi(service).page("500", null).getStatusCode());
    }

    @Test void exactV2DetailWorksWhileLegacyV1WindowStillReturnsNotFound() {
        var service = mock(FitRegistryCatalogService.class);
        var ref = new org.eclipse.openvsx.blackwhi.catalog.RegistryReleaseRef(
            "blackwhi.fit.registry.catalog.v1", "org.maobits.example", "0.8.0", "a".repeat(64),
            "published", "2025-01-01T00:00:00Z");
        var item = new org.eclipse.openvsx.blackwhi.catalog.StoreProduct(
            "blackwhi.store.catalog.product.v1", "org.maobits.example", "fit-package",
            "Example", "org.maobits", ref);
        when(service.exactRelease("org.maobits.example", "0.8.0")).thenReturn(item);
        when(service.listPublicProducts()).thenReturn(java.util.List.of());
        var api = new FitProductDetailReadApi(service, "");
        assertEquals(HttpStatus.NOT_FOUND, api.detail("org.maobits.example", "0.8.0").getStatusCode());
        var exact = api.exactDetail("org.maobits.example", "0.8.0");
        assertEquals(HttpStatus.OK, exact.getStatusCode());
        assertEquals("blackwhi.store.fit.product.detail.v2", exact.getBody().get("contract"));
        assertEquals("exact-release", exact.getBody().get("coverage"));
        assertEquals("not-provided", exact.getBody().get("profileStatus"));
        verify(service).exactRelease("org.maobits.example", "0.8.0");
    }

    private static final class Server implements AutoCloseable {
        final HttpServer http;
        volatile String lastPath, lastQuery, lastAuthorization;
        Server(int status, String body) throws Exception {
            http = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            http.createContext("/", exchange -> {
                lastPath = exchange.getRequestURI().getPath();
                lastQuery = exchange.getRequestURI().getQuery();
                lastAuthorization = exchange.getRequestHeaders().getFirst("Authorization");
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, bytes.length);
                try (var stream = exchange.getResponseBody()) { stream.write(bytes); }
            });
            http.start();
        }
        String origin() { return "http://127.0.0.1:" + http.getAddress().getPort(); }
        @Override public void close() { http.stop(0); }
    }
}
