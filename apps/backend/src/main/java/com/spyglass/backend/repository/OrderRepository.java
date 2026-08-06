package com.spyglass.backend.repository;

import com.spyglass.backend.domain.Order;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrderRepository extends JpaRepository<Order, Long> {

    /** FAULT_N_PLUS_ONE = ON. Deliberately the "naive" repository call: it returns bare Order
     *  entities with their `items` and each item's `product` left LAZY. CustomerOrderService's
     *  slow path then walks the result and touches those lazy associations one order/item at a
     *  time, so this single query is really the first of 1 + N + M queries — see the service
     *  for the loop that produces the other N+M. */
    List<Order> findByCustomerIdOrderByCreatedAtDesc(Long customerId);

    /** FAULT_N_PLUS_ONE = OFF. One query, two JOIN FETCHes: order -> items -> product all
     *  arrive fully populated, so the service layer's mapping loop touches only already-loaded
     *  data and issues zero further SQL. DISTINCT guards against the row duplication a
     *  one-to-many fetch join produces (one row per order_item, not per order). */
    @Query("""
        SELECT DISTINCT o FROM Order o
        JOIN FETCH o.items i
        JOIN FETCH i.product
        WHERE o.customer.id = :customerId
        ORDER BY o.createdAt DESC
        """)
    List<Order> findByCustomerIdWithItemsAndProducts(@Param("customerId") Long customerId);
}
