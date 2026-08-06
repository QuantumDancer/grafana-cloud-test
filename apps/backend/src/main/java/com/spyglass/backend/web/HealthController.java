package com.spyglass.backend.web;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** GET /api/health — a cheap liveness/readiness endpoint that does no database work whatsoever,
 *  independent of Spring Boot Actuator's own /actuator/health (which does check the DB and would
 *  report DOWN during a slow migration or DB blip). Grafana Cloud Synthetic Monitoring and any
 *  Kubernetes probes should point here specifically so a database hiccup doesn't also take the
 *  pod's liveness probe down with it — the app process itself is what "alive" means. */
@RestController
public class HealthController {

    @GetMapping("/api/health")
    public Map<String, String> health() {
        return Map.of("status", "UP");
    }
}
