package com.spyglass.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.spyglass.backend.fault.FaultProperties;
import java.util.Random;
import org.junit.jupiter.api.Test;

/** FAULT_CHECKOUT_ERRORS rate mechanics, isolated from the real DB work and from real
 *  randomness: an injected mock Random gives us full control over exactly which side of the 2%
 *  threshold each check falls on. */
class OrderServiceCheckoutFaultTest {

    private final OrderPlacementTransaction placement = mock(OrderPlacementTransaction.class);

    @Test
    void neverSimulatesFailureWhenFaultIsOff() {
        FaultProperties properties = new FaultProperties();
        properties.setCheckoutErrors(false);
        Random alwaysFails = mock(Random.class);
        when(alwaysFails.nextDouble()).thenReturn(0.0); // would trigger the fault if it were on
        OrderService orderService = new OrderService(placement, properties, alwaysFails);

        assertThat(orderService.shouldSimulatePaymentFailure()).isFalse();
    }

    @Test
    void triggersWhenTheDrawLandsBelowTheFailureRate() {
        FaultProperties properties = new FaultProperties();
        properties.setCheckoutErrors(true);
        Random random = mock(Random.class);
        when(random.nextDouble()).thenReturn(OrderService.CHECKOUT_FAILURE_RATE - 0.001);
        OrderService orderService = new OrderService(placement, properties, random);

        assertThat(orderService.shouldSimulatePaymentFailure()).isTrue();
    }

    @Test
    void staysQuietWhenTheDrawLandsAtOrAboveTheFailureRate() {
        FaultProperties properties = new FaultProperties();
        properties.setCheckoutErrors(true);
        Random random = mock(Random.class);
        when(random.nextDouble()).thenReturn(OrderService.CHECKOUT_FAILURE_RATE);
        OrderService orderService = new OrderService(placement, properties, random);

        assertThat(orderService.shouldSimulatePaymentFailure()).isFalse();
    }
}
