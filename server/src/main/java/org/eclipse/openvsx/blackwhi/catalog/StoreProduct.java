/*
 * BlackWhi Store native FIT product model.
 * SPDX-License-Identifier: EPL-2.0
 * Derived fork: https://github.com/eclipse-openvsx/openvsx
 */
package org.eclipse.openvsx.blackwhi.catalog;

import java.util.Objects;

/**
 * FIT-native catalog product matching blackwhi/contracts/store-product.v1.schema.json.
 * Namespaces are DISPLAY GROUPINGS inferred from identifiers, not verified publisher identity.
 * No field grants permission to download, install or execute a .fitpkg.
 */
public record StoreProduct(
        String contract,
        String productId,
        String artifactType,
        String displayName,
        String publisherNamespace,
        RegistryReleaseRef registryRelease
) {
    public static final String CONTRACT = "blackwhi.store.catalog.product.v1";
    public static final String ARTIFACT_TYPE = "fit-package";

    public StoreProduct {
        if (!CONTRACT.equals(contract)
                || !ARTIFACT_TYPE.equals(artifactType)
                || registryRelease == null
                || !Objects.equals(productId, registryRelease.packageId())
                || displayName == null || displayName.isBlank()
                || displayName.length() > 160
                || displayName.codePoints().anyMatch(Character::isISOControl)
                || publisherNamespace == null || publisherNamespace.isBlank()
                || !productId.startsWith(publisherNamespace)) {
            throw RegistryReleaseRef.invalid();
        }
    }
}
