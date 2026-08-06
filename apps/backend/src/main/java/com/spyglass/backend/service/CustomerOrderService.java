package com.spyglass.backend.service;

import com.spyglass.backend.domain.Order;
import com.spyglass.backend.fault.FaultProperties;
import com.spyglass.backend.repository.CustomerRepository;
import com.spyglass.backend.repository.OrderRepository;
import com.spyglass.backend.web.dto.OrderResponse;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class CustomerOrderService {

    private final CustomerRepository customerRepository;
    private final OrderRepository orderRepository;
    private final FaultProperties faultProperties;

    public CustomerOrderService(CustomerRepository customerRepository, OrderRepository orderRepository,
                                 FaultProperties faultProperties) {
        this.customerRepository = customerRepository;
        this.orderRepository = orderRepository;
        this.faultProperties = faultProperties;
    }

    public List<OrderResponse> getOrderHistory(Long customerId) {
        if (!customerRepository.existsById(customerId)) {
            throw new NotFoundException("No customer with id " + customerId);
        }

        List<Order> orders = faultProperties.isNPlusOne()
            ? loadWithNPlusOne(customerId)
            : orderRepository.findByCustomerIdWithItemsAndProducts(customerId);

        return orders.stream().map(OrderMapper::toResponse).toList();
    }

    /** FAULT_N_PLUS_ONE = ON: the "obviously correct, accidentally quadratic" version. The
     *  initial query fetches bare orders; `order.getItems()` and `item.getProduct()` are LAZY
     *  (see Order/OrderItem), so simply reading them here — the same code a developer would
     *  write without thinking about fetch strategy — fires one query per order for its items,
     *  then one query per item for its product. For a customer with O orders averaging I items
     *  each, that's 1 + O + O*I queries where the fetch-joined path (below, FAULT_N_PLUS_ONE=OFF)
     *  needs exactly one. This is the textbook N+1 problem, left in on purpose so traces show
     *  a long tail of near-identical child spans for a single API call. */
    private List<Order> loadWithNPlusOne(Long customerId) {
        List<Order> orders = orderRepository.findByCustomerIdOrderByCreatedAtDesc(customerId);
        for (Order order : orders) {
            order.getItems().forEach(item -> item.getProduct().getName());
        }
        return orders;
    }
}
