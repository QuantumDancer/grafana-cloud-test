package com.spyglass.backend.service;

import com.spyglass.backend.domain.Product;
import com.spyglass.backend.domain.ProductCategory;
import com.spyglass.backend.fault.FaultProperties;
import com.spyglass.backend.repository.ProductRepository;
import com.spyglass.backend.repository.ReviewRepository;
import com.spyglass.backend.web.dto.ProductDetailDto;
import com.spyglass.backend.web.dto.ProductSummaryDto;
import com.spyglass.backend.web.dto.ReviewDto;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ProductService {

    private static final int PAGE_SIZE = 20;

    private final ProductRepository productRepository;
    private final ReviewRepository reviewRepository;
    private final FaultProperties faultProperties;

    public ProductService(ProductRepository productRepository, ReviewRepository reviewRepository,
                           FaultProperties faultProperties) {
        this.productRepository = productRepository;
        this.reviewRepository = reviewRepository;
        this.faultProperties = faultProperties;
    }

    public Page<ProductSummaryDto> search(String search, String category, int page) {
        String normalizedCategory = normalizeCategory(category);
        Pageable pageable = PageRequest.of(Math.max(page, 0), PAGE_SIZE);

        // FAULT_SLOW_SEARCH picks which query shape runs; see ProductRepository for what
        // actually differs between the two (an unanchored vs. anchored ILIKE on description).
        Page<Product> products = faultProperties.isSlowSearch()
            ? productRepository.searchSlow(normalizedCategory, search, pageable)
            : productRepository.searchFast(normalizedCategory, search, pageable);

        return products.map(ProductService::toSummary);
    }

    public ProductDetailDto getById(Long id) {
        Product product = productRepository.findById(id)
            .orElseThrow(() -> new NotFoundException("No product with id " + id));
        return toDetail(product);
    }

    public List<ReviewDto> getReviews(Long productId) {
        if (!productRepository.existsById(productId)) {
            throw new NotFoundException("No product with id " + productId);
        }
        return reviewRepository.findByProductIdOrderByCreatedAtDesc(productId).stream()
            .map(r -> new ReviewDto(r.getId(), r.getAuthorName(), r.getRating(), r.getText(), r.getCreatedAt()))
            .toList();
    }

    /** The REST layer accepts case-insensitive category names (e.g. "telescope"); translate to
     *  the enum's stored form, or null (meaning "no filter") for blank/unrecognized input. */
    private static String normalizeCategory(String category) {
        if (category == null || category.isBlank()) {
            return null;
        }
        try {
            return ProductCategory.valueOf(category.trim().toUpperCase()).name();
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static ProductSummaryDto toSummary(Product p) {
        return new ProductSummaryDto(
            p.getId(), p.getName(), p.getCategory().name(),
            p.getMagnification(), p.getApertureMm(), p.getPriceCents(), p.getStock());
    }

    private static ProductDetailDto toDetail(Product p) {
        return new ProductDetailDto(
            p.getId(), p.getName(), p.getDescription(), p.getCategory().name(),
            p.getMagnification(), p.getApertureMm(), p.getPriceCents(), p.getStock());
    }
}
