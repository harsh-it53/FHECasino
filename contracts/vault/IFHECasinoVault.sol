// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IFHECasinoVault {
    function recordWager(address player) external payable;

    function reserveLiquidity(bytes32 sessionId, uint256 amount) external;

    function releaseLiquidity(bytes32 sessionId) external;

    function payout(bytes32 sessionId, address payable player, uint256 amount) external;

    function recordHouseFee(uint256 amount) external;

    function availableLiquidity() external view returns (uint256);
}

