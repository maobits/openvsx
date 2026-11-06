/*
 * BlackWhi Store native FIT product model.
 * SPDX-License-Identifier: EPL-2.0
 * Derived fork: https://github.com/eclipse-openvsx/openvsx
 */
package org.eclipse.openvsx.blackwhi.catalog;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Pure, offline projection of the existing NestJS public catalog wire response.
 *
 * No network, file-system access, database write, trust assertion, downloader, or
 * FIT execution. The HTTP client adapter (STORE-01.3) must authenticate and
 * validate its own transport before handing the parsed object to this mapper.
 */
public final class RegistryCatalogProjection {
    private static final Set<String> TOP_FIELDS = Set.of("contract", "readOnly", "releases");
    private static final Set<String> RELEASE_FIELDS = Set.of(
            "id", "version", "title", "state", "sha256", "publishedAt");

    private RegistryCatalogProjection() { }

    public static List<StoreProduct> project(Map<String, ?> catalog) {
        if (catalog == null || !TOP_FIELDS.equals(catalog.keySet())
                || !RegistryReleaseRef.CONTRACT.equals(catalog.get("contract"))
                || !Boolean.TRUE.equals(catalog.get("readOnly"))
                || !(catalog.get("releases") instanceof List<?> releases)
                || releases.size() > 50) {
            throw RegistryReleaseRef.invalid();
        }

        // Products have stable package IDs. The public catalog can include
        // several releases; a product projects the highest SemVer precedence.
        var selected = new TreeMap<String, StoreProduct>();
        for (Object item : releases) {
            if (!(item instanceof Map<?, ?> fields)
                    || !RELEASE_FIELDS.equals(fields.keySet())) {
                throw RegistryReleaseRef.invalid();
            }
            String id = text(fields, "id");
            String title = text(fields, "title");
            var release = new RegistryReleaseRef(
                    RegistryReleaseRef.CONTRACT,
                    id,
                    text(fields, "version"),
                    text(fields, "sha256"),
                    text(fields, "state"),
                    text(fields, "publishedAt"));
            int separator = id.lastIndexOf('.');
            // A display grouping, NOT an authenticated publisher namespace.
            String namespace = separator <= 0 ? id : id.substring(0, separator);
            var product = new StoreProduct(
                    StoreProduct.CONTRACT, id, StoreProduct.ARTIFACT_TYPE,
                    title, namespace, release);

            var current = selected.putIfAbsent(id, product);
            if (current != null) {
                int result = compareVersions(current.registryRelease().version(), release.version());
                if (result == 0) {
                    // Duplicate or ambiguous release identity: fail closed.
                    throw RegistryReleaseRef.invalid();
                }
                if (result < 0) {
                    selected.put(id, product);
                }
            }
        }
        return List.copyOf(new ArrayList<>(selected.values()));
    }

    private static String text(Map<?, ?> map, String name) {
        Object value = map.get(name);
        if (!(value instanceof String string)) {
            throw RegistryReleaseRef.invalid();
        }
        return string;
    }

    /** SemVer precedence for the wire contract's bounded major.minor.patch[-prerelease]. */
    static int compareVersions(String left, String right) {
        var a = left.split("-", 2);
        var b = right.split("-", 2);
        var coreA = a[0].split("\\.", -1);
        var coreB = b[0].split("\\.", -1);
        for (int i = 0; i < 3; ++i) {
            int result = Long.compare(Long.parseLong(coreA[i]), Long.parseLong(coreB[i]));
            if (result != 0) return result;
        }
        if (a.length == 1 && b.length == 2) return 1;
        if (a.length == 2 && b.length == 1) return -1;
        if (a.length == 1) return 0;
        var preA = a[1].split("\\.", -1);
        var preB = b[1].split("\\.", -1);
        for (int i = 0; i < Math.min(preA.length, preB.length); ++i) {
            String x = preA[i];
            String y = preB[i];
            boolean xn = x.matches("[0-9]+");
            boolean yn = y.matches("[0-9]+");
            int result;
            if (xn && yn) {
                result = compareUnsignedDecimal(x, y);
            } else if (xn != yn) {
                result = xn ? -1 : 1;
            } else {
                result = x.compareTo(y);
            }
            if (result != 0) return result;
        }
        return Integer.compare(preA.length, preB.length);
    }

    private static int compareUnsignedDecimal(String left, String right) {
        String a = left.replaceFirst("^0+(?!$)", "");
        String b = right.replaceFirst("^0+(?!$)", "");
        int size = Integer.compare(a.length(), b.length());
        return size == 0 ? a.compareTo(b) : size;
    }
}
