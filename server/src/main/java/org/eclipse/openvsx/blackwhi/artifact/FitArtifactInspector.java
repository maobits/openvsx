/* SPDX-License-Identifier: EPL-2.0 */
package org.eclipse.openvsx.blackwhi.artifact;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Bounded, non-executing FIT archive metadata preflight for the Store catalog.
 * This is NOT canonical-ZIP verification, signature verification, an entitlement,
 * or an installation/execution authorization. BlackWhi v2 remains authoritative.
 */
public final class FitArtifactInspector {
    private static final int MAX_ARCHIVE = 2 * 1024 * 1024;
    private static final int MAX_ENTRIES = 64;
    private static final int MAX_ENTRY = 512 * 1024;
    private static final int MAX_MANIFEST = 32 * 1024;
    private static final Pattern ID = Pattern.compile("[a-z][a-z0-9.-]{1,120}");
    private static final Pattern VERSION = Pattern.compile("[0-9]{1,8}\\.[0-9]{1,8}\\.[0-9]{1,8}(?:-[0-9A-Za-z.-]{1,40})?");
    private static final Pattern HASH = Pattern.compile("[0-9a-f]{64}");
    private static final JsonMapper JSON = new JsonMapper();

    private FitArtifactInspector() {}

    public static FitArtifactInspection inspect(byte[] archive, String approvedArtifactSha256) {
        if (archive == null || archive.length < 30 || archive.length > MAX_ARCHIVE
                || !match(HASH, approvedArtifactSha256)
                || !sha(archive).equals(approvedArtifactSha256)) {
            throw invalid();
        }
        Map<String, byte[]> entries = new HashMap<>();
        int count = 0;
        try (var zip = new ZipInputStream(new ByteArrayInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (++count > MAX_ENTRIES || entry.isDirectory() || entry.getMethod() != ZipEntry.STORED
                        || !validPath(entry.getName()) || entries.containsKey(entry.getName())
                        || (entry.getSize() > MAX_ENTRY)) {
                    throw invalid();
                }
                byte[] content = zip.readNBytes(MAX_ENTRY + 1);
                if (content.length > MAX_ENTRY || (entry.getSize() >= 0 && content.length != entry.getSize())) {
                    throw invalid();
                }
                entries.put(entry.getName(), content);
                zip.closeEntry();
            }
        } catch (IOException | IllegalArgumentException ex) {
            throw invalid();
        }
        if (count < 3 || !entries.containsKey("fit-program.json") || !entries.containsKey("fit-lock.json")) {
            throw invalid();
        }
        try {
            byte[] manifestBytes = entries.get("fit-program.json");
            byte[] lockBytes = entries.get("fit-lock.json");
            if (manifestBytes.length > MAX_MANIFEST || lockBytes.length > MAX_MANIFEST) throw invalid();
            JsonNode manifest = JSON.readTree(manifestBytes);
            JsonNode lock = JSON.readTree(lockBytes);
            if (!"blackwhi.fit.program.v2".equals(text(manifest, "contract"))
                    || !"blackwhi.fit.lock.v1".equals(text(lock, "contract"))) throw invalid();
            String id = text(manifest, "id"), version = text(manifest, "version");
            if (!match(ID, id) || !match(VERSION, version)) throw invalid();
            JsonNode lockProgram = lock.path("program");
            if (!id.equals(text(lockProgram, "id"))
                    || !version.equals(text(lockProgram, "version"))
                    || !sha(manifestBytes).equals(text(lockProgram, "manifest_sha256"))) throw invalid();
            JsonNode source = manifest.path("source");
            String entrypoint = text(source, "entrypoint");
            JsonNode modules = source.path("modules");
            if (modules == null || !modules.isArray() || modules.isEmpty()
                    || modules.size() > 32 || !validPath(entrypoint) || !entrypoint.endsWith(".fit")) throw invalid();
            Set<String> known = new HashSet<>(Set.of("fit-program.json", "fit-lock.json"));
            for (JsonNode module : modules) {
                String path = text(module, "path"), expected = text(module, "sha256");
                if (!validPath(path) || !path.endsWith(".fit") || !match(HASH, expected)
                        || !known.add(path) || !entries.containsKey(path)
                        || !sha(entries.get(path)).equals(expected)) throw invalid();
            }
            if (!known.contains(entrypoint)) throw invalid();
            JsonNode libraries = lock.path("libraries");
            if (libraries == null || !libraries.isArray() || libraries.size() > 8) throw invalid();
            for (JsonNode lib : libraries) {
                String libId = text(lib, "id"), libVersion = text(lib, "version");
                String libHash = text(lib, "manifest_sha256");
                if (!match(ID, libId) || !match(VERSION, libVersion) || !match(HASH, libHash)) throw invalid();
                String prefix = "vendor/" + libId + "/" + libVersion + "/";
                String path = prefix + "fit-library.json";
                if (!known.add(path) || !entries.containsKey(path)
                        || !sha(entries.get(path)).equals(libHash)) throw invalid();
                JsonNode libManifest = JSON.readTree(entries.get(path));
                if (!"blackwhi.fit.library.v1".equals(text(libManifest, "contract"))
                        || !libId.equals(text(libManifest, "id"))
                        || !libVersion.equals(text(libManifest, "version"))) throw invalid();
                JsonNode libModules = libManifest.path("modules");
                if (!libModules.isArray() || libModules.isEmpty() || libModules.size() > 32) throw invalid();
                for (JsonNode mod : libModules) {
                    String rel = text(mod, "path"), hash = text(mod, "sha256");
                    String name = prefix + rel;
                    if (!validPath(rel) || !rel.endsWith(".fit") || !match(HASH, hash)
                            || !known.add(name) || !entries.containsKey(name)
                            || !sha(entries.get(name)).equals(hash)) throw invalid();
                }
            }
            if (!known.equals(entries.keySet())) throw invalid();
            return new FitArtifactInspection(id, version, approvedArtifactSha256,
                    entrypoint, count, modules.size());
        } catch (Exception ex) {
            throw invalid();
        }
    }

    private static String text(JsonNode node, String key) {
        JsonNode value = node == null ? null : node.get(key);
        return value != null && value.isTextual() ? value.asText() : "";
    }

    private static boolean match(Pattern pattern, String text) {
        return text != null && pattern.matcher(text).matches();
    }

    private static boolean validPath(String path) {
        if (path == null || path.isEmpty() || path.length() > 200 || path.startsWith("/")
                || path.contains("\\") || path.indexOf('\0') >= 0) return false;
        for (String part : path.split("/", -1)) {
            if (part.isEmpty() || part.equals(".") || part.equals("..")) return false;
        }
        return true;
    }

    private static String sha(byte[] bytes) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(bytes);
            return java.util.HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("BLACKWHI_FIT_ARTIFACT_INVALID");
    }
}
