/* SPDX-License-Identifier: EPL-2.0 */
package org.eclipse.openvsx.blackwhi.artifact;

/** Non-authoritative, read-only metadata about a FIT archive. */
public record FitArtifactInspection(String packageId, String version, String sha256,
                                    String entrypoint, int fileCount, int moduleCount) {
    public FitArtifactInspection {
        if (packageId == null || version == null || sha256 == null || entrypoint == null
                || fileCount < 2 || moduleCount < 1) {
            throw new IllegalArgumentException("BLACKWHI_FIT_ARTIFACT_INVALID");
        }
    }
}
