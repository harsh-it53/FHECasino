// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {FHEGameBase} from "../base/FHEGameBase.sol";
import {SessionStatus} from "../base/FHEGameTypes.sol";

contract MockFHEGame is FHEGameBase {
    uint256 public constant MAX_MOCK_GROSS_PAYOUT_MULTIPLIER = 3;

    event MockRoundStarted(bytes32 indexed sessionId, address indexed player, uint256 wager);
    event MockRoundSettled(
        bytes32 indexed sessionId,
        bool won,
        uint256 grossPayout,
        uint256 netPayout,
        uint256 houseFee
    );

    constructor(address initialOwner, address vaultAddress)
        FHEGameBase(initialOwner, vaultAddress, 100, 0.01 ether, 5 ether)
    {}

    function startMockRound() external payable whenNotPaused nonReentrant returns (bytes32 sessionId) {
        (sessionId,) = _beginSession(
            msg.sender,
            msg.value,
            msg.value * MAX_MOCK_GROSS_PAYOUT_MULTIPLIER
        );

        emit MockRoundStarted(sessionId, msg.sender, msg.value);
    }

    function settleMockRound(bytes32 sessionId, uint256 grossPayout, bool won)
        external
        onlyOwner
        nonReentrant
        returns (uint256 netPayout, uint256 houseFee)
    {
        SessionStatus status = won ? SessionStatus.WON : SessionStatus.LOST;
        (netPayout, houseFee) = _finalizeSession(sessionId, status, grossPayout);

        emit MockRoundSettled(sessionId, won, grossPayout, netPayout, houseFee);
    }
}
