package com.spyglass.backend.domain;

/** Deliberately just one terminal state for this demo — Spyglass models a single-step checkout
 *  (see OrderService), not a multi-stage fulfillment workflow, so there is nothing between
 *  "doesn't exist yet" and COMPLETED to represent. */
public enum OrderStatus {
    COMPLETED
}
