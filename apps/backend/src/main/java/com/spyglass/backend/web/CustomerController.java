package com.spyglass.backend.web;

import com.spyglass.backend.service.CustomerOrderService;
import com.spyglass.backend.web.dto.OrderResponse;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CustomerController {

    private final CustomerOrderService customerOrderService;

    public CustomerController(CustomerOrderService customerOrderService) {
        this.customerOrderService = customerOrderService;
    }

    @GetMapping("/api/customers/{id}/orders")
    public List<OrderResponse> getOrders(@PathVariable Long id) {
        return customerOrderService.getOrderHistory(id);
    }
}
