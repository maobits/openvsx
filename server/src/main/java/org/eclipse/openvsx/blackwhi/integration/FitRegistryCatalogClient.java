/*
 * BlackWhi Store - STORE-01.3, FIT Registry read-only transport.
 * SPDX-License-Identifier: EPL-2.0
 * Fork provenance: https://github.com/eclipse-openvsx/openvsx
 */
package org.eclipse.openvsx.blackwhi.integration;

import java.io.ByteArrayOutputStream;
import java.net.Proxy;
import java.net.ProxySelector;
import java.net.SocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.ArrayList;
import java.util.Set;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Pattern;

import org.eclipse.openvsx.blackwhi.catalog.RegistryCatalogProjection;
import org.eclipse.openvsx.blackwhi.catalog.StoreProduct;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Local preview only. This class never downloads FIT artifacts, follows redirects,
 * sends credentials, grants trust, persists releases, or executes FIT. A loopback
 * connection is NOT service authentication and cannot be exposed as production IAM.
 */
public final class FitRegistryCatalogClient {
    private static final Pattern ORIGIN = Pattern.compile("^http://127\\.0\\.0\\.1:([1-9][0-9]{0,4})$");
    private static final int MAX_BODY = 65_536;
    private static final String CATALOG_PATH = "/fit-registry/v1/catalog";
    private static final String PAGE_PATH = "/fit-registry/v1/catalog/page";
    private static final String EXACT_PATH = "/fit-registry/v1/releases/";
    private static final Pattern PACKAGE_ID = Pattern.compile("^[a-z][a-z0-9.-]{1,120}$");
    private static final Pattern VERSION = Pattern.compile("^[0-9]{1,8}\\.[0-9]{1,8}\\.[0-9]{1,8}(?:-[0-9A-Za-z.-]{1,40})?$");
    private static final Pattern CURSOR = Pattern.compile("^[A-Za-z0-9_-]{10,512}$");
    private static final Set<String> PAGE_FIELDS = Set.of("contract", "readOnly", "limit", "returnedCount", "hasMore", "nextCursor", "releases");
    private static final Set<String> EXACT_FIELDS = Set.of("contract", "readOnly", "release");
    private static final Set<String> RELEASE_FIELDS = Set.of("id", "version", "title", "state", "sha256", "publishedAt");
    private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(5);
    private static final JsonMapper STRICT_JSON = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .build();

    private final URI catalogUri;
    private final HttpClient client;
    private final Duration timeout;

    public FitRegistryCatalogClient(String origin) {
        this(origin, DEFAULT_TIMEOUT);
    }

    // Package-private test seam; no network/test client injected into production.
    FitRegistryCatalogClient(String origin, Duration timeout) {
        if (timeout == null || timeout.isNegative() || timeout.isZero()
                || timeout.compareTo(DEFAULT_TIMEOUT) > 0) {
            throw failure("BLACKWHI_STORE_REGISTRY_CONFIGURATION_INVALID");
        }
        this.timeout = timeout;
        if (origin == null || origin.isEmpty()) {
            this.catalogUri = null; // Disabled by default; no implicit remote connection.
        } else {
            var match = ORIGIN.matcher(origin);
            if (!match.matches()) {
                throw failure("BLACKWHI_STORE_REGISTRY_ORIGIN_DENIED");
            }
            int port;
            try {
                port = Integer.parseInt(match.group(1));
            } catch (NumberFormatException ex) {
                throw failure("BLACKWHI_STORE_REGISTRY_ORIGIN_DENIED");
            }
            if (port > 65_535) {
                throw failure("BLACKWHI_STORE_REGISTRY_ORIGIN_DENIED");
            }
            this.catalogUri = URI.create(origin + CATALOG_PATH);
        }
        // Ignore global proxy configuration even if the process inherited proxy env.
        ProxySelector direct = new ProxySelector() {
            @Override public List<Proxy> select(URI uri) { return List.of(Proxy.NO_PROXY); }
            @Override public void connectFailed(URI uri, SocketAddress sa, java.io.IOException e) { }
        };
        this.client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(2))
                .followRedirects(HttpClient.Redirect.NEVER)
                .proxy(direct)
                .version(HttpClient.Version.HTTP_1_1)
                .build();
    }

    /** Legacy endpoint remains intact for existing clients and fixtures. */
    public List<StoreProduct> listProducts() {
        var catalog = readObject(catalogUri, false);
        try {
            return RegistryCatalogProjection.project(catalog);
        } catch (IllegalArgumentException exception) {
            // Projection rejects malformed or unpublished Registry data. Do not
            // disclose upstream content, implementation details or exception causes.
            throw failure("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE");
        }
    }

    public record CatalogPage(int limit, int returnedCount, boolean hasMore,
                              String nextCursor, List<StoreProduct> products) { }

    /** One bounded page, not an accumulated in-memory catalog. */
    public CatalogPage listProductsPage(int limit, String cursor) {
        if (limit < 1 || limit > 50 || (cursor != null && !CURSOR.matcher(cursor).matches())) {
            throw failure("BLACKWHI_STORE_PAGE_ARGUMENT_INVALID");
        }
        URI origin = requireOrigin();
        URI target = URI.create(origin.toString().replace(CATALOG_PATH,
            PAGE_PATH + "?limit=" + limit + (cursor == null ? "" : "&cursor=" + cursor)));
        var body = readObject(target, false);
        if (!PAGE_FIELDS.equals(body.keySet()) ||
            !"blackwhi.fit.registry.catalog.page.v1".equals(body.get("contract")) ||
            !Boolean.TRUE.equals(body.get("readOnly")) ||
            !(body.get("limit") instanceof Integer responseLimit) || responseLimit != limit ||
            !(body.get("returnedCount") instanceof Integer count) || count < 0 || count > limit ||
            !(body.get("hasMore") instanceof Boolean hasMore) ||
            !(body.get("releases") instanceof List<?> releases) || releases.size() != count) {
            throw failure("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE");
        }
        Object next = body.get("nextCursor");
        if (hasMore != (next instanceof String) ||
            (hasMore && (count == 0 || !CURSOR.matcher((String) next).matches()))) {
            throw failure("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE");
        }
        var result = new ArrayList<StoreProduct>();
        for (Object release : releases) result.add(projectOne(release));
        // Cursors may repeat with malformed upstreams; caller/UI safeguards repeated pages.
        return new CatalogPage(limit, count, hasMore, hasMore ? (String) next : null, List.copyOf(result));
    }

    /** Resolve an exact published release independently of any catalog window. */
    public StoreProduct exactRelease(String packageId, String version) {
        if (packageId == null || !PACKAGE_ID.matcher(packageId).matches() || packageId.contains("..") ||
            version == null || !VERSION.matcher(version).matches()) {
            return null;
        }
        URI origin = requireOrigin();
        URI target = URI.create(origin.toString().replace(CATALOG_PATH, EXACT_PATH + packageId + "/" + version));
        Map<String, Object> body;
        try {
            body = readObject(target, true);
        } catch (StoreRegistryException exception) {
            if ("BLACKWHI_STORE_RELEASE_NOT_FOUND".equals(exception.getMessage())) return null;
            throw exception;
        }
        if (!EXACT_FIELDS.equals(body.keySet()) ||
            !"blackwhi.fit.registry.catalog.v1".equals(body.get("contract")) ||
            !Boolean.TRUE.equals(body.get("readOnly"))) {
            throw failure("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE");
        }
        StoreProduct product = projectOne(body.get("release"));
        if (!packageId.equals(product.productId()) || !version.equals(product.registryRelease().version())) {
            throw failure("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE");
        }
        return product;
    }

    private static StoreProduct projectOne(Object item) {
        if (!(item instanceof Map<?, ?> release) || !RELEASE_FIELDS.equals(release.keySet())) {
            throw failure("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE");
        }
        try {
            return RegistryCatalogProjection.project(Map.of(
                "contract", "blackwhi.fit.registry.catalog.v1", "readOnly", true,
                "releases", List.of(release))).getFirst();
        } catch (RuntimeException exception) {
            throw failure("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE");
        }
    }

    private URI requireOrigin() {
        if (catalogUri == null) throw failure("BLACKWHI_STORE_REGISTRY_DISABLED");
        return catalogUri;
    }

    private Map<String, Object> readObject(URI target, boolean allow404) {
        if (target == null) throw failure("BLACKWHI_STORE_REGISTRY_DISABLED");
        var request = HttpRequest.newBuilder(target)
                .timeout(timeout)
                .header("Accept", "application/json")
                .header("Accept-Encoding", "identity")
                .GET().build();
        CompletableFuture<HttpResponse<byte[]>> pending = null;
        try {
            pending = client.sendAsync(request, info -> new LimitedSubscriber(MAX_BODY));
            var response = pending.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (allow404 && response.statusCode() == 404) {
                throw failure("BLACKWHI_STORE_RELEASE_NOT_FOUND");
            }
            if (response.statusCode() != 200) throw failure("BLACKWHI_STORE_REGISTRY_UNAVAILABLE");
            if (!jsonContentType(response) || !identityContentEncoding(response)) {
                throw failure("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE");
            }
            return STRICT_JSON.readValue(response.body(), new TypeReference<Map<String, Object>>() { });
        } catch (StoreRegistryException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw failure("BLACKWHI_STORE_REGISTRY_UNAVAILABLE");
        } catch (TimeoutException | ExecutionException exception) {
            if (pending != null) pending.cancel(true);
            throw failure("BLACKWHI_STORE_REGISTRY_UNAVAILABLE");
        } catch (Exception exception) {
            throw failure("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE");
        }
    }

    private static boolean jsonContentType(HttpResponse<?> response) {
        var values = response.headers().allValues("content-type");
        if (values.size() != 1) return false;
        var contentType = values.get(0).toLowerCase(java.util.Locale.ROOT).trim();
        return "application/json".equals(contentType)
                || "application/json; charset=utf-8".equals(contentType)
                || "application/json;charset=utf-8".equals(contentType);
    }

    private static boolean identityContentEncoding(HttpResponse<?> response) {
        var values = response.headers().allValues("content-encoding");
        return values.isEmpty() || (values.size() == 1 && "identity".equalsIgnoreCase(values.get(0)));
    }

    private static StoreRegistryException failure(String code) {
        return new StoreRegistryException(code);
    }

    /** Stable redacted errors; never wrap a remote exception or include response text. */
    public static final class StoreRegistryException extends RuntimeException {
        public StoreRegistryException(String code) { super(code); }
    }

    /** Bounded subscriber: limit applies during streaming, not after allocating body. */
    private static final class LimitedSubscriber implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private final ByteArrayOutputStream output = new ByteArrayOutputStream();
        private final int maximum;
        private Flow.Subscription subscription;
        private int size;

        LimitedSubscriber(int maximum) { this.maximum = maximum; }

        @Override public CompletionStage<byte[]> getBody() { return result; }

        @Override public void onSubscribe(Flow.Subscription subscription) {
            this.subscription = subscription;
            subscription.request(1);
        }

        @Override public void onNext(List<ByteBuffer> buffers) {
            if (result.isDone()) return;
            for (ByteBuffer chunk : buffers) {
                int count = chunk.remaining();
                if (count > maximum - size) {
                    subscription.cancel();
                    result.completeExceptionally(failure("BLACKWHI_STORE_REGISTRY_BODY_TOO_LARGE"));
                    return;
                }
                size += count;
                var data = new byte[count];
                chunk.get(data);
                output.write(data, 0, count);
            }
            subscription.request(1);
        }

        @Override public void onError(Throwable error) {
            result.completeExceptionally(failure("BLACKWHI_STORE_REGISTRY_UNAVAILABLE"));
        }

        @Override public void onComplete() { result.complete(output.toByteArray()); }
    }
}
