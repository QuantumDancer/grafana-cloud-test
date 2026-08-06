package com.spyglass.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.spyglass.backend.repository.ProductRepository;
import com.spyglass.backend.web.dto.OrderItemRequest;
import com.spyglass.backend.web.dto.OrderRequest;
import com.spyglass.backend.web.dto.OrderResponse;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Service-level coverage against the real, fully-seeded schema (Flyway migrations run for real
 *  here — including the ~1,000/~10,000/~100,000-row seed — via Testcontainers Postgres).
 *  Requires Docker; see class-level Assumption below. */
@Tag("integration")
@Testcontainers
@SpringBootTest
class OrderCheckoutIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:18");

    @DynamicPropertySource
    static void datasourceProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @BeforeAll
    static void dockerRequired() {
        assumeTrue(DockerClientFactory.instance().isDockerAvailable(), "Docker is required for this test");
    }

    @Autowired
    private OrderService orderService;

    @Autowired
    private CustomerOrderService customerOrderService;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private com.spyglass.backend.fault.FaultProperties faultProperties;

    @Test
    void checkoutDecrementsStockAndReturnsTheOrder() {
        var product = productRepository.findAll().stream()
            .filter(p -> p.getStock() >= 2)
            .findFirst()
            .orElseThrow();
        int stockBefore = product.getStock();

        OrderRequest request = new OrderRequest(1L, List.of(new OrderItemRequest(product.getId(), 2)));
        OrderResponse response = orderService.checkout(request);

        assertThat(response.items()).hasSize(1);
        assertThat(response.items().get(0).quantity()).isEqualTo(2);
        int stockAfter = productRepository.findById(product.getId()).orElseThrow().getStock();
        assertThat(stockAfter).isEqualTo(stockBefore - 2);
    }

    @Test
    void checkoutRejectsAnOrderThatExceedsAvailableStock() {
        var outOfStockProduct = productRepository.findAll().stream()
            .filter(p -> p.getStock() == 0)
            .findFirst()
            .orElseThrow();

        OrderRequest request = new OrderRequest(1L, List.of(new OrderItemRequest(outOfStockProduct.getId(), 1)));

        assertThatThrownBy(() -> orderService.checkout(request))
            .isInstanceOf(OutOfStockException.class);
    }

    @Test
    void nPlusOneAndFetchJoinPathsReturnTheSameOrderHistory() {
        // Same customer, same underlying data, only FAULT_N_PLUS_ONE's code path differs — the
        // two should be indistinguishable from the API's point of view even though one issues
        // far more SQL to get there (see CustomerOrderServiceFetchPathTest for the query-count
        // side of that story, which Mockito can observe more directly than this real-DB test).
        Long customerId = 1L;
        // Ensure this customer has at least one order to compare, independent of seed placement.
        var seedProduct = productRepository.findAll().stream().filter(p -> p.getStock() >= 1).findFirst().orElseThrow();
        orderService.checkout(new OrderRequest(customerId, List.of(new OrderItemRequest(seedProduct.getId(), 1))));

        // Flip the fault on the real (proxied) CustomerOrderService bean so @Transactional
        // still applies to the N+1 path's lazy-loading loop — a manually `new`-ed service
        // instance would bypass Spring's transactional proxy entirely and blow up with
        // LazyInitializationException outside any session.
        faultProperties.setNPlusOne(true);
        var nPlusOneResult = customerOrderService.getOrderHistory(customerId);

        faultProperties.setNPlusOne(false);
        var fetchJoinResult = customerOrderService.getOrderHistory(customerId);

        assertThat(nPlusOneResult).usingRecursiveComparison().ignoringCollectionOrder()
            .isEqualTo(fetchJoinResult);
    }
}
