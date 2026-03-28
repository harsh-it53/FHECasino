// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {GameSession, SessionStatus} from "./FHEGameTypes.sol";
import {IFHECasinoVault} from "../vault/IFHECasinoVault.sol";

abstract contract FHEGameBase is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeCast for uint256;

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant MAX_HOUSE_EDGE_BPS = 500;

    error BetAmountOutOfRange(uint256 provided, uint256 minBet, uint256 maxBet);
    error ExistingActiveSession(address player, bytes32 sessionId);
    error InvalidBetLimits(uint256 minBet, uint256 maxBet);
    error InvalidHouseEdge(uint16 requestedBps);
    error InvalidMaxPayout(uint256 requested, uint256 wager);
    error InvalidSettlementStatus(SessionStatus status);
    error InvalidVault(address vault);
    error SessionNotActive(bytes32 sessionId, SessionStatus status);
    error SessionNotFound(bytes32 sessionId);
    error SessionPlayerMismatch(bytes32 sessionId, address expected, address actual);

    IFHECasinoVault public vault;
    uint16 public houseEdgeBps;
    uint256 public minBet;
    uint256 public maxBet;

    mapping(bytes32 => GameSession) public sessions;
    mapping(address => bytes32) public activeSessionIdByPlayer;
    mapping(address => uint64) private _nextSessionNonce;

    ebool internal ENCRYPTED_FALSE;
    ebool internal ENCRYPTED_TRUE;
    euint8 internal ENCRYPTED_ZERO_U8;
    euint8 internal ENCRYPTED_ONE_U8;
    euint32 internal ENCRYPTED_ZERO_U32;
    euint32 internal ENCRYPTED_ONE_U32;

    event BetLimitsUpdated(
        uint256 previousMinBet,
        uint256 previousMaxBet,
        uint256 newMinBet,
        uint256 newMaxBet
    );
    event HouseEdgeUpdated(uint16 previousBps, uint16 newBps);
    event SessionOpened(
        bytes32 indexed sessionId,
        address indexed player,
        uint256 wager,
        uint256 reservedAmount,
        uint64 nonce
    );
    event SessionSettled(
        bytes32 indexed sessionId,
        address indexed player,
        SessionStatus status,
        uint256 grossPayout,
        uint256 netPayout,
        uint256 houseFee
    );
    event VaultUpdated(address indexed previousVault, address indexed newVault);

    constructor(
        address initialOwner,
        address vaultAddress,
        uint16 initialHouseEdgeBps,
        uint256 initialMinBet,
        uint256 initialMaxBet
    ) Ownable(initialOwner) {
        _setVault(vaultAddress);
        _setHouseEdge(initialHouseEdgeBps);
        _setBetLimits(initialMinBet, initialMaxBet);
        _initializeEncryptedConstants();
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setVault(address newVault) external onlyOwner {
        _setVault(newVault);
    }

    function setHouseEdge(uint16 newHouseEdgeBps) external onlyOwner {
        _setHouseEdge(newHouseEdgeBps);
    }

    function setBetLimits(uint256 newMinBet, uint256 newMaxBet) external onlyOwner {
        _setBetLimits(newMinBet, newMaxBet);
    }

    function nextSessionNonce(address player) external view returns (uint64) {
        return _nextSessionNonce[player];
    }

    function _beginSession(address player, uint256 wager, uint256 maxGrossPayout)
        internal
        returns (bytes32 sessionId, GameSession storage session)
    {
        _validateWager(wager);

        if (maxGrossPayout < wager) {
            revert InvalidMaxPayout(maxGrossPayout, wager);
        }

        bytes32 activeSessionId = activeSessionIdByPlayer[player];
        if (activeSessionId != bytes32(0)) {
            revert ExistingActiveSession(player, activeSessionId);
        }

        uint64 nonce = _nextSessionNonce[player];
        _nextSessionNonce[player] = nonce + 1;

        sessionId = keccak256(abi.encode(block.chainid, address(this), player, nonce));
        activeSessionIdByPlayer[player] = sessionId;

        session = sessions[sessionId];
        session.player = player;
        session.wager = wager.toUint128();
        session.reservedAmount = maxGrossPayout.toUint128();
        session.nonce = nonce;
        session.startedAt = uint40(block.timestamp);
        session.status = SessionStatus.ACTIVE;

        vault.recordWager{value: wager}(player);
        vault.reserveLiquidity(sessionId, maxGrossPayout);

        emit SessionOpened(sessionId, player, wager, maxGrossPayout, nonce);
    }

    function _finalizeSession(bytes32 sessionId, SessionStatus status, uint256 grossPayout)
        internal
        returns (uint256 netPayout, uint256 houseFee)
    {
        if (status == SessionStatus.NONE || status == SessionStatus.ACTIVE) {
            revert InvalidSettlementStatus(status);
        }

        GameSession storage session = _requireActiveSession(sessionId);
        (netPayout, houseFee) = _applyHouseEdge(session.wager, grossPayout);

        session.grossPayout = grossPayout.toUint128();
        session.netPayout = netPayout.toUint128();
        session.houseFee = houseFee.toUint128();
        session.settledAt = uint40(block.timestamp);
        session.status = status;

        delete activeSessionIdByPlayer[session.player];

        if (houseFee > 0) {
            vault.recordHouseFee(houseFee);
        }

        if (netPayout > 0) {
            vault.payout(sessionId, payable(session.player), netPayout);
        } else {
            vault.releaseLiquidity(sessionId);
        }

        emit SessionSettled(sessionId, session.player, status, grossPayout, netPayout, houseFee);
    }

    function _validateSessionPlayer(bytes32 sessionId, address player) internal view returns (GameSession storage session) {
        session = sessions[sessionId];
        if (session.player == address(0)) {
            revert SessionNotFound(sessionId);
        }
        if (session.player != player) {
            revert SessionPlayerMismatch(sessionId, session.player, player);
        }
    }

    function _grantViewerAccess(address viewer, ebool ciphertext) internal {
        FHE.allowThis(ciphertext);
        FHE.allow(ciphertext, viewer);
    }

    function _grantViewerAccess(address viewer, euint8 ciphertext) internal {
        FHE.allowThis(ciphertext);
        FHE.allow(ciphertext, viewer);
    }

    function _grantViewerAccess(address viewer, euint32 ciphertext) internal {
        FHE.allowThis(ciphertext);
        FHE.allow(ciphertext, viewer);
    }

    function _scheduleDecryptForCaller(ebool ciphertext) internal {
        _grantViewerAccess(msg.sender, ciphertext);
        FHE.decrypt(ciphertext);
    }

    function _scheduleDecryptForCaller(euint8 ciphertext) internal {
        _grantViewerAccess(msg.sender, ciphertext);
        FHE.decrypt(ciphertext);
    }

    function _scheduleDecryptForCaller(euint32 ciphertext) internal {
        _grantViewerAccess(msg.sender, ciphertext);
        FHE.decrypt(ciphertext);
    }

    function _applyHouseEdge(uint128 wager, uint256 grossPayout)
        internal
        view
        returns (uint256 netPayout, uint256 houseFee)
    {
        uint256 wagerAmount = uint256(wager);
        if (grossPayout <= wagerAmount || houseEdgeBps == 0) {
            return (grossPayout, 0);
        }

        uint256 profit = grossPayout - wagerAmount;
        houseFee = (profit * houseEdgeBps) / BPS_DENOMINATOR;
        netPayout = grossPayout - houseFee;
    }

    function _requireActiveSession(bytes32 sessionId) internal view returns (GameSession storage session) {
        session = sessions[sessionId];
        if (session.player == address(0)) {
            revert SessionNotFound(sessionId);
        }
        if (session.status != SessionStatus.ACTIVE) {
            revert SessionNotActive(sessionId, session.status);
        }
    }

    function _setVault(address newVault) internal {
        if (newVault == address(0)) {
            revert InvalidVault(newVault);
        }

        address previousVault = address(vault);
        vault = IFHECasinoVault(newVault);
        emit VaultUpdated(previousVault, newVault);
    }

    function _setHouseEdge(uint16 newHouseEdgeBps) internal {
        if (newHouseEdgeBps > MAX_HOUSE_EDGE_BPS) {
            revert InvalidHouseEdge(newHouseEdgeBps);
        }

        uint16 previousHouseEdgeBps = houseEdgeBps;
        houseEdgeBps = newHouseEdgeBps;
        emit HouseEdgeUpdated(previousHouseEdgeBps, newHouseEdgeBps);
    }

    function _setBetLimits(uint256 newMinBet, uint256 newMaxBet) internal {
        if (newMinBet == 0 || newMinBet > newMaxBet) {
            revert InvalidBetLimits(newMinBet, newMaxBet);
        }

        uint256 previousMinBet = minBet;
        uint256 previousMaxBet = maxBet;

        minBet = newMinBet;
        maxBet = newMaxBet;

        emit BetLimitsUpdated(previousMinBet, previousMaxBet, newMinBet, newMaxBet);
    }

    function _validateWager(uint256 wager) internal view {
        if (wager < minBet || wager > maxBet) {
            revert BetAmountOutOfRange(wager, minBet, maxBet);
        }
    }

    function _initializeEncryptedConstants() private {
        ENCRYPTED_FALSE = FHE.asEbool(false);
        ENCRYPTED_TRUE = FHE.asEbool(true);
        ENCRYPTED_ZERO_U8 = FHE.asEuint8(0);
        ENCRYPTED_ONE_U8 = FHE.asEuint8(1);
        ENCRYPTED_ZERO_U32 = FHE.asEuint32(0);
        ENCRYPTED_ONE_U32 = FHE.asEuint32(1);

        FHE.allowThis(ENCRYPTED_FALSE);
        FHE.allowThis(ENCRYPTED_TRUE);
        FHE.allowThis(ENCRYPTED_ZERO_U8);
        FHE.allowThis(ENCRYPTED_ONE_U8);
        FHE.allowThis(ENCRYPTED_ZERO_U32);
        FHE.allowThis(ENCRYPTED_ONE_U32);
    }
}

