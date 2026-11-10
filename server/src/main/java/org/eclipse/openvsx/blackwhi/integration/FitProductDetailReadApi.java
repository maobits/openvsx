/* BlackWhi Store - STORE-02: read-only FIT detail and digest-verified resources.
 * SPDX-License-Identifier: EPL-2.0
 */
package org.eclipse.openvsx.blackwhi.integration;

import java.util.Map;

import org.eclipse.openvsx.blackwhi.catalog.StoreProduct;
import org.eclipse.openvsx.blackwhi.integration.FitProductProfileReader.ProfileReadException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Only projects published/deprecated releases from Registry; not an install grant. */
@RestController
public final class FitProductDetailReadApi {
    private static final String PATH = "/api/blackwhi/fit/v1/products/{packageId}/versions/{version}";
    private static final String EXACT_PATH = "/api/blackwhi/fit/v2/products/{packageId}/versions/{version}";
    private final FitRegistryCatalogService registry;
    private final FitProductProfileReader profiles;

    public FitProductDetailReadApi(FitRegistryCatalogService registry,
            @Value("${blackwhi.store.fit-profile.root:}") String profileRoot) {
        this.registry = registry;
        this.profiles = new FitProductProfileReader(profileRoot);
    }

    @GetMapping(path = PATH, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> detail(@PathVariable String packageId,
            @PathVariable String version) {
        return detailResolved(packageId, version, false);
    }

    @GetMapping(path = EXACT_PATH, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> exactDetail(@PathVariable String packageId,
            @PathVariable String version) {
        return detailResolved(packageId, version, true);
    }

    private ResponseEntity<Map<String, Object>> detailResolved(String packageId, String version, boolean exact) {
        try {
            StoreProduct product = exact ? exactRelease(packageId, version) : release(packageId, version);
            if (product == null) return error(HttpStatus.NOT_FOUND,
                    exact ? "FIT_RELEASE_NOT_FOUND" : "FIT_RELEASE_NOT_IN_CATALOG_WINDOW");
            Map<String, Object> profile = profiles.readProfile(product);
            return json(HttpStatus.OK, Map.of(
                    "contract", exact ? "blackwhi.store.fit.product.detail.v2" : "blackwhi.store.fit.product.detail.v1",
                    "readOnly", true,
                    "product", product,
                    "profileStatus", profile == null ? "not-provided" : "complete",
                    "profile", profile == null ? Map.of() : profile,
                    "coverage", exact ? "exact-release" : "latest-50-releases"));
        } catch (ProfileReadException exception) {
            return error(HttpStatus.BAD_GATEWAY, exception.getMessage());
        } catch (RuntimeException exception) {
            return error(HttpStatus.SERVICE_UNAVAILABLE, "FIT_REGISTRY_UNAVAILABLE");
        }
    }

    @GetMapping(path = PATH + "/resource")
    public ResponseEntity<?> resource(@PathVariable String packageId, @PathVariable String version,
            @RequestParam("path") String path) {
        return resourceResolved(packageId, version, path, false);
    }

    @GetMapping(path = EXACT_PATH + "/resource")
    public ResponseEntity<?> exactResource(@PathVariable String packageId, @PathVariable String version,
            @RequestParam("path") String path) {
        return resourceResolved(packageId, version, path, true);
    }

    private ResponseEntity<?> resourceResolved(String packageId, String version, String path, boolean exact) {
        try {
            StoreProduct product = exact ? exactRelease(packageId, version) : release(packageId, version);
            if (product == null) return error(HttpStatus.NOT_FOUND,
                    exact ? "FIT_RELEASE_NOT_FOUND" : "FIT_RELEASE_NOT_IN_CATALOG_WINDOW");
            byte[] raw = profiles.readAsset(product, path);
            MediaType type = path.endsWith(".png") ? MediaType.IMAGE_PNG
                    : path.endsWith(".jpg") || path.endsWith(".jpeg") ? MediaType.IMAGE_JPEG
                    : path.endsWith(".webp") ? MediaType.parseMediaType("image/webp")
                    : MediaType.parseMediaType("text/plain; charset=UTF-8");
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .header("X-Content-Type-Options", "nosniff")
                    .header("Content-Security-Policy", "default-src 'none'; sandbox")
                    .contentType(type).body(raw);
        } catch (ProfileReadException exception) {
            return error("FIT_PROFILE_ASSET_NOT_FOUND".equals(exception.getMessage())
                    ? HttpStatus.NOT_FOUND : HttpStatus.BAD_GATEWAY, exception.getMessage());
        } catch (RuntimeException exception) {
            return error(HttpStatus.SERVICE_UNAVAILABLE, "FIT_REGISTRY_UNAVAILABLE");
        }
    }

    private StoreProduct exactRelease(String packageId, String version) {
        if (!validIdentity(packageId, version)) return null;
        return registry.exactRelease(packageId, version);
    }

    private static boolean validIdentity(String packageId, String version) {
        return packageId != null && packageId.matches("[a-z][a-z0-9.-]{1,120}") && !packageId.contains("..")
            && version != null && version.matches("[0-9]{1,8}\\.[0-9]{1,8}\\.[0-9]{1,8}(?:-[0-9A-Za-z.-]{1,40})?");
    }

    private StoreProduct release(String packageId, String version) {
        if (!validIdentity(packageId, version)) return null;
        return registry.listPublicProducts().stream()
                .filter(product -> product.productId().equals(packageId)
                        && product.registryRelease().version().equals(version))
                .findFirst().orElse(null);
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String code) {
        return json(status, Map.of("contract", "blackwhi.store.fit.error.v1", "code", code));
    }

    private static ResponseEntity<Map<String, Object>> json(HttpStatus status, Map<String, Object> body) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .header("Referrer-Policy", "no-referrer")
                .contentType(MediaType.APPLICATION_JSON).body(body);
    }
}
