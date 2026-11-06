/* SPDX-License-Identifier: EPL-2.0 */
package org.eclipse.openvsx.blackwhi.artifact;

import org.junit.jupiter.api.Test;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import static org.junit.jupiter.api.Assertions.*;

class FitArtifactInspectorTest {
    private static final String SOURCE = "print(42)\n";
    private static String sha(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }
    private static byte[] utf(String s) { return s.getBytes(StandardCharsets.UTF_8); }
    private static byte[] archive(Map<String, byte[]> files) throws Exception {
        var bytes = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(bytes)) {
            for (var entry : files.entrySet()) {
                var file = new ZipEntry(entry.getKey());
                file.setMethod(ZipEntry.STORED);
                file.setSize(entry.getValue().length);
                var crc = new CRC32(); crc.update(entry.getValue()); file.setCrc(crc.getValue());
                zip.putNextEntry(file); zip.write(entry.getValue()); zip.closeEntry();
            }
        }
        return bytes.toByteArray();
    }
    private static Map<String, byte[]> files() throws Exception {
        String id = "org.blackwhi.tests.volume", version = "1.0.0";
        String manifest = """
                {"contract":"blackwhi.fit.program.v2","id":"%s","version":"%s",
                "source":{"entrypoint":"main.fit","modules":[{"path":"main.fit","sha256":"%s"}]}}
                """.formatted(id, version, sha(utf(SOURCE)));
        String lock = """
                {"contract":"blackwhi.fit.lock.v1","program":{"id":"%s","version":"%s",
                "manifest_sha256":"%s"},"libraries":[]}
                """.formatted(id, version, sha(utf(manifest)));
        Map<String, byte[]> result = new LinkedHashMap<>();
        result.put("fit-lock.json", utf(lock));
        result.put("fit-program.json", utf(manifest));
        result.put("main.fit", utf(SOURCE));
        return result;
    }
    @Test void inspectsRealStructureWithoutTrustGrant() throws Exception {
        var bytes = archive(files());
        var result = FitArtifactInspector.inspect(bytes, sha(bytes));
        assertEquals("org.blackwhi.tests.volume", result.packageId());
        assertEquals("1.0.0", result.version());
        assertEquals("main.fit", result.entrypoint());
        assertEquals(3, result.fileCount());
    }
    @Test void rejectsUnapprovedArtifactDigest() throws Exception {
        assertThrows(IllegalArgumentException.class, () ->
                FitArtifactInspector.inspect(archive(files()), "0".repeat(64)));
    }
    @Test void rejectsTamperedModule() throws Exception {
        var files = files(); files.put("main.fit", utf("print(43)\n"));
        var bytes = archive(files);
        assertThrows(IllegalArgumentException.class, () -> FitArtifactInspector.inspect(bytes, sha(bytes)));
    }
    @Test void rejectsAdditionalFile() throws Exception {
        var files = files(); files.put("other.fit", utf("pass\n"));
        var bytes = archive(files);
        assertThrows(IllegalArgumentException.class, () -> FitArtifactInspector.inspect(bytes, sha(bytes)));
    }
    @Test void rejectsTraversal() throws Exception {
        var files = files(); files.put("../outside.fit", utf("pass\n"));
        var bytes = archive(files);
        assertThrows(IllegalArgumentException.class, () -> FitArtifactInspector.inspect(bytes, sha(bytes)));
    }
    @Test void rejectsCompressedZip() throws Exception {
        var files = files(); var stream = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(stream)) {
            for (var entry : files.entrySet()) {
                zip.putNextEntry(new ZipEntry(entry.getKey()));
                zip.write(entry.getValue()); zip.closeEntry();
            }
        }
        var bytes = stream.toByteArray();
        assertThrows(IllegalArgumentException.class, () -> FitArtifactInspector.inspect(bytes, sha(bytes)));
    }
    @Test void refusesNullAndOversizedBytes() {
        assertThrows(IllegalArgumentException.class, () -> FitArtifactInspector.inspect(null, "0".repeat(64)));
        assertThrows(IllegalArgumentException.class, () -> FitArtifactInspector.inspect(new byte[2*1024*1024+1], "0".repeat(64)));
    }
}
