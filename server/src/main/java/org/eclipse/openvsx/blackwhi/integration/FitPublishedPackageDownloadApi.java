/*
 * BlackWhi Store - FIT published artifact download through native Spring BFF.
 * SPDX-License-Identifier: EPL-2.0
 * Store preview only: local loopback Registry, no implicit trust bootstrap.
 */
package org.eclipse.openvsx.blackwhi.integration;

import java.io.IOException;
import java.io.InputStream;
import java.net.Proxy;
import java.net.ProxySelector;
import java.net.SocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Map;
import java.util.regex.Pattern;

import org.eclipse.openvsx.blackwhi.catalog.StoreProduct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only download for exact PUBLIC Registry releases, regardless of whether
 * an editorial profile has been approved. A downloaded ZIP is not an install,
 * execution permission, Ed25519 trust grant, or editorial endorsement.
 *
 * No user-controlled upstream URL, redirects, proxies, credentials, cache or
 * unbounded response streaming. Exact SHA-256 is checked against the same
 * public Registry release served by the native Store detail API.
 */
@RestController
public final class FitPublishedPackageDownloadApi {
    private static final String ROUTE =
            "/api/blackwhi/fit/v2/products/{packageId}/versions/{version}/download";
    private static final Pattern ID = Pattern.compile("[a-z][a-z0-9.-]{1,120}");
    private static final Pattern VERSION = Pattern.compile(
            "[0-9]{1,8}\\.[0-9]{1,8}\\.[0-9]{1,8}(?:-[0-9A-Za-z.-]{1,40})?");
    private static final Pattern SHA256 = Pattern.compile("[a-f0-9]{64}");
    private static final Pattern ORIGIN = Pattern.compile("http://127\\.0\\.0\\.1:([1-9][0-9]{0,4})");
    // Registry currently refuses archive payloads above 2 MiB.
    private static final int MAX_ARCHIVE = 2 * 1024 * 1024;
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(10);
    private final FitRegistryCatalogService registry;
    private final HttpClient client;
    private final String origin;

    public FitPublishedPackageDownloadApi(FitRegistryCatalogService registry,
            @Value("${blackwhi.store.fit-registry.origin:}") String origin) {
        this.registry = registry;
        this.origin = checkedOrigin(origin);
        ProxySelector direct = new ProxySelector() {
            @Override public java.util.List<Proxy> select(URI uri) { return java.util.List.of(Proxy.NO_PROXY); }
            @Override public void connectFailed(URI uri, SocketAddress address, IOException error) { }
        };
        this.client = HttpClient.newBuilder()
                .proxy(direct)
                .connectTimeout(Duration.ofSeconds(2))
                .followRedirects(HttpClient.Redirect.NEVER)
                .version(HttpClient.Version.HTTP_1_1)
                .build();
    }

    @GetMapping(path = ROUTE)
    public ResponseEntity<?> download(@PathVariable String packageId, @PathVariable String version) {
        if (!validId(packageId, version)) return failure(HttpStatus.BAD_REQUEST, "FIT_DOWNLOAD_INVALID_IDENTITY");
        if (origin == null) return failure(HttpStatus.SERVICE_UNAVAILABLE, "FIT_DOWNLOAD_REGISTRY_DISABLED");
        final StoreProduct product;
        try { product = registry.exactRelease(packageId, version); }
        catch (RuntimeException exception) {
            return failure(HttpStatus.SERVICE_UNAVAILABLE, "FIT_DOWNLOAD_REGISTRY_UNAVAILABLE");
        }
        if (product == null) return failure(HttpStatus.NOT_FOUND, "FIT_DOWNLOAD_NOT_PUBLISHED");
        final var release = product.registryRelease();
        if (!"published".equals(release.state()) && !"deprecated".equals(release.state())) {
            return failure(HttpStatus.NOT_FOUND, "FIT_DOWNLOAD_NOT_PUBLISHED");
        }
        String digest = release.sha256();
        if (digest == null || !SHA256.matcher(digest).matches()) {
            return failure(HttpStatus.BAD_GATEWAY, "FIT_DOWNLOAD_INVALID_RELEASE_DIGEST");
        }
        try {
            byte[] archive = getArtifact(packageId, version, digest);
            return ResponseEntity.ok()
                    .cacheControl(CacheControl.noStore())
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + packageId + "-" + version + ".fitpkg\"")
                    .header("X-Content-Type-Options", "nosniff")
                    .header("Referrer-Policy", "no-referrer")
                    .header("X-BlackWhi-Artifact-SHA256", digest)
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .contentLength(archive.length)
                    .body(archive);
        } catch (DownloadFailure exception) {
            return failure(HttpStatus.BAD_GATEWAY, exception.code);
        }
    }

    private byte[] getArtifact(String packageId, String version, String digest) {
        URI uri = URI.create(origin + "/fit-registry/v1/packages/" + packageId + "/" + version);
        var request = HttpRequest.newBuilder(uri)
                .timeout(REQUEST_TIMEOUT)
                .header("Accept", "application/octet-stream")
                .header("Accept-Encoding", "identity")
                .GET().build();
        try {
            var response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream stream = response.body()) {
                if (response.statusCode() != 200 ||
                        response.headers().firstValue("content-type").stream()
                                .noneMatch(s -> "application/octet-stream".equalsIgnoreCase(s.trim())) ||
                        response.headers().allValues("content-encoding").stream()
                                .anyMatch(s -> !"identity".equalsIgnoreCase(s))) {
                    throw new DownloadFailure("FIT_DOWNLOAD_UPSTREAM_REJECTED");
                }
                // Do not allocate an arbitrarily large response, including on chunked transfer.
                byte[] bytes = stream.readNBytes(MAX_ARCHIVE + 1);
                if (bytes.length == 0 || bytes.length > MAX_ARCHIVE) {
                    throw new DownloadFailure("FIT_DOWNLOAD_SIZE_INVALID");
                }
                String actual = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
                if (!MessageDigest.isEqual(actual.getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                        digest.getBytes(java.nio.charset.StandardCharsets.US_ASCII))) {
                    throw new DownloadFailure("FIT_DOWNLOAD_DIGEST_MISMATCH");
                }
                return bytes;
            }
        } catch (DownloadFailure exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new DownloadFailure("FIT_DOWNLOAD_REGISTRY_UNAVAILABLE");
        } catch (IOException | NoSuchAlgorithmException | RuntimeException exception) {
            throw new DownloadFailure("FIT_DOWNLOAD_REGISTRY_UNAVAILABLE");
        }
    }

    private static String checkedOrigin(String value) {
        if (value == null || value.isBlank()) return null;
        var match = ORIGIN.matcher(value);
        if (!match.matches()) throw new IllegalArgumentException("FIT_DOWNLOAD_REGISTRY_ORIGIN_DENIED");
        int port = Integer.parseInt(match.group(1));
        if (port < 1 || port > 65535) throw new IllegalArgumentException("FIT_DOWNLOAD_REGISTRY_ORIGIN_DENIED");
        return value;
    }

    private static boolean validId(String id, String version) {
        return id != null && ID.matcher(id).matches() && !id.contains("..")
                && version != null && VERSION.matcher(version).matches();
    }

    private static ResponseEntity<Map<String, String>> failure(HttpStatus status, String code) {
        return ResponseEntity.status(status)
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("contract", "blackwhi.store.fit.download.error.v1", "code", code));
    }

    private static final class DownloadFailure extends RuntimeException {
        private final String code;
        DownloadFailure(String code) { super(code); this.code = code; }
    }
}
