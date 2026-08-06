package com.spyglass.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "reviews")
public class Review {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(name = "author_name", nullable = false)
    private String authorName;

    @Column(nullable = false)
    private int rating;

    @Column(nullable = false)
    private String text;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected Review() {
        // JPA
    }

    public Long getId() {
        return id;
    }

    public Product getProduct() {
        return product;
    }

    public String getAuthorName() {
        return authorName;
    }

    public int getRating() {
        return rating;
    }

    public String getText() {
        return text;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
