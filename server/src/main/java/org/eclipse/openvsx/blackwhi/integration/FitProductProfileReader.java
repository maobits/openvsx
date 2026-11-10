/*
 * BlackWhi Store - STORE-02: bounded local presentation-profile reader.
 * SPDX-License-Identifier: EPL-2.0
 * This reader does NOT grant release trust, publisher verification or install permission.
 */
package org.eclipse.openvsx.blackwhi.integration;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import org.eclipse.openvsx.blackwhi.catalog.StoreProduct;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reads profiles imported by a trusted local operator after FIT-01 validation.
 * Both profile and referenced files must remain present, bounded, regular and
 * digest-correct. A valid sidecar is *editorial information*, not a signature.
 */
public final class FitProductProfileReader {
    private static final int MAX_PROFILE_BYTES = 256 * 1024;
    private static final int MAX_ASSET_BYTES = 2 * 1024 * 1024;
    private static final int MAX_DOCUMENT_BYTES = 512 * 1024;
    private static final int MAX_TOTAL_ASSET_BYTES = 10 * 1024 * 1024;
    private static final Pattern ID = Pattern.compile("^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$");
    private static final Pattern VERSION = Pattern.compile("^[0-9]{1,8}\\.[0-9]{1,8}\\.[0-9]{1,8}(?:-[0-9A-Za-z.-]{1,40})?$");
    private static final Pattern ASSET = Pattern.compile("^(docs|assets)/[A-Za-z0-9._/-]{1,208}$");
    private static final Pattern SHA = Pattern.compile("^[a-f0-9]{64}$");
    private static final Set<String> SECTIONS = Set.of("release", "identity", "overview", "categories", "tags",
            "packageSize", "documentation", "apiReference", "examples", "dependencies", "compatibility",
            "security", "versions", "distribution", "media", "links", "community", "support", "business");
    private static final JsonMapper JSON = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();

    private final Path root;

    public FitProductProfileReader(String rootDirectory) {
        if (rootDirectory == null || rootDirectory.isBlank()) {
            root = null; // Explicitly disabled unless an operator configures an external data root.
        } else {
            Path candidate = Path.of(rootDirectory);
            if (!candidate.isAbsolute()) throw invalid();
            root = candidate.normalize();
        }
    }

    public boolean enabled() { return root != null; }

    public Map<String, Object> readProfile(StoreProduct release) {
        if (root == null) return null;
        Path base = baseDirectory(release);
        Path profilePath = base.resolve("profile.json");
        if (!Files.exists(profilePath, LinkOption.NOFOLLOW_LINKS)) return null;
        try {
            byte[] raw = safeRead(profilePath, MAX_PROFILE_BYTES);
            Map<String, Object> profile = JSON.readValue(raw, new TypeReference<Map<String, Object>>() {});
            validate(profile, release, base);
            return profile;
        } catch (Exception exception) {
            throw invalid();
        }
    }

    /** Returns only a digest-verified asset already referenced in this release's profile. */
    public byte[] readAsset(StoreProduct release, String assetPath) {
        Map<String, Object> profile = readProfile(release);
        if (profile == null || !safeAssetPath(assetPath)) throw missing();
        Map<String, Map<String, Object>> assets = assetMap(profile);
        Map<String, Object> declared = assets.get(assetPath);
        if (declared == null) throw missing();
        try {
            return checkedAsset(baseDirectory(release), declared);
        } catch (RuntimeException exception) {
            throw invalid();
        }
    }

    private Path baseDirectory(StoreProduct release) {
        String id = release.productId();
        String version = release.registryRelease().version();
        if (!ID.matcher(id).matches() || !VERSION.matcher(version).matches()) throw invalid();
        Path base = root.resolve(id).resolve(version).normalize();
        if (!base.startsWith(root)) throw invalid();
        return base;
    }

    private static void validate(Map<String, Object> profile, StoreProduct product, Path base) {
        if (profile == null || !profile.keySet().containsAll(SECTIONS) || !profile.keySet().contains("contract"))
            throw invalid();
        boolean v2 = "blackwhi.fit.product.profile.v2".equals(profile.get("contract"));
        if (v2) {
            if (profile.size() != SECTIONS.size() + 2 || !profile.containsKey("editorial")) throw invalid();
            validateV2Editorial(profile);
        } else if (profile.size() != SECTIONS.size() + 1 ||
                !"blackwhi.fit.product.profile.v1".equals(profile.get("contract"))) {
            throw invalid();
        }
        Map<String, Object> release = object(profile.get("release"));
        if (!product.productId().equals(release.get("packageId"))
                || !product.registryRelease().version().equals(release.get("version"))
                || !product.registryRelease().sha256().equals(release.get("artifactSha256"))) throw invalid();
        Map<String, Object> identity = object(profile.get("identity"));
        if (!product.productId().startsWith(String.valueOf(identity.get("publisherNamespace")) + ".")
                || !"fit-application".equals(identity.get("productType"))
                || !(identity.get("displayName") instanceof String displayName) || displayName.isBlank()) throw invalid();
        if (!"blackwhi-registry".equals(object(profile.get("security")).get("authority"))
                || !"blackwhi-registry".equals(object(profile.get("distribution")).get("channel"))) throw invalid();
        validateLinkList(profile.get("links"));
        validateLinkList(object(profile.get("support")).get("contactLinks"));
        validateLinkList(object(profile.get("business")).get("externalServices"));
        validateLinkList(object(profile.get("media")).get("videos"));
        Map<String, Map<String, Object>> assets = assetMap(profile);
        if (assets.isEmpty()) throw invalid();
        long total = 0;
        for (Map<String, Object> descriptor : assets.values()) {
            total += checkedAsset(base, descriptor).length;
            if (total > MAX_TOTAL_ASSET_BYTES) throw invalid();
        }
        Map<String, Object> sizes = object(profile.get("packageSize"));
        long docSize = assets.entrySet().stream().filter(e -> e.getKey().startsWith("docs/"))
                .mapToLong(e -> numeric(e.getValue().get("bytes"))).sum();
        long mediaSize = total - docSize;
        if (numeric(sizes.get("documentationBytes")) != docSize
                || numeric(sizes.get("mediaBytes")) != mediaSize
                || numeric(sizes.get("contentFootprintBytes")) != numeric(sizes.get("downloadBytes")) + total)
            throw invalid();
    }

    /** V2 is *approved-only* at runtime. Drafts never enter the public API. */
    private static void validateV2Editorial(Map<String, Object> profile) {
        Map<String, Object> editorial = object(profile.get("editorial"));
        if (!Set.of("state", "fieldStatus", "rightsReview").equals(editorial.keySet())
                || !"approved".equals(editorial.get("state"))) throw invalid();
        Map<String, Object> status = object(editorial.get("fieldStatus"));
        if (!Set.of("publisher", "links", "support", "license", "icon").equals(status.keySet()))
            throw invalid();
        for (Object value : status.values()) {
            if (!Set.of("provided", "not-provided", "not-applicable").contains(value))
                throw invalid();
        }
        Map<String, Object> review = object(editorial.get("rightsReview"));
        if (!Set.of("reviewer", "reviewedDate", "publisherAuthorized", "licenseTextReviewed",
                "redistributionRightsConfirmed").equals(review.keySet())
                || !(review.get("reviewer") instanceof String name) || name.length() < 2
                || !(review.get("reviewedDate") instanceof String date)
                || !date.matches("\\d{4}-\\d{2}-\\d{2}")
                || !Boolean.TRUE.equals(review.get("publisherAuthorized"))
                || !Boolean.TRUE.equals(review.get("licenseTextReviewed"))
                || !Boolean.TRUE.equals(review.get("redistributionRightsConfirmed"))) throw invalid();
        Map<String, Object> identity = object(profile.get("identity"));
        Map<String, Object> support = object(profile.get("support"));
        Map<String, Object> business = object(profile.get("business"));
        Map<String, Object> docs = object(profile.get("documentation"));
        Map<String, Object> media = object(profile.get("media"));
        if (!(identity.get("publisherName") instanceof String publisher) || publisher.isBlank()
                || !"provided".equals(status.get("publisher"))
                || !(business.get("model") instanceof String) || !(business.get("distribution") instanceof String)
                || !(business.get("licenseExpression") instanceof String license) || license.isBlank()
                || license.toLowerCase().matches(".*(unknown|pending|unspecified|tbd|test-only).*")
                || !"provided".equals(status.get("license"))
                || business.get("licenseDocument") == null || docs.get("licenseText") == null
                || !business.get("licenseDocument").equals(docs.get("licenseText"))) throw invalid();
        if (!Set.of("free-open-source", "freeware", "open-core", "commercial", "external-saas", "educational")
                .contains(business.get("model")) || !Set.of("free", "external-terms", "restricted")
                .contains(business.get("distribution"))) throw invalid();
        if (!(profile.get("links") instanceof List<?> links)) throw invalid();
        if (!statusMatches(status.get("links"), !links.isEmpty())
                || !statusMatches(status.get("icon"), media.get("icon") != null)
                || !statusMatches(status.get("support"), !"none".equals(support.get("model"))))
            throw invalid();
        if (!Set.of("none", "community", "self-service", "professional", "organization")
                .contains(support.get("model")) ||
                ("none".equals(support.get("model")) &&
                    (!(support.get("contactLinks") instanceof List<?> contacts) || !contacts.isEmpty())))
            throw invalid();
    }

    private static boolean statusMatches(Object status, boolean supplied) {
        return "provided".equals(status) ? supplied
                : ("not-provided".equals(status) || "not-applicable".equals(status)) ? !supplied
                : true; // Pending review never establishes truth or privileges.
    }

    private static void validateLinkList(Object value) {
        if (!(value instanceof List<?> list) || list.size() > 40) throw invalid();
        for (Object raw : list) {
            Map<String, Object> link = object(raw);
            if (!Set.of("kind", "label", "url").equals(link.keySet())
                    || !(link.get("label") instanceof String label) || label.length() < 2 || label.length() > 100
                    || !(link.get("url") instanceof String url) || url.length() > 2048 || url.contains("\\")
                    || url.chars().anyMatch(Character::isWhitespace)) throw invalid();
            try {
                URI parsed = URI.create(url);
                String host = parsed.getHost();
                if (!"https".equals(parsed.getScheme()) || host == null || !host.contains(".")
                        || host.equals("localhost") || host.endsWith(".local")
                        || host.matches("[0-9.]+") || parsed.getUserInfo() != null
                        || (parsed.getPort() != -1 && parsed.getPort() != 443)) throw invalid();
            } catch (IllegalArgumentException exception) { throw invalid(); }
        }
    }

    private static Map<String, Map<String, Object>> assetMap(Map<String, Object> profile) {
        Map<String, Map<String, Object>> assets = new HashMap<>();
        Map<String, Object> documentation = object(profile.get("documentation"));
        for (String field : List.of("readme", "quickStart", "changelog", "licenseText", "apiGuide")) {
            if (documentation.get(field) != null) addAsset(assets, documentation.get(field), "docs/");
        }
        addAsset(assets, object(profile.get("versions")).get("releaseNotes"), "docs/");
        Map<String, Object> media = object(profile.get("media"));
        for (String field : List.of("icon", "cover")) {
            if (media.get(field) != null) addAsset(assets, media.get(field), "assets/");
        }
        for (String field : List.of("screenshots", "diagrams")) {
            Object values = media.get(field);
            if (!(values instanceof List<?> list) || list.size() > 12) throw invalid();
            for (Object item : list) addAsset(assets, item, "assets/");
        }
        addAsset(assets, object(profile.get("business")).get("licenseDocument"), "docs/");
        return assets;
    }

    private static void addAsset(Map<String, Map<String, Object>> output, Object value, String kind) {
        Map<String, Object> entry = object(value);
        if (!(entry.get("path") instanceof String path) || !safeAssetPath(path)
                || !path.startsWith(kind) || !(entry.get("sha256") instanceof String sha)
                || !SHA.matcher(sha).matches()) throw invalid();
        Map<String, Object> previous = output.putIfAbsent(path, entry);
        if (previous != null && !previous.equals(entry)) throw invalid();
    }

    private static boolean safeAssetPath(String path) {
        if (path == null || !ASSET.matcher(path).matches()) return false;
        for (String segment : path.split("/")) if (segment.isBlank() || segment.equals(".") || segment.equals("..")) return false;
        return path.startsWith("docs/")
                ? path.endsWith(".md") || path.endsWith(".txt")
                : path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".webp");
    }

    private static byte[] checkedAsset(Path base, Map<String, Object> descriptor) {
        String path = (String) descriptor.get("path");
        long size = numeric(descriptor.get("bytes"));
        boolean document = path.startsWith("docs/");
        if (size < 1 || size > (document ? MAX_DOCUMENT_BYTES : MAX_ASSET_BYTES)) throw invalid();
        Path resolved = base.resolve(path).normalize();
        if (!resolved.startsWith(base)) throw invalid();
        byte[] content = safeRead(resolved, (int) size);
        if (content.length != size || !sha256(content).equals(descriptor.get("sha256"))) throw invalid();
        return content;
    }

    private static byte[] safeRead(Path path, int maximum) {
        try {
            Path current = path.toAbsolutePath();
            // Refuse symlinks at every level, not just the leaf.
            Path walk = current.getRoot();
            for (Path segment : current) {
                walk = walk.resolve(segment);
                if (Files.isSymbolicLink(walk)) throw invalid();
            }
            if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)
                    || Files.size(path) > maximum) throw invalid();
            byte[] bytes = Files.readAllBytes(path);
            if (bytes.length > maximum) throw invalid();
            return bytes;
        } catch (IOException exception) { throw invalid(); }
    }

    private static String sha256(byte[] data) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(data);
            return java.util.HexFormat.of().formatHex(bytes);
        } catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> object(Object value) {
        if (!(value instanceof Map<?, ?> map)) throw invalid();
        for (Object key : map.keySet()) if (!(key instanceof String)) throw invalid();
        return (Map<String, Object>) map;
    }

    private static long numeric(Object value) {
        if (!(value instanceof Number number) || !(value instanceof Integer || value instanceof Long)) throw invalid();
        long result = number.longValue();
        if (result < 0) throw invalid();
        return result;
    }

    public static ProfileReadException invalid() { return new ProfileReadException("FIT_PROFILE_INVALID"); }
    public static ProfileReadException missing() { return new ProfileReadException("FIT_PROFILE_ASSET_NOT_FOUND"); }
    public static final class ProfileReadException extends RuntimeException {
        public ProfileReadException(String code) { super(code); }
    }
}
