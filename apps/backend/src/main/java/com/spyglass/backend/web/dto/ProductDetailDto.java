package com.spyglass.backend.web.dto;

public record ProductDetailDto(
    Long id,
    String name,
    String description,
    String category,
    Integer magnification,
    Integer apertureMm,
    long priceCents,
    int stock
) {
}
