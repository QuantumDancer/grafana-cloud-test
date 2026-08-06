package com.spyglass.backend.web.dto;

/** Catalog list/search row shape — deliberately lighter than {@link ProductDetailDto} (no
 *  description) since a search results page doesn't need the full text. */
public record ProductSummaryDto(
    Long id,
    String name,
    String category,
    Integer magnification,
    Integer apertureMm,
    long priceCents,
    int stock
) {
}
