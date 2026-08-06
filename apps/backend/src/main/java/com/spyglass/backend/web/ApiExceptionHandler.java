package com.spyglass.backend.web;

import com.spyglass.backend.service.NotFoundException;
import com.spyglass.backend.service.OutOfStockException;
import com.spyglass.backend.service.PaymentProviderException;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Translates the service-layer exceptions into the JSON error bodies the brief's REST contract
 *  implies (409 for out-of-stock, 500 for the simulated payment fault, 404 for missing
 *  customers/products). Unhandled exceptions still fall through to Spring Boot's default error
 *  handling, which already returns a sensible 500 JSON body — no handler needed for those. */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(OutOfStockException.class)
    public ResponseEntity<Map<String, String>> handleOutOfStock(OutOfStockException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(NotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(PaymentProviderException.class)
    public ResponseEntity<Map<String, String>> handlePaymentProviderFailure(PaymentProviderException ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", ex.getMessage()));
    }
}
