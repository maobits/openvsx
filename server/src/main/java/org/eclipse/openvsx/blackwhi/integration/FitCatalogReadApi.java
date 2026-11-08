/*
 * BlackWhi Store - STORE-01.5.2, read-only public FIT product API.
 * SPDX-License-Identifier: EPL-2.0
 * Fork provenance: https://github.com/eclipse-openvsx/openvsx
 */
package org.eclipse.openvsx.blackwhi.integration;

import java.util.Map;

import org.eclipse.openvsx.blackwhi.integration.FitRegistryCatalogClient.StoreRegistryException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * This endpoint exposes only a bounded, read-only projection of the already public
 * FIT Registry catalog. It does NOT verify publisher identity, grant trust,
 * deliver packages, install software, or provide Registry write access.
 *
 * The upstream transport is disabled unless blackwhi.store.fit-registry.origin
 * is explicitly set to a 127.0.0.1 origin. For any other topology, service IAM,
 * transport security and a new reviewed contract are required before exposure.
 */
@RestController
public final class FitCatalogReadApi {
    public static final String PATH = "/api/blackwhi/fit/v1/products";
    public static final String CONTRACT = "blackwhi.store.fit.products.v1";
    public static final String ERROR_CONTRACT = "blackwhi.store.fit.error.v1";

    private final FitRegistryCatalogService registry;

    public FitCatalogReadApi(FitRegistryCatalogService registry) {
        this.registry = registry;
    }

    @GetMapping(path = PATH, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> products() {
        try {
            var products = registry.listPublicProducts();
            return response(HttpStatus.OK, Map.of(
                    "contract", CONTRACT,
                    "readOnly", true,
                    "sourceContract", "blackwhi.fit.registry.catalog.v1",
                    "coverage", "latest-50-releases",
                    "returnedCount", products.size(),
                    "products", products));
        } catch (StoreRegistryException exception) {
            String code = exception.getMessage();
            if ("BLACKWHI_STORE_REGISTRY_DISABLED".equals(code)) {
                return error(HttpStatus.SERVICE_UNAVAILABLE, "FIT_REGISTRY_NOT_CONFIGURED");
            }
            if ("BLACKWHI_STORE_REGISTRY_INVALID_RESPONSE".equals(code)
                    || "BLACKWHI_STORE_REGISTRY_BODY_TOO_LARGE".equals(code)) {
                return error(HttpStatus.BAD_GATEWAY, "FIT_REGISTRY_INVALID_RESPONSE");
            }
            return error(HttpStatus.SERVICE_UNAVAILABLE, "FIT_REGISTRY_UNAVAILABLE");
        } catch (IllegalArgumentException exception) {
            // The strict projection rejected an unexpected contract/value.
            return error(HttpStatus.BAD_GATEWAY, "FIT_REGISTRY_INVALID_RESPONSE");
        }
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String code) {
        return response(status, Map.of("contract", ERROR_CONTRACT, "code", code));
    }

    private static ResponseEntity<Map<String, Object>> response(HttpStatus status, Map<String, Object> body) {
        return ResponseEntity.status(status)
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .header("Referrer-Policy", "no-referrer")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body);
    }
}
