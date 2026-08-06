package com.spyglass.backend.web.dto;

import java.time.OffsetDateTime;
import java.util.List;

public record OrderResponse(
    Long id,
    Long customerId,
    String status,
    long totalCents,
    OffsetDateTime createdAt,
    List<OrderItemResponse> items
) {
}
