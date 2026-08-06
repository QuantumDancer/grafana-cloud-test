package com.spyglass.backend.web.dto;

import java.time.OffsetDateTime;

public record ReviewDto(
    Long id,
    String authorName,
    int rating,
    String text,
    OffsetDateTime createdAt
) {
}
