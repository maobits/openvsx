/*
 * BlackWhi Store native FIT product model.
 * SPDX-License-Identifier: EPL-2.0
 * Derived fork: https://github.com/eclipse-openvsx/openvsx
 */
package org.eclipse.openvsx.blackwhi.catalog;

import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.regex.Pattern;

/**
 * Informational projection of a BlackWhi FIT Registry release.
 * A release reference is NOT an install permit, signature verification,
 * entitlement, ownership assertion, or an authority to execute code.
 */
public record RegistryReleaseRef(
        String contract,
        String packageId,
        String version,
        String sha256,
        String state,
        String publishedAt
) {
    public static final String CONTRACT = "blackwhi.fit.registry.catalog.v1";
    private static final Pattern ID = Pattern.compile("^[a-z][a-z0-9.-]{1,120}$");
    private static final Pattern VERSION = Pattern.compile(
            "^[0-9]{1,8}\\.[0-9]{1,8}\\.[0-9]{1,8}(?:-[0-9A-Za-z.-]{1,40})?$");
    private static final Pattern SHA256 = Pattern.compile("^[a-f0-9]{64}$");

    public RegistryReleaseRef {
        if (!CONTRACT.equals(contract)
                || !matches(ID, packageId)
                || !matches(VERSION, version)
                || !matches(SHA256, sha256)
                || !("published".equals(state) || "deprecated".equals(state))
                || publishedAt == null) {
            throw invalid();
        }
        try {
            OffsetDateTime.parse(publishedAt);
        } catch (DateTimeParseException ex) {
            throw invalid();
        }
    }

    private static boolean matches(Pattern pattern, String value) {
        return value != null && pattern.matcher(value).matches();
    }

    static IllegalArgumentException invalid() {
        return new IllegalArgumentException("BLACKWHI_STORE_CATALOG_INVALID");
    }
}
