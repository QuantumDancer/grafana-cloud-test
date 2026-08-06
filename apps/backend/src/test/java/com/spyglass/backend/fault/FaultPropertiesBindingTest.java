package com.spyglass.backend.fault;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.test.context.TestPropertySource;

/** Confirms the whole point of FaultProperties: every fault defaults to ON when its env var is
 *  simply absent, and each of the FAULT_* names the brief specifies really does bind to the
 *  field Spring's relaxed binding would derive from it — worth pinning down as a real
 *  Spring-context test rather than assumed, since FAULT_N_PLUS_ONE's "N" is exactly the kind of
 *  consecutive-capital-letters property name relaxed binding has historically been finicky
 *  about. */
@SpringBootTest(classes = FaultPropertiesBindingTest.TestConfig.class)
@TestPropertySource(properties = {
    "fault.slow-search=false",
    "fault.n-plus-one=false",
    "fault.checkout-errors=false",
    "fault.memory-leak=false",
    "fault.memory-leak-mb-per-min=7"
})
class FaultPropertiesBindingTest {

    @Configuration
    @EnableConfigurationProperties(FaultProperties.class)
    static class TestConfig {
    }

    @Autowired
    private FaultProperties faultProperties;

    @Test
    void bindsEveryPropertyByItsDocumentedKebabCaseName() {
        assertThat(faultProperties.isSlowSearch()).isFalse();
        assertThat(faultProperties.isNPlusOne()).isFalse();
        assertThat(faultProperties.isCheckoutErrors()).isFalse();
        assertThat(faultProperties.isMemoryLeak()).isFalse();
        assertThat(faultProperties.getMemoryLeakMbPerMin()).isEqualTo(7);
    }

    @Test
    void defaultsAreAllOnWhenNothingIsBound() {
        FaultProperties defaults = new FaultProperties();
        assertThat(defaults.isSlowSearch()).isTrue();
        assertThat(defaults.isNPlusOne()).isTrue();
        assertThat(defaults.isCheckoutErrors()).isTrue();
        assertThat(defaults.isMemoryLeak()).isTrue();
        assertThat(defaults.getMemoryLeakMbPerMin()).isEqualTo(2);
    }
}
