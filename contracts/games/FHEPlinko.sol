// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {InEuint32} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

import {FHEGameBase} from "../base/FHEGameBase.sol";
import {FHEHybridEntropy} from "../base/FHEHybridEntropy.sol";
import {GameSession, SessionStatus} from "../base/FHEGameTypes.sol";

contract FHEPlinko is FHEGameBase, FHEHybridEntropy {
    uint8 public constant PEG_ROWS = 8;
    uint8 public constant SLOT_COUNT = PEG_ROWS + 1;
    uint32 public constant MAX_PATH_SEED = 255;
    uint32 public constant SLOT_0_MULTIPLIER_BPS = 1_000_000;
    uint32 public constant SLOT_1_MULTIPLIER_BPS = 250_000;
    uint32 public constant SLOT_2_MULTIPLIER_BPS = 80_000;
    uint32 public constant SLOT_3_MULTIPLIER_BPS = 20_000;
    uint32 public constant SLOT_4_MULTIPLIER_BPS = 2_000;
    uint32 public constant SLOT_5_MULTIPLIER_BPS = 20_000;
    uint32 public constant SLOT_6_MULTIPLIER_BPS = 80_000;
    uint32 public constant SLOT_7_MULTIPLIER_BPS = 250_000;
    uint32 public constant SLOT_8_MULTIPLIER_BPS = 1_000_000;
    uint32 public constant MAX_MULTIPLIER_BPS = SLOT_0_MULTIPLIER_BPS;

    error DecryptResultNotReady(bytes32 sessionId);
    error GameAlreadyActivated(bytes32 sessionId);
    error GameNotReady(bytes32 sessionId, uint64 readyBlock);
    error InvalidPathSeed(uint32 provided, uint32 maxPathSeed);
    error NoPendingSettle(bytes32 sessionId);
    error PendingSettle(bytes32 sessionId);
    error PlaintextPathSeedNotSupported(uint256 chainId);

    struct PlinkoMetadata {
        bool ready;
        bool pendingSettle;
        bool resultRevealed;
    }

    mapping(bytes32 => PlinkoMetadata) public plinkoMetadata;
    mapping(bytes32 => uint32) public revealedPathSeed;
    mapping(bytes32 => uint8) public revealedFinalSlot;

    mapping(bytes32 => euint32) private _playerEntropy;
    mapping(bytes32 => euint32) private _pathSeed;
    mapping(bytes32 => euint32) private _finalSlot;
    mapping(bytes32 => euint32) private _currentMultiplierBps;

    event PlinkoDropRequested(
        bytes32 indexed sessionId,
        address indexed player,
        uint256 wager,
        uint64 readyBlock
    );
    event PlinkoDropStarted(
        bytes32 indexed sessionId,
        address indexed player,
        uint256 wager
    );
    event PlinkoSettleRequested(bytes32 indexed sessionId, address indexed player);
    event PlinkoSettled(
        bytes32 indexed sessionId,
        address indexed player,
        uint32 pathSeed,
        uint8 finalSlot,
        uint256 grossPayout,
        uint256 netPayout,
        uint256 houseFee
    );

    constructor(address initialOwner, address vaultAddress)
        FHEGameBase(initialOwner, vaultAddress, 100, 0.001 ether, 0.02 ether)
        FHEHybridEntropy(2)
    {}

    function startDrop(InEuint32 calldata playerEntropy)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (bytes32 sessionId)
    {
        euint32 encryptedPlayerEntropy = FHE.asEuint32(playerEntropy);
        FHE.allowThis(encryptedPlayerEntropy);

        sessionId = _openSession(msg.sender, msg.value, encryptedPlayerEntropy);
        uint64 readyBlock = _requestHybridEntropy(sessionId, msg.sender);

        emit PlinkoDropRequested(sessionId, msg.sender, msg.value, readyBlock);
    }

    function activateDrop(bytes32 sessionId)
        external
        whenNotPaused
        nonReentrant
        returns (uint32 publicEntropy)
    {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        PlinkoMetadata storage metadata = plinkoMetadata[sessionId];

        if (metadata.ready) {
            revert GameAlreadyActivated(sessionId);
        }

        publicEntropy = _resolveHybridEntropy(sessionId, session.player);

        euint32 normalizedPathSeed = _normalizePathSeed(
            FHE.xor(FHE.asEuint64(_playerEntropy[sessionId]), FHE.asEuint64(uint64(publicEntropy)))
        );
        _storePlinkoState(sessionId, normalizedPathSeed);
        metadata.ready = true;

        emit PlinkoDropStarted(sessionId, session.player, session.wager);
    }

    function startDropWithPlaintextEntropy(uint32 pathEntropy)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (bytes32 sessionId)
    {
        if (!_isLocalDevChain()) {
            revert PlaintextPathSeedNotSupported(block.chainid);
        }

        euint32 encryptedPathEntropy = FHE.asEuint32(pathEntropy);
        FHE.allowThis(encryptedPathEntropy);

        sessionId = _openSession(msg.sender, msg.value, encryptedPathEntropy);
        uint64 readyBlock = _requestHybridEntropy(sessionId, msg.sender);

        emit PlinkoDropRequested(sessionId, msg.sender, msg.value, readyBlock);
    }

    function startDropWithPlaintextPathSeed(uint8 pathSeed)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (bytes32 sessionId)
    {
        if (!_isLocalDevChain()) {
            revert PlaintextPathSeedNotSupported(block.chainid);
        }

        _validatePathSeed(pathSeed);

        sessionId = _openSession(msg.sender, msg.value, FHE.asEuint32(0));

        euint32 encryptedPathSeed = _uniqueEncryptedPathSeed(sessionId, pathSeed);
        _storePlinkoState(sessionId, encryptedPathSeed);
        plinkoMetadata[sessionId].ready = true;

        emit PlinkoDropStarted(sessionId, msg.sender, msg.value);
    }

    function requestSettle(bytes32 sessionId) external whenNotPaused nonReentrant {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        PlinkoMetadata storage metadata = plinkoMetadata[sessionId];

        if (!metadata.ready) {
            revert GameNotReady(sessionId, _entropyReadyBlock(sessionId));
        }
        if (metadata.pendingSettle) {
            revert PendingSettle(sessionId);
        }

        metadata.pendingSettle = true;

        _grantViewerAccess(msg.sender, _pathSeed[sessionId]);
        _grantViewerAccess(msg.sender, _finalSlot[sessionId]);
        _grantViewerAccess(msg.sender, _currentMultiplierBps[sessionId]);

        FHE.decrypt(_pathSeed[sessionId]);
        FHE.decrypt(_finalSlot[sessionId]);
        FHE.decrypt(_currentMultiplierBps[sessionId]);

        emit PlinkoSettleRequested(sessionId, session.player);
    }

    function finalizeSettle(bytes32 sessionId)
        external
        whenNotPaused
        nonReentrant
        returns (
            uint32 pathSeed,
            uint8 finalSlot,
            uint256 grossPayout,
            uint256 netPayout,
            uint256 houseFee
        )
    {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        PlinkoMetadata storage metadata = plinkoMetadata[sessionId];

        if (!metadata.pendingSettle) {
            revert NoPendingSettle(sessionId);
        }

        bool pathSeedReady;
        (pathSeed, pathSeedReady) = FHE.getDecryptResultSafe(_pathSeed[sessionId]);
        uint32 decryptedSlot;
        bool slotReady;
        (decryptedSlot, slotReady) = FHE.getDecryptResultSafe(_finalSlot[sessionId]);
        uint32 multiplierBps;
        bool multiplierReady;
        (multiplierBps, multiplierReady) = FHE.getDecryptResultSafe(_currentMultiplierBps[sessionId]);

        if (!pathSeedReady || !slotReady || !multiplierReady) {
            revert DecryptResultNotReady(sessionId);
        }

        metadata.pendingSettle = false;
        metadata.resultRevealed = true;

        finalSlot = uint8(decryptedSlot);
        revealedPathSeed[sessionId] = pathSeed;
        revealedFinalSlot[sessionId] = finalSlot;

        grossPayout = (uint256(session.wager) * multiplierBps) / BPS_DENOMINATOR;
        (netPayout, houseFee) = _finalizeSession(
            sessionId,
            grossPayout == 0 ? SessionStatus.LOST : SessionStatus.WON,
            grossPayout
        );

        emit PlinkoSettled(
            sessionId,
            session.player,
            pathSeed,
            finalSlot,
            grossPayout,
            netPayout,
            houseFee
        );
    }

    function getPathSeed(bytes32 sessionId) external view returns (euint32) {
        _requireExistingSession(sessionId);
        return _pathSeed[sessionId];
    }

    function getFinalSlot(bytes32 sessionId) external view returns (euint32) {
        _requireExistingSession(sessionId);
        return _finalSlot[sessionId];
    }

    function getCurrentMultiplierBps(bytes32 sessionId) external view returns (euint32) {
        _requireExistingSession(sessionId);
        return _currentMultiplierBps[sessionId];
    }

    function readPathSeed(bytes32 sessionId) external view returns (uint32 pathSeed, bool ready) {
        _validateSessionPlayer(sessionId, msg.sender);
        (pathSeed, ready) = FHE.getDecryptResultSafe(_pathSeed[sessionId]);
    }

    function readFinalSlot(bytes32 sessionId) external view returns (uint32 finalSlot, bool ready) {
        _validateSessionPlayer(sessionId, msg.sender);
        (finalSlot, ready) = FHE.getDecryptResultSafe(_finalSlot[sessionId]);
    }

    function readCurrentMultiplier(bytes32 sessionId)
        external
        view
        returns (uint32 multiplierBps, bool ready)
    {
        _validateSessionPlayer(sessionId, msg.sender);
        (multiplierBps, ready) = FHE.getDecryptResultSafe(_currentMultiplierBps[sessionId]);
    }

    function multiplierForSlot(uint8 slot) external pure returns (uint32) {
        return _slotMultiplierBps(slot);
    }

    function maxGrossPayoutForWager(uint256 wager) external pure returns (uint256) {
        return (wager * MAX_MULTIPLIER_BPS) / BPS_DENOMINATOR;
    }

    function _openSession(address player, uint256 wager, euint32 playerEntropy)
        internal
        returns (bytes32 sessionId)
    {
        uint256 maxGrossPayout = (wager * MAX_MULTIPLIER_BPS) / BPS_DENOMINATOR;
        (sessionId,) = _beginSession(player, wager, maxGrossPayout);

        plinkoMetadata[sessionId] = PlinkoMetadata({
            ready: false,
            pendingSettle: false,
            resultRevealed: false
        });

        _playerEntropy[sessionId] = playerEntropy;
        FHE.allowThis(_playerEntropy[sessionId]);
    }

    function _storePlinkoState(bytes32 sessionId, euint32 encryptedPathSeed) internal {
        _pathSeed[sessionId] = encryptedPathSeed;
        _finalSlot[sessionId] = _computeFinalSlot(encryptedPathSeed);
        _currentMultiplierBps[sessionId] = _resolveSlotMultiplier(_finalSlot[sessionId]);

        FHE.allowThis(_pathSeed[sessionId]);
        FHE.allowThis(_finalSlot[sessionId]);
        FHE.allowThis(_currentMultiplierBps[sessionId]);
    }

    function _normalizePathSeed(euint64 encryptedPathSeed) internal returns (euint32) {
        euint64 normalized = FHE.rem(encryptedPathSeed, FHE.asEuint64(uint64(MAX_PATH_SEED + 1)));
        return FHE.asEuint32(normalized);
    }

    function _computeFinalSlot(euint32 encryptedPathSeed) internal returns (euint32 finalSlot) {
        finalSlot = ENCRYPTED_ZERO_U32;
        euint32 encryptedOne = ENCRYPTED_ONE_U32;

        for (uint8 row = 0; row < PEG_ROWS; row++) {
            euint32 shifted = FHE.shr(encryptedPathSeed, FHE.asEuint32(row));
            euint32 bit = FHE.and(shifted, encryptedOne);
            finalSlot = FHE.add(finalSlot, bit);
        }
    }

    function _resolveSlotMultiplier(euint32 encryptedFinalSlot)
        internal
        returns (euint32 multiplierBps)
    {
        multiplierBps = FHE.asEuint32(_slotMultiplierBps(0));
        for (uint8 slot = 0; slot < SLOT_COUNT; slot++) {
            ebool isMatch = FHE.eq(encryptedFinalSlot, FHE.asEuint32(slot));
            multiplierBps = FHE.select(
                isMatch,
                FHE.asEuint32(_slotMultiplierBps(slot)),
                multiplierBps
            );
        }
    }

    function _uniqueEncryptedPathSeed(bytes32 sessionId, uint8 pathSeed)
        internal
        returns (euint32)
    {
        euint32 baseValue = FHE.asEuint32(pathSeed);
        euint32 salt = FHE.asEuint32(uint256(sessionId));
        euint32 uniqueZero = FHE.sub(salt, salt);
        return FHE.add(baseValue, uniqueZero);
    }

    function _slotMultiplierBps(uint8 slot) internal pure returns (uint32) {
        if (slot == 0) return SLOT_0_MULTIPLIER_BPS;
        if (slot == 1) return SLOT_1_MULTIPLIER_BPS;
        if (slot == 2) return SLOT_2_MULTIPLIER_BPS;
        if (slot == 3) return SLOT_3_MULTIPLIER_BPS;
        if (slot == 4) return SLOT_4_MULTIPLIER_BPS;
        if (slot == 5) return SLOT_5_MULTIPLIER_BPS;
        if (slot == 6) return SLOT_6_MULTIPLIER_BPS;
        if (slot == 7) return SLOT_7_MULTIPLIER_BPS;
        if (slot == 8) return SLOT_8_MULTIPLIER_BPS;
        revert InvalidPathSeed(slot, SLOT_COUNT - 1);
    }

    function _requireExistingSession(bytes32 sessionId) internal view {
        if (sessions[sessionId].player == address(0)) {
            revert SessionNotFound(sessionId);
        }
    }

    function _requirePlayerActiveSession(bytes32 sessionId, address player)
        internal
        view
        returns (GameSession storage session)
    {
        session = _validateSessionPlayer(sessionId, player);
        if (session.status != SessionStatus.ACTIVE) {
            revert SessionNotActive(sessionId, session.status);
        }
    }

    function _validatePathSeed(uint32 pathSeed) internal pure {
        if (pathSeed > MAX_PATH_SEED) {
            revert InvalidPathSeed(pathSeed, MAX_PATH_SEED);
        }
    }

    function _isLocalDevChain() internal view returns (bool) {
        return block.chainid == 31337 || block.chainid == 1337 || block.chainid == 420105;
    }
}
