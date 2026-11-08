/* BlackWhi Store - STORE-01.5.2 controller contract tests.
 * SPDX-License-Identifier: EPL-2.0
 */
package org.eclipse.openvsx.blackwhi.integration;

import java.util.List;
import org.eclipse.openvsx.blackwhi.catalog.RegistryReleaseRef;
import org.eclipse.openvsx.blackwhi.catalog.StoreProduct;
import org.eclipse.openvsx.blackwhi.integration.FitRegistryCatalogClient.StoreRegistryException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class FitCatalogReadApiTest {
    private final FitRegistryCatalogService service = mock(FitRegistryCatalogService.class);
    private final FitCatalogReadApi controller = new FitCatalogReadApi(service);

    @Test void returnsOnlyRealProjectedItemsAndNoInstallAuthority() {
        var release = new RegistryReleaseRef(RegistryReleaseRef.CONTRACT,
                "org.blackwhi.fit.strength", "1.2.0", "a".repeat(64),
                "published", "2026-11-06T15:00:00Z");
        var product = new StoreProduct(StoreProduct.CONTRACT, release.packageId(),
                StoreProduct.ARTIFACT_TYPE, "Strength", "org.blackwhi.fit", release);
        when(service.listPublicProducts()).thenReturn(List.of(product));
        var result = controller.products();
        assertEquals(HttpStatus.OK, result.getStatusCode());
        assertEquals(FitCatalogReadApi.CONTRACT, result.getBody().get("contract"));
        assertEquals(true, result.getBody().get("readOnly"));
        assertEquals("latest-50-releases", result.getBody().get("coverage"));
        assertEquals(1, result.getBody().get("returnedCount"));
        assertEquals(List.of(product), result.getBody().get("products"));
        assertFalse(result.getBody().containsKey("installAllowed"));
        assertTrue(result.getHeaders().getCacheControl().contains("no-store"));
        verify(service).listPublicProducts();
    }

    @Test void distinguishesConfiguredButEmptyFromFailure() {
        when(service.listPublicProducts()).thenReturn(List.of());
        var result = controller.products();
        assertEquals(HttpStatus.OK, result.getStatusCode());
        assertEquals(0, result.getBody().get("returnedCount"));
    }

    @Test void disabledReturns503NotAnEmptyCatalog() {
        when(service.listPublicProducts()).thenThrow(new StoreRegistryException("BLACKWHI_STORE_REGISTRY_DISABLED"));
        var result = controller.products();
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, result.getStatusCode());
        assertEquals("FIT_REGISTRY_NOT_CONFIGURED", result.getBody().get("code"));
    }

    @Test void invalidUpstreamContractReturns502WithoutSecrets() {
        when(service.listPublicProducts()).thenThrow(new IllegalArgumentException("PRIVATE RESPONSE SECRET"));
        var result = controller.products();
        assertEquals(HttpStatus.BAD_GATEWAY, result.getStatusCode());
        assertEquals("FIT_REGISTRY_INVALID_RESPONSE", result.getBody().get("code"));
        assertFalse(result.getBody().toString().contains("PRIVATE"));
    }

    @Test void outageReturns503NotAnEmptyCatalog() {
        when(service.listPublicProducts()).thenThrow(new StoreRegistryException("BLACKWHI_STORE_REGISTRY_UNAVAILABLE"));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, controller.products().getStatusCode());
    }
}
