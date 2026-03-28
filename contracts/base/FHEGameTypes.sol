// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

enum SessionStatus {
    NONE,
    ACTIVE,
    WON,
    LOST,
    CASHED_OUT,
    PUSH
}

struct GameSession {
    address player;
    uint128 wager;
    uint128 reservedAmount;
    uint128 grossPayout;
    uint128 netPayout;
    uint128 houseFee;
    uint64 nonce;
    uint40 startedAt;
    uint40 settledAt;
    SessionStatus status;
}

