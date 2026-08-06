package com.spyglass.backend.repository;

import com.spyglass.backend.domain.Product;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface ProductRepository extends JpaRepository<Product, Long> {

    /** FAULT_SLOW_SEARCH = ON. Name matching is always a plain unanchored ILIKE (it's not the
     *  point of this fault and the products table is small); the description half of the OR,
     *  though, is the deliberately slow bit: `description ILIKE '%term%'` has a wildcard on
     *  both sides, so Postgres can't use the idx_products_description_prefix btree index (or
     *  any btree index) and falls back to a sequential scan of every row's description. Casts
     *  on the nullable params avoid Postgres's "could not determine data type of parameter"
     *  error for native queries when a bind value is null. */
    @Query(
        value = """
            SELECT * FROM products
            WHERE (CAST(:category AS text) IS NULL OR category = CAST(:category AS text))
              AND (CAST(:search AS text) IS NULL
                   OR name ILIKE CONCAT('%', CAST(:search AS text), '%')
                   OR description ILIKE CONCAT('%', CAST(:search AS text), '%'))
            """,
        countQuery = """
            SELECT count(*) FROM products
            WHERE (CAST(:category AS text) IS NULL OR category = CAST(:category AS text))
              AND (CAST(:search AS text) IS NULL
                   OR name ILIKE CONCAT('%', CAST(:search AS text), '%')
                   OR description ILIKE CONCAT('%', CAST(:search AS text), '%'))
            """,
        nativeQuery = true)
    Page<Product> searchSlow(@Param("category") String category, @Param("search") String search, Pageable pageable);

    /** FAULT_SLOW_SEARCH = OFF. Same result shape, but the description predicate is anchored
     *  (`lower(description) LIKE 'term%'`) — a prefix match Postgres's planner can and does
     *  serve from idx_products_description_prefix instead of scanning the whole table. The
     *  trade-off this demonstrates is real: anchored search only finds matches at the *start*
     *  of the description, so it's a fast/thorough trade-off, not a free lunch. */
    @Query(
        value = """
            SELECT * FROM products
            WHERE (CAST(:category AS text) IS NULL OR category = CAST(:category AS text))
              AND (CAST(:search AS text) IS NULL
                   OR name ILIKE CONCAT('%', CAST(:search AS text), '%')
                   OR lower(description) LIKE lower(CONCAT(CAST(:search AS text), '%')))
            """,
        countQuery = """
            SELECT count(*) FROM products
            WHERE (CAST(:category AS text) IS NULL OR category = CAST(:category AS text))
              AND (CAST(:search AS text) IS NULL
                   OR name ILIKE CONCAT('%', CAST(:search AS text), '%')
                   OR lower(description) LIKE lower(CONCAT(CAST(:search AS text), '%')))
            """,
        nativeQuery = true)
    Page<Product> searchFast(@Param("category") String category, @Param("search") String search, Pageable pageable);

    /** Row-level lock for the checkout path: without it, two concurrent checkouts racing on the
     *  same low-stock product could both read stock=1, both decide "enough," and both commit,
     *  overselling it. PESSIMISTIC_WRITE takes a SELECT ... FOR UPDATE row lock for the
     *  duration of the enclosing transaction, serializing concurrent checkouts of the same
     *  product — a realistic thing for Database Observability to show as lock wait time under
     *  synthetic load. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Product p WHERE p.id = :id")
    Optional<Product> findByIdForUpdate(@Param("id") Long id);
}
