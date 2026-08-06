package com.spyglass.backend.fault;

import java.util.ArrayList;
import java.util.List;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** FAULT_MEMORY_LEAK: a slow, deliberate heap leak.
 *
 *  Every tick this appends a byte[] chunk to {@link #leakedChunks} and never removes anything.
 *  Because this class is a singleton Spring bean that lives for the container's lifetime, a
 *  plain instance field leaks just as effectively as a {@code static} one would — no need for
 *  a static reference to keep this garbage-collector-proof.
 *
 *  The point of this fault is JVM telemetry, not a crash: tuned via
 *  {@code FAULT_MEMORY_LEAK_MB_PER_MIN} to grow heap usage slowly enough (a couple of MB/min by
 *  default) that it takes hours to approach the container's memory limit, at which point the
 *  liveness probe eventually fails and Kubernetes restarts the pod — producing the classic
 *  sawtooth memory graph rather than an immediate OOM kill. */
@Component
public class MemoryLeakSimulator {

    /** How often we top up the leak. Small ticks (rather than one huge allocation less often)
     *  make the growth curve smooth in the JVM memory graph instead of a staircase. */
    private static final long TICK_MILLIS = 10_000;

    private final FaultProperties faultProperties;
    private final List<byte[]> leakedChunks = new ArrayList<>();

    public MemoryLeakSimulator(FaultProperties faultProperties) {
        this.faultProperties = faultProperties;
    }

    @Scheduled(fixedRate = TICK_MILLIS)
    void tick() {
        if (!faultProperties.isMemoryLeak()) {
            return;
        }
        int chunkBytes = bytesForTick(faultProperties.getMemoryLeakMbPerMin(), TICK_MILLIS);
        if (chunkBytes > 0) {
            leakedChunks.add(new byte[chunkBytes]);
        }
    }

    /** Pure so it's trivially unit-testable without waiting on the scheduler: how many bytes
     *  should a single tick of length {@code tickMillis} contribute towards a target leak rate
     *  of {@code mbPerMin} megabytes per minute? */
    static int bytesForTick(int mbPerMin, long tickMillis) {
        long bytesPerMinute = (long) mbPerMin * 1024 * 1024;
        return (int) (bytesPerMinute * tickMillis / 60_000L);
    }

    /** Test-only hook so we can assert the list actually grows without waiting 10 seconds. */
    int leakedChunkCount() {
        return leakedChunks.size();
    }

    void tickForTest() {
        tick();
    }
}
