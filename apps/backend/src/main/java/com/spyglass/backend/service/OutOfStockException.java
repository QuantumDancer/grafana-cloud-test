package com.spyglass.backend.service;

/** Thrown when a checkout item requests more units than are in stock. Mapped to HTTP 409
 *  Conflict by ApiExceptionHandler — a real client error (retrying immediately won't help until
 *  stock changes), distinct from the 5xx PaymentProviderException fault below it. */
public class OutOfStockException extends RuntimeException {
    public OutOfStockException(String message) {
        super(message);
    }
}
