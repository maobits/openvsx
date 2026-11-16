/* BlackWhi Store - FIT Registry legal evidence transport (read-only, local preview).
 * SPDX-License-Identifier: EPL-2.0
 * Fork lineage: Eclipse Open VSX. No license or Trust entitlement is granted here.
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
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import org.eclipse.openvsx.blackwhi.catalog.StoreProduct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Public legal notices for exact published FIT releases. An optional sidecar
 * endpoint, not an alternate catalog nor a substitute for rights review.
 * Fail-closed: only a Registry-authored, SHA-bound, independently reviewed
 * manifest can be projected to the native Store frontend.
 */
@RestController
public final class FitLegalPublicReadApi {
    private static final String ROUTE =
            "/api/blackwhi/fit/v2/products/{packageId}/versions/{version}/legal";
    private static final Pattern ID = Pattern.compile("[a-z][a-z0-9.-]{1,120}");
    private static final Pattern VERSION = Pattern.compile(
            "[0-9]{1,8}\\.[0-9]{1,8}\\.[0-9]{1,8}(?:-[0-9A-Za-z.-]{1,40})?");
    private static final Pattern DOC_KEY = Pattern.compile(
            "(?:application-license|third-party-notices|dependency-license:[a-z][a-z0-9.-]{1,120}@[0-9]{1,8}\\.[0-9]{1,8}\\.[0-9]{1,8})");
    private static final Pattern SHA = Pattern.compile("[a-f0-9]{64}");
    private static final Pattern ORIGIN = Pattern.compile("http://127\\.0\\.0\\.1:([1-9][0-9]{0,4})");
    private static final Set<String> FIELDS = Set.of("contract", "readOnly", "id", "version", "artifactSha256",
            "manifestSha256", "licenseExpression", "businessModel", "distribution", "publisherOrigin",
            "independentlyRightsReviewed", "documents");
    private static final Set<String> SELF_FIELDS = Set.of("contract", "readOnly", "id", "version", "artifactSha256",
            "manifestSha256", "licenseExpression", "businessModel", "distribution", "publisherOrigin",
            "independentlyRightsReviewed", "reviewMode", "documents");
    private static final Set<String> DOC_FIELDS = Set.of("key", "sha256", "bytes");
    private static final Set<String> BUSINESS_MODELS = Set.of("free-open-source", "freeware", "open-core", "commercial",
            "external-saas", "educational");
    private static final Set<String> DISTRIBUTIONS = Set.of("free", "external-terms", "restricted");
    private static final Set<String> ORIGINS = Set.of("official", "third-party");
    private static final int MAX_MANIFEST = 16 * 1024;
    private static final int MAX_DOCUMENT = 32 * 1024;
    private static final int MAX_TOTAL = 48 * 1024;
    private static final Duration TIMEOUT = Duration.ofSeconds(5);
    private static final JsonMapper JSON = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();

    private final FitRegistryCatalogService registry;
    private final String origin;
    private final HttpClient client;

    public FitLegalPublicReadApi(FitRegistryCatalogService registry,
            @Value("${blackwhi.store.fit-registry.origin:}") String origin) {
        this.registry = registry;
        this.origin = checkedOrigin(origin);
        ProxySelector direct = new ProxySelector() {
            @Override public List<Proxy> select(URI uri) { return List.of(Proxy.NO_PROXY); }
            @Override public void connectFailed(URI uri, SocketAddress address, IOException exception) { }
        };
        this.client = HttpClient.newBuilder()
                .proxy(direct)
                .connectTimeout(Duration.ofSeconds(2))
                .followRedirects(HttpClient.Redirect.NEVER)
                .version(HttpClient.Version.HTTP_1_1)
                .build();
    }

    @GetMapping(path = ROUTE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> manifest(@PathVariable String packageId, @PathVariable String version) {
        try {
            Map<String, Object> content = checkedManifest(packageId, version);
            Map<String, Object> publicView = new LinkedHashMap<>(content);
            publicView.put("contract", "blackwhi.store.fit.legal.public.v1");
            publicView.put("source", "blackwhi-fit-registry");
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .header("X-Content-Type-Options", "nosniff")
                    .header("Referrer-Policy", "no-referrer")
                    .contentType(MediaType.APPLICATION_JSON).body(publicView);
        } catch (LegalFailure failure) {
            return error(failure.status, failure.code);
        }
    }

    @GetMapping(path = ROUTE + "/documents/{key}")
    public ResponseEntity<?> document(@PathVariable String packageId, @PathVariable String version,
            @PathVariable String key) {
        if (key == null || !DOC_KEY.matcher(key).matches() || key.contains("..")) {
            return error(HttpStatus.BAD_REQUEST, "FIT_LEGAL_INVALID_DOCUMENT_KEY");
        }
        try {
            var manifest = checkedManifest(packageId, version);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> documents = (List<Map<String, Object>>) manifest.get("documents");
            Map<String, Object> descriptor = documents.stream()
                    .filter(doc -> key.equals(doc.get("key"))).findFirst().orElse(null);
            if (descriptor == null) throw fail(HttpStatus.NOT_FOUND, "FIT_LEGAL_DOCUMENT_NOT_AVAILABLE");
            byte[] raw = fetch("/fit-registry/v1/releases/" + packageId + "/" + version
                    + "/legal/documents/" + key, MAX_DOCUMENT, false);
            if (raw.length != (Integer) descriptor.get("bytes") || !sha(raw).equals(descriptor.get("sha256"))) {
                throw fail(HttpStatus.BAD_GATEWAY, "FIT_LEGAL_DOCUMENT_INTEGRITY");
            }
            try {
                StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                        .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(raw));
            } catch (CharacterCodingException exception) {
                throw fail(HttpStatus.BAD_GATEWAY, "FIT_LEGAL_DOCUMENT_INVALID_UTF8");
            }
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .header("X-Content-Type-Options", "nosniff")
                    .header("Content-Security-Policy", "default-src 'none'; sandbox")
                    .header("Referrer-Policy", "no-referrer")
                    .header("X-BlackWhi-Legal-Document-SHA256", (String) descriptor.get("sha256"))
                    .contentType(MediaType.parseMediaType("text/plain; charset=UTF-8"))
                    .contentLength(raw.length).body(raw);
        } catch (LegalFailure failure) {
            return error(failure.status, failure.code);
        }
    }

    private Map<String, Object> checkedManifest(String packageId, String version) {
        if (!identity(packageId, version)) throw fail(HttpStatus.BAD_REQUEST, "FIT_LEGAL_INVALID_IDENTITY");
        if (origin == null) throw fail(HttpStatus.SERVICE_UNAVAILABLE, "FIT_LEGAL_REGISTRY_DISABLED");
        final StoreProduct release;
        try { release = registry.exactRelease(packageId, version); }
        catch (RuntimeException exception) { throw fail(HttpStatus.SERVICE_UNAVAILABLE, "FIT_LEGAL_REGISTRY_UNAVAILABLE"); }
        if (release == null || (!"published".equals(release.registryRelease().state())
                && !"deprecated".equals(release.registryRelease().state()))) {
            throw fail(HttpStatus.NOT_FOUND, "FIT_LEGAL_RELEASE_NOT_PUBLISHED");
        }
        byte[] raw = fetch("/fit-registry/v1/releases/" + packageId + "/" + version + "/legal",
                MAX_MANIFEST, true);
        final Map<String, Object> body;
        try { body = JSON.readValue(raw, new TypeReference<Map<String, Object>>() {}); }
        catch (RuntimeException exception) { throw fail(HttpStatus.BAD_GATEWAY, "FIT_LEGAL_MANIFEST_INVALID"); }
        boolean reviewed = body != null && (
                (FIELDS.equals(body.keySet()) && Boolean.TRUE.equals(body.get("independentlyRightsReviewed"))) ||
                (SELF_FIELDS.equals(body.keySet()) && Boolean.FALSE.equals(body.get("independentlyRightsReviewed"))
                        && "single-maintainer".equals(body.get("reviewMode"))));
        if (!reviewed ||
                !"blackwhi.fit.registry.legal.public.v1".equals(body.get("contract")) ||
                !Boolean.TRUE.equals(body.get("readOnly")) ||
                !packageId.equals(body.get("id")) || !version.equals(body.get("version")) ||
                !release.registryRelease().sha256().equals(body.get("artifactSha256")) ||
                !(body.get("manifestSha256") instanceof String digest) || !SHA.matcher(digest).matches() ||
                !(body.get("licenseExpression") instanceof String license) || license.length() < 2 ||
                license.length() > 128 || !license.matches("[A-Za-z0-9.+()\\- ]{2,128}") ||
                !BUSINESS_MODELS.contains(body.get("businessModel")) ||
                !DISTRIBUTIONS.contains(body.get("distribution")) || !ORIGINS.contains(body.get("publisherOrigin")) ||
                !(body.get("documents") instanceof List<?> documents) ||
                documents.size() < 2 || documents.size() > 32) {
            throw fail(HttpStatus.BAD_GATEWAY, "FIT_LEGAL_MANIFEST_INVALID");
        }
        List<List<Object>> canonicalDocs = new ArrayList<>();
        boolean hasLicense = false, hasNotices = false;
        int total = 0;
        String previous = "";
        for (Object element : documents) {
            if (!(element instanceof Map<?, ?> document) || !DOC_FIELDS.equals(document.keySet()) ||
                    !(document.get("key") instanceof String key) || !DOC_KEY.matcher(key).matches() ||
                    key.contains("..") || key.compareTo(previous) <= 0 ||
                    !(document.get("sha256") instanceof String sha) || !SHA.matcher(sha).matches() ||
                    !(document.get("bytes") instanceof Integer size) || size < 1 || size > MAX_DOCUMENT) {
                throw fail(HttpStatus.BAD_GATEWAY, "FIT_LEGAL_MANIFEST_INVALID");
            }
            total += size;
            if (total > MAX_TOTAL) throw fail(HttpStatus.BAD_GATEWAY, "FIT_LEGAL_MANIFEST_INVALID");
            hasLicense |= key.equals("application-license");
            hasNotices |= key.equals("third-party-notices");
            previous = key;
            canonicalDocs.add(List.of(key, sha, size));
        }
        if (!hasLicense || !hasNotices) throw fail(HttpStatus.BAD_GATEWAY, "FIT_LEGAL_MANIFEST_INVALID");
        try {
            String canonical = "BLACKWHI-FIT-LEGAL-V1\n" + JSON.writeValueAsString(List.of(
                    packageId, version, body.get("artifactSha256"), license,
                    body.get("businessModel"), body.get("distribution"), body.get("publisherOrigin"), canonicalDocs));
            if (!sha(canonical.getBytes(StandardCharsets.UTF_8)).equals(digest)) {
                throw fail(HttpStatus.BAD_GATEWAY, "FIT_LEGAL_MANIFEST_DIGEST_MISMATCH");
            }
        } catch (LegalFailure exception) { throw exception; }
        catch (RuntimeException exception) { throw fail(HttpStatus.BAD_GATEWAY, "FIT_LEGAL_MANIFEST_INVALID"); }
        return body;
    }

    private byte[] fetch(String path, int limit, boolean allow404) {
        final HttpRequest request = HttpRequest.newBuilder(URI.create(origin + path))
                .GET().timeout(TIMEOUT)
                .header("Accept", "application/json, text/plain")
                .header("Accept-Encoding", "identity").build();
        try {
            HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream stream = response.body()) {
                if (allow404 && response.statusCode() == 404) {
                    throw fail(HttpStatus.NOT_FOUND, "FIT_LEGAL_NOT_AVAILABLE");
                }
                if (response.statusCode() != 200 || response.headers().allValues("content-encoding")
                        .stream().anyMatch(v -> !"identity".equalsIgnoreCase(v))) {
                    throw fail(HttpStatus.BAD_GATEWAY, "FIT_LEGAL_REGISTRY_RESPONSE_INVALID");
                }
                String type = response.headers().firstValue("content-type").orElse("").toLowerCase(java.util.Locale.ROOT);
                if (allow404 ? !(type.equals("application/json") || type.startsWith("application/json;"))
                        : !(type.equals("text/plain") || type.startsWith("text/plain;"))) {
                    throw fail(HttpStatus.BAD_GATEWAY, "FIT_LEGAL_REGISTRY_RESPONSE_INVALID");
                }
                byte[] result = stream.readNBytes(limit + 1);
                if (result.length < 1 || result.length > limit) {
                    throw fail(HttpStatus.BAD_GATEWAY, "FIT_LEGAL_REGISTRY_RESPONSE_INVALID");
                }
                return result;
            }
        } catch (LegalFailure exception) { throw exception; }
        catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw fail(HttpStatus.SERVICE_UNAVAILABLE, "FIT_LEGAL_REGISTRY_UNAVAILABLE");
        } catch (IOException | RuntimeException exception) {
            throw fail(HttpStatus.SERVICE_UNAVAILABLE, "FIT_LEGAL_REGISTRY_UNAVAILABLE");
        }
    }

    private static boolean identity(String id, String version) {
        return id != null && ID.matcher(id).matches() && !id.contains("..") &&
                version != null && VERSION.matcher(version).matches();
    }
    private static String checkedOrigin(String origin) {
        if (origin == null || origin.isBlank()) return null;
        var match = ORIGIN.matcher(origin);
        if (!match.matches() || Integer.parseInt(match.group(1)) > 65535) {
            throw new IllegalArgumentException("FIT_LEGAL_REGISTRY_ORIGIN_DENIED");
        }
        return origin;
    }
    private static String sha(byte[] raw) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw)); }
        catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }
    private static LegalFailure fail(HttpStatus status, String code) { return new LegalFailure(status, code); }
    private static ResponseEntity<?> error(HttpStatus status, String code) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .header("Referrer-Policy", "no-referrer")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("contract", "blackwhi.store.fit.legal.error.v1", "code", code));
    }
    private static final class LegalFailure extends RuntimeException {
        private final HttpStatus status;
        private final String code;
        LegalFailure(HttpStatus status, String code) { super(code); this.status = status; this.code = code; }
    }
}
