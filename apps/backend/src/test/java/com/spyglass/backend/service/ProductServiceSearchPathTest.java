package com.spyglass.backend.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import com.spyglass.backend.fault.FaultProperties;
import com.spyglass.backend.repository.ProductRepository;
import com.spyglass.backend.repository.ReviewRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;

/** Verifies ProductService picks ProductRepository.searchSlow vs. searchFast strictly based on
 *  FaultProperties.slowSearch, with no real database involved — the query *shapes* themselves
 *  (and that they return the same rows against real Postgres) are covered separately by
 *  ProductRepositorySearchIntegrationTest. */
class ProductServiceSearchPathTest {

    private final ProductRepository productRepository = mock(ProductRepository.class);
    private final ReviewRepository reviewRepository = mock(ReviewRepository.class);

    @Test
    void usesSlowSearchWhenFaultIsOn() {
        FaultProperties properties = new FaultProperties();
        properties.setSlowSearch(true);
        when(productRepository.searchSlow(any(), any(), any())).thenReturn(emptyPage());
        ProductService service = new ProductService(productRepository, reviewRepository, properties);

        service.search("refractor", null, 0);

        verify(productRepository).searchSlow(isNull(), eq("refractor"), any());
        verifyNoMoreInteractions(productRepository);
    }

    @Test
    void usesFastSearchWhenFaultIsOff() {
        FaultProperties properties = new FaultProperties();
        properties.setSlowSearch(false);
        when(productRepository.searchFast(any(), any(), any())).thenReturn(emptyPage());
        ProductService service = new ProductService(productRepository, reviewRepository, properties);

        service.search("refractor", null, 0);

        verify(productRepository).searchFast(isNull(), eq("refractor"), any());
        verifyNoMoreInteractions(productRepository);
    }

    @Test
    void unrecognizedCategoryIsTreatedAsNoFilterRatherThanRejected() {
        FaultProperties properties = new FaultProperties();
        properties.setSlowSearch(true);
        when(productRepository.searchSlow(any(), any(), any())).thenReturn(emptyPage());
        ProductService service = new ProductService(productRepository, reviewRepository, properties);

        service.search(null, "not-a-real-category", 0);

        verify(productRepository).searchSlow(isNull(), isNull(), any());
    }

    private static Page<com.spyglass.backend.domain.Product> emptyPage() {
        return new PageImpl<>(java.util.List.of());
    }
}
