/* SPDX-License-Identifier: EPL-2.0 */
package org.eclipse.openvsx.blackwhi.catalog;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Dependency-free smoke acceptance (javac/java) for STORE-01.1. */
public final class NativeCatalogSmoke {
    private static int cases = 0;
    private NativeCatalogSmoke() { }

    private static void check(boolean condition, String code) {
        ++cases;
        if (!condition) throw new AssertionError(code);
    }

    private static void rejects(Runnable action, String code) {
        ++cases;
        try {
            action.run();
        } catch (IllegalArgumentException e) {
            if (!"BLACKWHI_STORE_CATALOG_INVALID".equals(e.getMessage())) {
                throw new AssertionError("WRONG_FAILURE_CODE: " + code, e);
            }
            return;
        }
        throw new AssertionError("ACCEPTED_INVALID_INPUT: " + code);
    }

    private static Map<String, Object> release(String version) {
        return new HashMap<>(Map.of(
                "id", "org.blackwhi.examples.strength",
                "version", version,
                "title", "Strength Calculator",
                "state", "published",
                "sha256", "a".repeat(64),
                "publishedAt", "2026-11-06T12:00:00.000Z"));
    }

    private static Map<String, Object> catalog(List<?> releases) {
        return new HashMap<>(Map.of(
                "contract", RegistryReleaseRef.CONTRACT,
                "readOnly", true,
                "releases", releases));
    }

    public static void main(String[] args) {
        var valid = RegistryCatalogProjection.project(catalog(List.of(release("1.0.0"))));
        check(valid.size() == 1, "valid count");
        check(valid.getFirst().artifactType().equals("fit-package"), "FIT artifact");
        check(valid.getFirst().contract().equals(StoreProduct.CONTRACT), "contract");
        check(valid.getFirst().registryRelease().sha256().equals("a".repeat(64)), "sha retained");
        check(valid.getFirst().publisherNamespace().equals("org.blackwhi.examples"), "grouping");
        check(RegistryCatalogProjection.project(catalog(List.of())).isEmpty(), "empty catalog");
        var versions = RegistryCatalogProjection.project(catalog(List.of(
                release("2.0.0"), release("10.0.0-rc.2"), release("10.0.0"))));
        check(versions.getFirst().registryRelease().version().equals("10.0.0"), "SemVer max");
        check(RegistryCatalogProjection.compareVersions("1.0.0-rc.2", "1.0.0-rc.11") < 0, "prerelease numeric");
        check(RegistryCatalogProjection.compareVersions("1.0.0-rc.1", "1.0.0") < 0, "release vs rc");
        check(RegistryCatalogProjection.compareVersions("1.0.0-alpha.1", "1.0.0-alpha.beta") < 0, "numeric identifier first");
        rejects(() -> RegistryCatalogProjection.project(null), "null catalog");
        rejects(() -> RegistryCatalogProjection.project(Map.of("contract", "fake", "readOnly", true, "releases", List.of())), "wrong contract");
        rejects(() -> RegistryCatalogProjection.project(Map.of("contract", RegistryReleaseRef.CONTRACT, "readOnly", false, "releases", List.of())), "write enabled");
        var extra = catalog(List.of()); extra.put("token", "secret");
        rejects(() -> RegistryCatalogProjection.project(extra), "secret fields");
        rejects(() -> RegistryCatalogProjection.project(catalog(List.of(release("1.0.0"), release("1.0.0")))), "duplicate");
        rejects(() -> RegistryCatalogProjection.project(catalog(List.of(release("1.0.0"), release("01.0.0")))), "ambiguous semver");
        var invalidSha = release("1.0.0"); invalidSha.put("sha256", "BAD");
        rejects(() -> RegistryCatalogProjection.project(catalog(List.of(invalidSha))), "sha invalid");
        var wrongTime = release("1.0.0"); wrongTime.put("publishedAt", "yesterday");
        rejects(() -> RegistryCatalogProjection.project(catalog(List.of(wrongTime))), "date invalid");
        var nativeClaim = release("1.0.0"); nativeClaim.put("canExecute", true);
        rejects(() -> RegistryCatalogProjection.project(catalog(List.of(nativeClaim))), "forged permission");
        var unknownState = release("1.0.0"); unknownState.put("state", "draft");
        rejects(() -> RegistryCatalogProjection.project(catalog(List.of(unknownState))), "unauthorized state");
        var controlTitle = release("1.0.0"); controlTitle.put("title", "Hi\nInjected");
        rejects(() -> RegistryCatalogProjection.project(catalog(List.of(controlTitle))), "control chars");
        rejects(() -> RegistryCatalogProjection.project(catalog(new ArrayList<>(java.util.Collections.nCopies(51, release("1.0.0"))))), "oversize");
        try {
            valid.add(valid.getFirst());
            throw new AssertionError("MUTABLE_PRODUCT_LIST");
        } catch (UnsupportedOperationException expected) {
            ++cases;
        }
        System.out.println("PASS: STORE-01.1 isolated Java model; " + cases + " assertions");
    }
}
