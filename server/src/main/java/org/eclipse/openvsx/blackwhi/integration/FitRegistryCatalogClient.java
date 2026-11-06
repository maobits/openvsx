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

    /** Returns only public catalog projections, never a permission or a trust grant. */
    public List<StoreProduct> listProducts() {
        if (catalogUri == null) {
            throw failure("BLACKWHI_STORE_REGISTRY_DISABLED");
        }
        var request = HttpRequest.newBuilder(catalogUri)
                .timeout(timeout)
                .header("Accept", "application/json")
                .header("Accept-Encoding", "identity")
                .GET().build();
        CompletableFuture<HttpResponse<byte[]>> pending = null;
        try {
            pending = client.sendAsync(request, info -> new LimitedSubscriber(MAX_BODY));
            var response = pending.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (response.statusCode() != 200) {
                throw failure("BLACKWHI_STORE_REGISTRY_UNAVAILABLE");
            }
            if (!jsonContentType(response) || !identityContentEncoding(response)) {
                throw failure("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE");
            }
            // Exact v1 shape is enforced in RegistryCatalogProjection.
            Map<String, Object> body = STRICT_JSON.readValue(
                    response.body(), new TypeReference<Map<String, Object>>() { });
            return RegistryCatalogProjection.project(body);
        } catch (StoreRegistryException ex) {
            throw ex;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw failure("BLACKWHI_STORE_REGISTRY_UNAVAILABLE");
        } catch (TimeoutException | ExecutionException ex) {
            if (pending != null) pending.cancel(true);
            throw failure("BLACKWHI_STORE_REGISTRY_UNAVAILABLE");
        } catch (Exception ex) {
            // No response bodies, URLs, secrets or exception messages in outward errors.
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
