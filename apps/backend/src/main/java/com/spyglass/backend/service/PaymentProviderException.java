package com.spyglass.backend.service;

/** FAULT_CHECKOUT_ERRORS: a simulated failure from a (fictional) third-party payment provider.
 *  Mapped to HTTP 500 by ApiExceptionHandler. See OrderService.checkout for why this is thrown
 *  from outside the order's own transaction rather than inside it. */
public class PaymentProviderException extends RuntimeException {
    public PaymentProviderException(String message) {
        super(message);
    }
}
