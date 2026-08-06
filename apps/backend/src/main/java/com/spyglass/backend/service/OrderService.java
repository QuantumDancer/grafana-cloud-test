package com.spyglass.backend.service;

import com.spyglass.backend.domain.Order;
import com.spyglass.backend.fault.FaultProperties;
import com.spyglass.backend.web.dto.OrderRequest;
import com.spyglass.backend.web.dto.OrderResponse;
import java.util.Random;
import org.springframework.stereotype.Service;

@Service
public class OrderService {

    /** ~2% of checkouts fail with a simulated payment-provider error when FAULT_CHECKOUT_ERRORS
     *  is on. Chosen to be rare enough that error-rate dashboards/alerts read as "occasional
     *  flakiness" rather than "checkout is broken," but frequent enough to show up within a few
     *  minutes of synthetic load. */
    static final double CHECKOUT_FAILURE_RATE = 0.02;

    private final OrderPlacementTransaction placement;
    private final FaultProperties faultProperties;
    private final Random random;

    public OrderService(OrderPlacementTransaction placement, FaultProperties faultProperties, Random checkoutRandom) {
        this.placement = placement;
        this.faultProperties = faultProperties;
        this.random = checkoutRandom;
    }

    public OrderResponse checkout(OrderRequest request) {
        // `placement.place(...)` returns only once its own @Transactional method has committed
        // (see OrderPlacementTransaction) — so the fault check below runs strictly after the
        // real DB work, producing a trace with genuine successful spans followed by a request
        // that still ultimately fails. Contrast with throwing inside the transaction, which
        // would roll back and leave no trace of the (otherwise valid) order ever having existed.
        Order order = placement.place(request);

        // FAULT_CHECKOUT_ERRORS
        if (shouldSimulatePaymentFailure()) {
            throw new PaymentProviderException(
                "Payment provider returned HTTP 500 (simulated) for order " + order.getId());
        }

        return OrderMapper.toResponse(order);
    }

    boolean shouldSimulatePaymentFailure() {
        return faultProperties.isCheckoutErrors() && random.nextDouble() < CHECKOUT_FAILURE_RATE;
    }
}
