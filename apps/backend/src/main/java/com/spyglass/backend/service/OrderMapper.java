package com.spyglass.backend.service;

import com.spyglass.backend.domain.Order;
import com.spyglass.backend.domain.OrderItem;
import com.spyglass.backend.web.dto.OrderItemResponse;
import com.spyglass.backend.web.dto.OrderResponse;
import java.util.List;

/** Shared Order -> OrderResponse mapping used by both OrderService (checkout response) and
 *  CustomerOrderService (order history) — pulled out because both need the exact same shape,
 *  not as a general-purpose abstraction layer. Requires items/products to already be loaded
 *  (either via fetch join or via the N+1 loop having touched them); it never triggers lazy
 *  loading itself, so calling it outside an open persistence context is safe either way. */
final class OrderMapper {

    private OrderMapper() {
    }

    static OrderResponse toResponse(Order order) {
        List<OrderItemResponse> items = order.getItems().stream()
            .map(OrderMapper::toItemResponse)
            .toList();
        return new OrderResponse(
            order.getId(),
            order.getCustomer().getId(),
            order.getStatus().name(),
            order.getTotalCents(),
            order.getCreatedAt(),
            items);
    }

    private static OrderItemResponse toItemResponse(OrderItem item) {
        return new OrderItemResponse(
            item.getProduct().getId(),
            item.getProduct().getName(),
            item.getQuantity(),
            item.getUnitPriceCents());
    }
}
