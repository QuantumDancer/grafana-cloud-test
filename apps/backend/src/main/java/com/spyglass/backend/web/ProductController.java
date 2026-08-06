package com.spyglass.backend.web;

import com.spyglass.backend.service.ProductService;
import com.spyglass.backend.web.dto.ProductDetailDto;
import com.spyglass.backend.web.dto.ProductSummaryDto;
import com.spyglass.backend.web.dto.ReviewDto;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ProductController {

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @GetMapping("/api/products")
    public Page<ProductSummaryDto> search(
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String category,
        @RequestParam(defaultValue = "0") int page) {
        return productService.search(search, category, page);
    }

    @GetMapping("/api/products/{id}")
    public ProductDetailDto getById(@PathVariable Long id) {
        return productService.getById(id);
    }

    @GetMapping("/api/products/{id}/reviews")
    public List<ReviewDto> getReviews(@PathVariable Long id) {
        return productService.getReviews(id);
    }
}
