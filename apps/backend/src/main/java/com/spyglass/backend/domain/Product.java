package com.spyglass.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** A piece of observation gear: telescope, binoculars, or magnifier. Plain mutable entity (no
 *  Lombok, no records) — JPA entities need a no-arg constructor and mutable state for the
 *  persistence context to manage, so a record would fight the framework rather than help. */
@Entity
@Table(name = "products")
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProductCategory category;

    /** Null is meaningless for telescopes/binoculars but expected for magnifiers, which are
     *  described by magnification alone. */
    private Integer magnification;

    /** Null for magnifiers — loupes have no optical aperture in the telescope/binoculars sense. */
    @Column(name = "aperture_mm")
    private Integer apertureMm;

    @Column(name = "price_cents", nullable = false)
    private long priceCents;

    @Column(nullable = false)
    private int stock;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected Product() {
        // JPA
    }

    /** The app itself never creates products (the catalog is entirely Flyway-seeded — see
     *  V2__seed_products.sql), but tests need a way to insert one directly against a real
     *  Postgres without going through that SQL generator. */
    public Product(String name, String description, ProductCategory category, Integer magnification,
                    Integer apertureMm, long priceCents, int stock, OffsetDateTime createdAt) {
        this.name = name;
        this.description = description;
        this.category = category;
        this.magnification = magnification;
        this.apertureMm = apertureMm;
        this.priceCents = priceCents;
        this.stock = stock;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public ProductCategory getCategory() {
        return category;
    }

    public Integer getMagnification() {
        return magnification;
    }

    public Integer getApertureMm() {
        return apertureMm;
    }

    public long getPriceCents() {
        return priceCents;
    }

    public int getStock() {
        return stock;
    }

    public void setStock(int stock) {
        this.stock = stock;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
