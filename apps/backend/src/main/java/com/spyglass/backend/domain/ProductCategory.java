package com.spyglass.backend.domain;

/** The three kinds of observation gear Spyglass sells. Stored as the enum's own name (e.g.
 *  "TELESCOPE") via {@code @Enumerated(EnumType.STRING)} so the database CHECK constraint in
 *  V1__schema.sql and this enum have to be kept in sync by hand — acceptable for a fixed,
 *  rarely-changing domain vocabulary. */
public enum ProductCategory {
    TELESCOPE,
    BINOCULARS,
    MAGNIFIER
}
