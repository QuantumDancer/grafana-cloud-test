package com.spyglass.backend.service;

/** A referenced id (customer, product, ...) doesn't exist. Mapped to HTTP 404. */
public class NotFoundException extends RuntimeException {
    public NotFoundException(String message) {
        super(message);
    }
}
