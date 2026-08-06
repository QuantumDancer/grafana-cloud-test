package com.spyglass.backend.fault;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Unit tests for the leak-rate math (bytesForTick) and the toggle itself, without waiting on
 *  the real 10-second @Scheduled tick. */
class MemoryLeakSimulatorTest {

    @Test
    void oneMbPerMinuteOverATenSecondTickIsOneSixthOfAMegabyte() {
        int bytes = MemoryLeakSimulator.bytesForTick(1, 10_000);
        assertThat(bytes).isEqualTo((1024 * 1024) / 6);
    }

    @Test
    void zeroMbPerMinuteLeaksNothing() {
        assertThat(MemoryLeakSimulator.bytesForTick(0, 10_000)).isZero();
    }

    @Test
    void rateScalesApproximatelyLinearlyWithConfiguredMbPerMinute() {
        // "Approximately" because bytesForTick does integer division (bytes-per-minute * tick
        // length / 60_000) — computing 5 MB/min directly truncates at a different point than
        // computing 1 MB/min and multiplying by 5 afterward, so the two aren't bit-for-bit
        // equal, only within a rounding error of a few bytes.
        int oneMb = MemoryLeakSimulator.bytesForTick(1, 10_000);
        int fiveMb = MemoryLeakSimulator.bytesForTick(5, 10_000);
        assertThat(fiveMb).isCloseTo(oneMb * 5, org.assertj.core.data.Offset.offset(10));
    }

    @Test
    void tickAppendsAChunkWhenFaultIsOn() {
        FaultProperties properties = new FaultProperties();
        properties.setMemoryLeak(true);
        properties.setMemoryLeakMbPerMin(2);
        MemoryLeakSimulator simulator = new MemoryLeakSimulator(properties);

        simulator.tickForTest();
        simulator.tickForTest();

        assertThat(simulator.leakedChunkCount()).isEqualTo(2);
    }

    @Test
    void tickAppendsNothingWhenFaultIsOff() {
        FaultProperties properties = new FaultProperties();
        properties.setMemoryLeak(false);
        MemoryLeakSimulator simulator = new MemoryLeakSimulator(properties);

        simulator.tickForTest();

        assertThat(simulator.leakedChunkCount()).isZero();
    }
}
