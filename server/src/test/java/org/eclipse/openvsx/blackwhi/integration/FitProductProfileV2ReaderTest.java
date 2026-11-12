/* BlackWhi STORE-03.3: isolated v2 profile fixture tests. SPDX-License-Identifier: EPL-2.0 */
package org.eclipse.openvsx.blackwhi.integration;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.eclipse.openvsx.blackwhi.catalog.RegistryReleaseRef;
import org.eclipse.openvsx.blackwhi.catalog.StoreProduct;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class FitProductProfileV2ReaderTest {
    @TempDir Path root;
    Path versionDirectory;
    StoreProduct publication;

    @BeforeEach void prepare() throws Exception {
        Path fixture = Path.of("src/test/resources/blackwhi/store02");
        String id = "org.blackwhi.examples.packaged.volume";
        String version = "1.0.0";
        String sha = "a2af7f173b5acdb0907a766941db20f29fd79ef3645b5b7e70d57c755537cd09";
        publication = new StoreProduct(StoreProduct.CONTRACT, id, StoreProduct.ARTIFACT_TYPE,
                "Packaged Volume", "org.blackwhi.examples.packaged",
                new RegistryReleaseRef(RegistryReleaseRef.CONTRACT, id, version, sha,
                        "published", "2026-11-09T05:00:00Z"));
        versionDirectory = root.resolve(id).resolve(version);
        Files.createDirectories(versionDirectory.resolve("docs"));
        Files.write(versionDirectory.resolve("profile.json"), Files.readAllBytes(
                Path.of("src/test/resources/blackwhi/store03/profile-v2-approved.json")));
        for (String name : List.of("docs/README.md", "docs/QUICKSTART.md", "docs/CHANGELOG.md", "docs/LICENSE.md")) {
            Files.copy(fixture.resolve(name), versionDirectory.resolve(name));
        }
    }

    @Test void acceptsApprovedV2WithoutOptionalIconLinksOrSupport() {
        var reader = new FitProductProfileReader(root.toString());
        var profile = reader.readProfile(publication);
        assertEquals("blackwhi.fit.product.profile.v2", profile.get("contract"));
        assertNull(((java.util.Map<?,?>)profile.get("media")).get("icon"));
        assertTrue(((java.util.List<?>)profile.get("links")).isEmpty());
        assertTrue(reader.readAsset(publication, "docs/LICENSE.md").length > 0);
    }

    @Test void refusesV2DraftEvenWithValidDocumentsAndReleaseDigest() throws Exception {
        Path file = versionDirectory.resolve("profile.json");
        String text = Files.readString(file);
        Files.writeString(file, text.replace("\"state\": \"approved\"", "\"state\": \"review-required\""));
        assertThrows(FitProductProfileReader.ProfileReadException.class,
                () -> new FitProductProfileReader(root.toString()).readProfile(publication));
    }

    @Test void refusesRightsRevocation() throws Exception {
        Path file = versionDirectory.resolve("profile.json");
        Files.writeString(file, Files.readString(file).replace("\"redistributionRightsConfirmed\": true",
                "\"redistributionRightsConfirmed\": false"));
        assertThrows(FitProductProfileReader.ProfileReadException.class,
                () -> new FitProductProfileReader(root.toString()).readProfile(publication));
    }

    @Test void refusesTamperedDocumentAndMissingAsset() throws Exception {
        Files.writeString(versionDirectory.resolve("docs/LICENSE.md"), "tampered");
        assertThrows(FitProductProfileReader.ProfileReadException.class,
                () -> new FitProductProfileReader(root.toString()).readProfile(publication));
    }
}
