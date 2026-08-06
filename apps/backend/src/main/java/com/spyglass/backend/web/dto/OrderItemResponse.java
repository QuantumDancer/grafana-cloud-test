package com.spyglass.backend.web.dto;

public record OrderItemResponse(
    Long productId,
    String productName,
    int quantity,
    long unitPriceCents
) {
}
