package com.spyglass.backend.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.spyglass.backend.domain.Product;
import com.spyglass.backend.domain.ProductCategory;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Real-Postgres coverage for FAULT_SLOW_SEARCH's actual query semantics — the whole reason the
 *  brief rules out H2 here is that ILIKE, text_pattern_ops, and the anchored-vs-unanchored
 *  distinction are genuine Postgres behavior, not something an in-memory substitute reproduces
 *  faithfully. Requires Docker; see class-level Assumption below. Run with
 *  `./mvnw verify -Dgroups=integration` (or just `verify`, which runs everything Docker allows).
 */
@Tag("integration")
@Testcontainers
@SpringBootTest
class ProductRepositorySearchIntegrationTest {

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
        // Skip (not fail) this class entirely when Docker isn't available in the current
        // environment, per the brief's instruction for environments without Docker.
        assumeTrue(DockerClientFactory.instance().isDockerAvailable(), "Docker is required for this test");
    }

    @Autowired
    private ProductRepository productRepository;

    @Test
    void slowAndFastSearchAgreeOnAPrefixMatchAgainstDescription() {
        // A prefix match is the one shape both the anchored (fast) and unanchored (slow) query
        // can find, so it's the right case to assert they agree on *correctness* even though
        // their performance characteristics differ (that difference is the point of the fault,
        // not something a functional test can observe from row counts).
        Product telescope = persist("Test Telescope", "A pristine wide-field refractor for deep-sky work.",
            ProductCategory.TELESCOPE, 100, 90);

        var slowResults = productRepository.searchSlow(null, "pristine", PageRequest.of(0, 20));
        var fastResults = productRepository.searchFast(null, "pristine", PageRequest.of(0, 20));

        assertThat(slowResults.getContent()).extracting(Product::getId).contains(telescope.getId());
        assertThat(fastResults.getContent()).extracting(Product::getId).contains(telescope.getId());
    }

    @Test
    void onlyTheUnanchoredSlowPathFindsAMidStringMatch() {
        // This is the anchored/unanchored trade-off made concrete: "pretentious" appears
        // mid-word in the description below (not at the start), so only the unanchored
        // ILIKE '%term%' query can find it — the anchored fast path is not a strictly-better
        // replacement, it trades that coverage for speed.
        Product binoculars = persist("Test Binoculars", "Compact and unpretentious binoculars for travel.",
            ProductCategory.BINOCULARS, 10, 42);

        var slowResults = productRepository.searchSlow(null, "pretentious", PageRequest.of(0, 20));
        var fastResults = productRepository.searchFast(null, "pretentious", PageRequest.of(0, 20));

        assertThat(slowResults.getContent()).extracting(Product::getId).contains(binoculars.getId());
        assertThat(fastResults.getContent()).extracting(Product::getId).doesNotContain(binoculars.getId());
    }

    @Autowired
    private jakarta.persistence.EntityManager entityManager;

    private Product persist(String name, String description, ProductCategory category, int magnification, int apertureMm) {
        Product product = new Product(name, description, category, magnification, apertureMm, 10_000, 5, OffsetDateTime.now());
        entityManager.persist(product);
        entityManager.flush();
        return product;
    }
}
