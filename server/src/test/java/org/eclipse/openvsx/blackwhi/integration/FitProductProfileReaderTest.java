/* BlackWhi Store STORE-02 real FIT-01 profile fixture tests. SPDX-License-Identifier: EPL-2.0 */
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

class FitProductProfileReaderTest {
    @TempDir Path root;
    Path versionDirectory;
    StoreProduct publication;

    @BeforeEach void prepare() throws Exception {
        Path fixture = Path.of("src/test/resources/blackwhi/store02");
        byte[] profile = Files.readAllBytes(fixture.resolve("profile.json"));
        String id = "org.blackwhi.examples.packaged.volume";
        String version = "1.0.0";
        // The digest below is that of a canonical .fitpkg in the real source fixture.
        String sha = "a2af7f173b5acdb0907a766941db20f29fd79ef3645b5b7e70d57c755537cd09";
        publication = new StoreProduct(StoreProduct.CONTRACT, id, StoreProduct.ARTIFACT_TYPE,
                "Packaged Volume", "org.blackwhi.examples.packaged",
                new RegistryReleaseRef(RegistryReleaseRef.CONTRACT, id, version, sha,
                        "published", "2026-11-09T05:00:00Z"));
        versionDirectory = root.resolve(id).resolve(version);
        Files.createDirectories(versionDirectory.resolve("docs"));
        Files.createDirectories(versionDirectory.resolve("assets"));
        Files.write(versionDirectory.resolve("profile.json"), profile);
        for (String name : List.of("docs/README.md", "docs/QUICKSTART.md", "docs/CHANGELOG.md",
                "docs/LICENSE.md", "assets/icon.png")) {
            Files.copy(fixture.resolve(name), versionDirectory.resolve(name));
        }
    }

    @Test void servesAllSectionsAndVerifiesResourceDigest() {
        FitProductProfileReader reader = new FitProductProfileReader(root.toString());
        var result = reader.readProfile(publication);
        assertNotNull(result);
        assertEquals(20, result.size()); // 18 sections plus contract and release reference.
        var raw = reader.readAsset(publication, "docs/README.md");
        assertTrue(raw.length > 30);
        assertThrows(FitProductProfileReader.ProfileReadException.class,
                () -> reader.readAsset(publication, "../../etc/passwd"));
    }

    @Test void refusesTamperedDocumentation() throws Exception {
        Files.writeString(versionDirectory.resolve("docs/README.md"), "tampered");
        assertEquals("FIT_PROFILE_INVALID", assertThrows(FitProductProfileReader.ProfileReadException.class,
                () -> new FitProductProfileReader(root.toString()).readProfile(publication)).getMessage());
    }

    @Test void refusesUnmatchedRegistryDigest() {
        StoreProduct changed = new StoreProduct(StoreProduct.CONTRACT, publication.productId(),
                StoreProduct.ARTIFACT_TYPE, publication.displayName(), publication.publisherNamespace(),
                new RegistryReleaseRef(RegistryReleaseRef.CONTRACT, publication.productId(), "1.0.0",
                        "f".repeat(64), "published", "2026-11-09T05:00:00Z"));
        assertThrows(FitProductProfileReader.ProfileReadException.class,
                () -> new FitProductProfileReader(root.toString()).readProfile(changed));
    }

    @Test void refusesSymlinkedDocument() throws Exception {
        Files.delete(versionDirectory.resolve("docs/README.md"));
        Files.createSymbolicLink(versionDirectory.resolve("docs/README.md"), Path.of("QUICKSTART.md"));
        assertThrows(FitProductProfileReader.ProfileReadException.class,
                () -> new FitProductProfileReader(root.toString()).readProfile(publication));
    }

    @Test void absentProfileIsExplicitlyNotProvided() throws Exception {
        Files.delete(versionDirectory.resolve("profile.json"));
        assertNull(new FitProductProfileReader(root.toString()).readProfile(publication));
        assertNull(new FitProductProfileReader("").readProfile(publication));
    }
}
