/*
 * BlackWhi Store - STORE-01.4 protected entrypoint, disabled by default.
 * SPDX-License-Identifier: EPL-2.0
 */
package org.eclipse.openvsx.blackwhi.identity;

import java.time.Clock;
import java.util.List;

import org.eclipse.openvsx.blackwhi.catalog.StoreProduct;
import org.eclipse.openvsx.blackwhi.integration.FitRegistryCatalogService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Protected internal facade for future Store components. Does not expose an
 * endpoint or change NestJS; without pinned trust config it rejects every call.
 * The original public read-only client remains independent and unmodified.
 */
@Service
public final class AuthenticatedFitCatalogFacade {
    private final FitRegistryCatalogService catalog;
    private final StoreServiceProofVerifier verifier;

    public AuthenticatedFitCatalogFacade(
            FitRegistryCatalogService catalog,
            @Value("${blackwhi.store.service-identity.key-id:}") String keyId,
            @Value("${blackwhi.store.service-identity.public-key-spki-base64:}") String publicKey) {
        this(catalog, StoreServiceProofVerifier.fromPinnedKey(keyId, publicKey, Clock.systemUTC()));
    }

    // Test seam, no mock authentication in production.
    AuthenticatedFitCatalogFacade(FitRegistryCatalogService catalog,
                                  StoreServiceProofVerifier verifier) {
        if (catalog == null || verifier == null) {
            throw new StoreServiceProof.ServiceIdentityDenied();
        }
        this.catalog = catalog;
        this.verifier = verifier;
    }

    public List<StoreProduct> listPublicProducts(StoreServiceProof signedProof) {
        verifier.verifyCatalogRead(signedProof); // deny before network, DB or caching
        return catalog.listPublicProducts();
    }
}
