package com.spyglass.backend.config;

import java.util.Random;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** A single shared {@link Random} bean so FAULT_CHECKOUT_ERRORS's dice roll is injectable — unit
 *  tests substitute a stubbed Random to assert the ~2% threshold logic deterministically instead
 *  of relying on statistics over many real checkouts. */
@Configuration
public class RandomConfig {

    @Bean
    public Random checkoutRandom() {
        return new Random();
    }
}
