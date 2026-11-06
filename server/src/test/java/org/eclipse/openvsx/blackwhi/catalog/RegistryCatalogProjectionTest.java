/* SPDX-License-Identifier: EPL-2.0 */
package org.eclipse.openvsx.blackwhi.catalog;

import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class RegistryCatalogProjectionTest {
    private static final String SHA = "a".repeat(64);

    private Map<String, Object> release(String version) {
        return Map.of(
                "id", "org.blackwhi.examples.strength",
                "version", version,
                "title", "Strength Calculator",
                "state", "published",
                "sha256", SHA,
                "publishedAt", "2026-11-06T12:00:00.000Z");
    }

    private Map<String, Object> catalog(List<?> releases) {
        return Map.of("contract", RegistryReleaseRef.CONTRACT, "readOnly", true, "releases", releases);
    }

    @Test void projectsNativeFitProductWithNoTrustGrant() {
        var products = RegistryCatalogProjection.project(catalog(List.of(release("1.0.0"))));
        assertEquals(1, products.size());
        var product = products.getFirst();
        assertEquals("org.blackwhi.examples", product.publisherNamespace());
        assertEquals("fit-package", product.artifactType());
        assertEquals("blackwhi.store.catalog.product.v1", product.contract());
        assertEquals("1.0.0", product.registryRelease().version());
        assertThrows(UnsupportedOperationException.class, () -> products.add(product));
    }

    @Test void choosesHighestSemanticVersionNotLexicographic() {
        var products = RegistryCatalogProjection.project(catalog(List.of(
                release("2.0.0"), release("10.0.0"), release("10.0.0-rc.2"))));
        assertEquals("10.0.0", products.getFirst().registryRelease().version());
    }

    @Test void rejectsAlteredAndUnexpectedFields() {
        assertThrows(IllegalArgumentException.class, () -> RegistryCatalogProjection.project(
                Map.of("contract", RegistryReleaseRef.CONTRACT, "readOnly", false, "releases", List.of())));
        assertThrows(IllegalArgumentException.class, () -> RegistryCatalogProjection.project(
                Map.of("contract", RegistryReleaseRef.CONTRACT, "readOnly", true,
                        "releases", List.of(), "credential", "secret")));
        assertThrows(IllegalArgumentException.class, () -> RegistryCatalogProjection.project(
                catalog(List.of(Map.of("id", "org.blackwhi.examples.strength")))));
    }

    @Test void rejectsDuplicateAndInvalidReleaseIdentity() {
        assertThrows(IllegalArgumentException.class, () -> RegistryCatalogProjection.project(
                catalog(List.of(release("1.0.0"), release("1.0.0")))));
        assertThrows(IllegalArgumentException.class, () -> RegistryCatalogProjection.project(
                catalog(List.of(release("1.0.0"), release("01.0.0")))));
    }

    @Test void comparesPrereleaseSemverCorrectly() {
        assertTrue(RegistryCatalogProjection.compareVersions("1.0.0-rc.2", "1.0.0-rc.11") < 0);
        assertTrue(RegistryCatalogProjection.compareVersions("1.0.0", "1.0.0-rc.100") > 0);
        assertTrue(RegistryCatalogProjection.compareVersions("1.0.0-alpha.1", "1.0.0-alpha.beta") < 0);
    }
}
