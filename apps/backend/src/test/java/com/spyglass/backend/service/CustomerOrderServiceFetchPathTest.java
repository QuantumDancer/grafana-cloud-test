package com.spyglass.backend.service;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.spyglass.backend.fault.FaultProperties;
import com.spyglass.backend.repository.CustomerRepository;
import com.spyglass.backend.repository.OrderRepository;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Verifies CustomerOrderService picks the N+1-prone repository method vs. the fetch-joined one
 *  strictly based on FaultProperties.nPlusOne. The N+1 loop itself only actually fires extra
 *  queries against real lazy proxies, which this Mockito-based test can't observe — that part is
 *  covered by OrderCheckoutIntegrationTest against a real Postgres via Testcontainers. */
class CustomerOrderServiceFetchPathTest {

    private final CustomerRepository customerRepository = mock(CustomerRepository.class);
    private final OrderRepository orderRepository = mock(OrderRepository.class);

    @Test
    void usesTheNaivePerOrderLookupWhenFaultIsOn() {
        FaultProperties properties = new FaultProperties();
        properties.setNPlusOne(true);
        when(customerRepository.existsById(1L)).thenReturn(true);
        when(orderRepository.findByCustomerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of());
        CustomerOrderService service = new CustomerOrderService(customerRepository, orderRepository, properties);

        service.getOrderHistory(1L);

        verify(orderRepository).findByCustomerIdOrderByCreatedAtDesc(eq(1L));
        verify(orderRepository, never()).findByCustomerIdWithItemsAndProducts(eq(1L));
    }

    @Test
    void usesTheFetchJoinedQueryWhenFaultIsOff() {
        FaultProperties properties = new FaultProperties();
        properties.setNPlusOne(false);
        when(customerRepository.existsById(1L)).thenReturn(true);
        when(orderRepository.findByCustomerIdWithItemsAndProducts(1L)).thenReturn(List.of());
        CustomerOrderService service = new CustomerOrderService(customerRepository, orderRepository, properties);

        service.getOrderHistory(1L);

        verify(orderRepository).findByCustomerIdWithItemsAndProducts(eq(1L));
        verify(orderRepository, never()).findByCustomerIdOrderByCreatedAtDesc(eq(1L));
    }

    @Test
    void unknownCustomerIsRejectedBeforeEitherQueryRuns() {
        FaultProperties properties = new FaultProperties();
        when(customerRepository.existsById(99L)).thenReturn(false);
        CustomerOrderService service = new CustomerOrderService(customerRepository, orderRepository, properties);

        org.junit.jupiter.api.Assertions.assertThrows(
            NotFoundException.class, () -> service.getOrderHistory(99L));
    }
}
