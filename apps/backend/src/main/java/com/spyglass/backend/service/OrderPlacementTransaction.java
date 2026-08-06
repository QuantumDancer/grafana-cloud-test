package com.spyglass.backend.service;

import com.spyglass.backend.domain.Customer;
import com.spyglass.backend.domain.Order;
import com.spyglass.backend.domain.OrderItem;
import com.spyglass.backend.domain.OrderStatus;
import com.spyglass.backend.domain.Product;
import com.spyglass.backend.repository.CustomerRepository;
import com.spyglass.backend.repository.OrderRepository;
import com.spyglass.backend.repository.ProductRepository;
import com.spyglass.backend.web.dto.OrderItemRequest;
import com.spyglass.backend.web.dto.OrderRequest;
import java.time.OffsetDateTime;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** The actual database work behind a checkout, split into its own bean (rather than a private
 *  method on OrderService) so it can carry its own {@code @Transactional} boundary. That
 *  boundary matters for FAULT_CHECKOUT_ERRORS: OrderService calls {@link #place} and lets it
 *  commit *before* rolling the dice on a simulated payment failure, so a trace shows real,
 *  successful DB spans followed by an application-level error rather than a rolled-back
 *  transaction. A {@code @Transactional} method called via plain {@code this.place(...)} from
 *  the same class would skip Spring's proxy and silently run non-transactionally — hence the
 *  separate bean instead of a private method on OrderService. */
@Component
class OrderPlacementTransaction {

    private final CustomerRepository customerRepository;
    private final ProductRepository productRepository;
    private final OrderRepository orderRepository;

    OrderPlacementTransaction(CustomerRepository customerRepository, ProductRepository productRepository,
                              OrderRepository orderRepository) {
        this.customerRepository = customerRepository;
        this.productRepository = productRepository;
        this.orderRepository = orderRepository;
    }

    @Transactional
    Order place(OrderRequest request) {
        Customer customer = customerRepository.findById(request.customerId())
            .orElseThrow(() -> new NotFoundException("No customer with id " + request.customerId()));

        Order order = new Order(customer, OrderStatus.COMPLETED, OffsetDateTime.now());
        long totalCents = 0;

        for (OrderItemRequest itemRequest : request.items()) {
            // Locks the product row for the rest of this transaction (see
            // ProductRepository.findByIdForUpdate) so two concurrent checkouts against the same
            // low-stock product can't both pass the stock check before either decrements it.
            Product product = productRepository.findByIdForUpdate(itemRequest.productId())
                .orElseThrow(() -> new NotFoundException("No product with id " + itemRequest.productId()));

            if (product.getStock() < itemRequest.quantity()) {
                throw new OutOfStockException(
                    "Product " + product.getId() + " (" + product.getName() + ") has only "
                        + product.getStock() + " in stock, requested " + itemRequest.quantity());
            }

            product.setStock(product.getStock() - itemRequest.quantity());
            order.addItem(new OrderItem(product, itemRequest.quantity(), product.getPriceCents()));
            totalCents += product.getPriceCents() * itemRequest.quantity();
        }

        order.setTotalCents(totalCents);
        return orderRepository.save(order);
    }
}
