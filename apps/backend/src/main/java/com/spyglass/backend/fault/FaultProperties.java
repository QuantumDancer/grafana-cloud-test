package com.spyglass.backend.fault;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** Central on/off switchboard for every planted fault, bound from {@code FAULT_*} env vars via
 *  Spring's relaxed binding (FAULT_SLOW_SEARCH -> fault.slow-search, and so on — the same
 *  convention as SPRING_DATASOURCE_URL -> spring.datasource.url). Every field defaults to
 *  {@code true}: an env var that is simply absent (the common case — this is a demo image meant
 *  to misbehave out of the box) leaves these Java defaults in place, so "ON" requires no
 *  configuration at all and "OFF" is an explicit opt-out per the brief. */
@Component
@ConfigurationProperties(prefix = "fault")
public class FaultProperties {

    private boolean slowSearch = true;
    private boolean nPlusOne = true;
    private boolean checkoutErrors = true;
    private boolean memoryLeak = true;

    /** MB appended to the in-memory leak per minute while FAULT_MEMORY_LEAK is on. Kept small by
     *  default (2 MB/min) so the pod takes hours, not minutes, to hit its memory limit and get
     *  restarted by the liveness probe — the whole point is a slow sawtooth, not a crash loop. */
    private int memoryLeakMbPerMin = 2;

    public boolean isSlowSearch() {
        return slowSearch;
    }

    public void setSlowSearch(boolean slowSearch) {
        this.slowSearch = slowSearch;
    }

    public boolean isNPlusOne() {
        return nPlusOne;
    }

    public void setNPlusOne(boolean nPlusOne) {
        this.nPlusOne = nPlusOne;
    }

    public boolean isCheckoutErrors() {
        return checkoutErrors;
    }

    public void setCheckoutErrors(boolean checkoutErrors) {
        this.checkoutErrors = checkoutErrors;
    }

    public boolean isMemoryLeak() {
        return memoryLeak;
    }

    public void setMemoryLeak(boolean memoryLeak) {
        this.memoryLeak = memoryLeak;
    }

    public int getMemoryLeakMbPerMin() {
        return memoryLeakMbPerMin;
    }

    public void setMemoryLeakMbPerMin(int memoryLeakMbPerMin) {
        this.memoryLeakMbPerMin = memoryLeakMbPerMin;
    }
}
