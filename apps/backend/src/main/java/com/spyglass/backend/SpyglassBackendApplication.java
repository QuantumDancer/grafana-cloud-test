package com.spyglass.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// @EnableScheduling powers FAULT_MEMORY_LEAK's periodic leak tick (see
// com.spyglass.backend.fault.MemoryLeakSimulator) — harmless overhead when that fault is
// toggled off, since the scheduled method just no-ops.
@SpringBootApplication
@EnableScheduling
public class SpyglassBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(SpyglassBackendApplication.class, args);
	}

}
