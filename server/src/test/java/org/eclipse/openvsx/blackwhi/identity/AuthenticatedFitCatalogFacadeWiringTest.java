/*
 * BlackWhi Store - STORE-01.5.2 Spring constructor-wiring regression.
 * SPDX-License-Identifier: EPL-2.0
 */
package org.eclipse.openvsx.blackwhi.identity;

import org.eclipse.openvsx.blackwhi.integration.FitRegistryCatalogService;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import static org.eclipse.openvsx.blackwhi.identity.StoreServiceProof.ServiceIdentityDenied;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AuthenticatedFitCatalogFacadeWiringTest {
    @Test
    void springWiresProductionConstructorAndKeepsTrustDeniedByDefault() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.registerBean(FitRegistryCatalogService.class,
                    () -> new FitRegistryCatalogService(""));
            context.registerBean(AuthenticatedFitCatalogFacade.class);
            context.refresh();

            var facade = context.getBean(AuthenticatedFitCatalogFacade.class);
            assertNotNull(facade);
            assertThrows(ServiceIdentityDenied.class,
                    () -> facade.listPublicProducts(null));
        }
    }
}
