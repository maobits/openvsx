/*
 * BlackWhi Store - STORE-01.3: Spring read-only catalog integration.
 * SPDX-License-Identifier: EPL-2.0
 */
package org.eclipse.openvsx.blackwhi.integration;

import java.util.List;
import org.eclipse.openvsx.blackwhi.catalog.StoreProduct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Spring-managed integration point for future Store UI/catalog services.
 * No @Controller, public endpoint, database migration or background synchronization.
 * Missing configuration keeps it disabled; production service identity is deferred.
 */
@Service
public final class FitRegistryCatalogService {
    private final FitRegistryCatalogClient client;

    public FitRegistryCatalogService(
            @Value("${blackwhi.store.fit-registry.origin:}") String origin) {
        this.client = new FitRegistryCatalogClient(origin);
    }

    public List<StoreProduct> listPublicProducts() {
        return client.listProducts();
    }
}
