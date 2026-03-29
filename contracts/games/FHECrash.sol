// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {InEuint32} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

import {FHEGameBase} from "../base/FHEGameBase.sol";
import {FHEHybridEntropy} from "../base/FHEHybridEntropy.sol";
import {GameSession, SessionStatus} from "../base/FHEGameTypes.sol";

contract FHECrash is FHEGameBase, FHEHybridEntropy {
    uint32 public constant MIN_CRASH_MULTIPLIER_BPS = 10_000;
    uint32 public constant MAX_CRASH_MULTIPLIER_BPS = 10_000_000;
    uint32 public constant LIVE_ROUND_DURATION_SECONDS = 30;

    error CrashPointAlreadyRevealed(bytes32 sessionId);
    error DecryptResultNotReady(bytes32 sessionId);
    error InvalidCrashPoint(uint32 provided, uint32 minCrashPointBps, uint32 maxCrashPointBps);
    error InvalidCashoutResultSignature(bytes32 sessionId);
    error InvalidCrashPointSignature(bytes32 sessionId);
    error InvalidRequestedMultiplier(
        uint32 provided,
        uint32 minMultiplierBps,
        uint32 maxMultiplierBps
    );
    error MultiplierNotReachedYet(
        uint32 requestedMultiplierBps,
        uint32 currentLiveMultiplierBps
    );
    error NoPendingCashout(bytes32 sessionId);
    error NoPendingCrashPointReveal(bytes32 sessionId);
    error PendingCashout(bytes32 sessionId);
    error PendingCrashPointReveal(bytes32 sessionId);
    error PlaintextCrashPointNotSupported(uint256 chainId);
    error RoundAlreadyActivated(bytes32 sessionId);
    error RoundNotReady(bytes32 sessionId, uint64 readyBlock);
    error SessionStillActive(bytes32 sessionId);

    struct CrashMetadata {
        uint32 requestedMultiplierBps;
        uint40 activatedAt;
        bool ready;
        bool pendingCashout;
        bool pendingCrashPointReveal;
        bool crashPointRevealed;
    }

    mapping(bytes32 => CrashMetadata) public crashMetadata;
    mapping(bytes32 => uint32) public revealedCrashPointBps;

    mapping(bytes32 => euint32) private _playerEntropy;
    mapping(bytes32 => euint32) private _encryptedCrashPointBps;
    mapping(bytes32 => euint32) private _lastCashoutAllowedCode;

    event CrashRoundRequested(
        bytes32 indexed sessionId,
        address indexed player,
        uint256 wager,
        uint64 readyBlock
    );
    event CrashRoundStarted(
        bytes32 indexed sessionId,
        address indexed player,
        uint256 wager
    );
    event CrashCashoutRequested(
        bytes32 indexed sessionId,
        address indexed player,
        uint32 requestedMultiplierBps
    );
    event CrashCashoutFinalized(
        bytes32 indexed sessionId,
        address indexed player,
        uint32 requestedMultiplierBps,
        bool cashoutSucceeded,
        uint256 grossPayout,
        uint256 netPayout,
        uint256 houseFee
    );
    event CrashPointRevealRequested(bytes32 indexed sessionId, address indexed caller);
    event CrashPointRevealed(bytes32 indexed sessionId, uint32 crashPointBps);

    constructor(address initialOwner, address vaultAddress)
        FHEGameBase(initialOwner, vaultAddress, 100, 0.001 ether, 0.02 ether)
        FHEHybridEntropy(2)
    {}

    function startRound(InEuint32 calldata playerEntropy)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (bytes32 sessionId)
    {
        euint32 encryptedPlayerEntropy = FHE.asEuint32(playerEntropy);
        FHE.allowThis(encryptedPlayerEntropy);

        sessionId = _openRound(msg.sender, msg.value, encryptedPlayerEntropy);
        uint64 readyBlock = _requestHybridEntropy(sessionId, msg.sender);

        emit CrashRoundRequested(sessionId, msg.sender, msg.value, readyBlock);
    }

    function activateRound(bytes32 sessionId)
        external
        whenNotPaused
        nonReentrant
        returns (uint32 publicEntropy)
    {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        CrashMetadata storage metadata = crashMetadata[sessionId];

        if (metadata.ready) {
            revert RoundAlreadyActivated(sessionId);
        }

        publicEntropy = _resolveHybridEntropy(sessionId, session.player);

        euint64 combinedEntropy =
            FHE.xor(FHE.asEuint64(_playerEntropy[sessionId]), FHE.asEuint64(uint64(publicEntropy)));
        euint32 encryptedCrashPoint = _normalizeRandomCrashPoint(combinedEntropy);
        _encryptedCrashPointBps[sessionId] = encryptedCrashPoint;
        FHE.allowThis(_encryptedCrashPointBps[sessionId]);

        metadata.ready = true;
        metadata.activatedAt = uint40(block.timestamp);

        emit CrashRoundStarted(sessionId, session.player, session.wager);
    }

    function startRoundWithPlaintextEntropy(uint32 playerEntropy)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (bytes32 sessionId)
    {
        if (!_isLocalDevChain()) {
            revert PlaintextCrashPointNotSupported(block.chainid);
        }

        euint32 encryptedPlayerEntropy = FHE.asEuint32(playerEntropy);
        FHE.allowThis(encryptedPlayerEntropy);

        sessionId = _openRound(msg.sender, msg.value, encryptedPlayerEntropy);
        uint64 readyBlock = _requestHybridEntropy(sessionId, msg.sender);

        emit CrashRoundRequested(sessionId, msg.sender, msg.value, readyBlock);
    }

    function startRoundWithPlaintextCrashPoint(uint32 crashPointBps)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (bytes32 sessionId)
    {
        if (!_isLocalDevChain()) {
            revert PlaintextCrashPointNotSupported(block.chainid);
        }

        _validateCrashPoint(crashPointBps);

        sessionId = _openRound(msg.sender, msg.value, FHE.asEuint32(0));

        _encryptedCrashPointBps[sessionId] = _uniqueEncryptedCrashPoint(sessionId, crashPointBps);
        FHE.allowThis(_encryptedCrashPointBps[sessionId]);

        CrashMetadata storage metadata = crashMetadata[sessionId];
        metadata.ready = true;
        metadata.activatedAt = uint40(block.timestamp);

        emit CrashRoundStarted(sessionId, msg.sender, msg.value);
    }

    function requestCashout(bytes32 sessionId, uint32 currentMultiplierBps)
        external
        whenNotPaused
        nonReentrant
    {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        CrashMetadata storage metadata = crashMetadata[sessionId];

        if (!metadata.ready) {
            revert RoundNotReady(sessionId, _entropyReadyBlock(sessionId));
        }
        if (metadata.pendingCashout) {
            revert PendingCashout(sessionId);
        }

        _validateRequestedMultiplier(currentMultiplierBps);
        uint32 liveMultiplierBps = _currentLiveMultiplierBps(metadata.activatedAt);
        if (currentMultiplierBps > liveMultiplierBps) {
            revert MultiplierNotReachedYet(currentMultiplierBps, liveMultiplierBps);
        }

        metadata.pendingCashout = true;
        metadata.requestedMultiplierBps = currentMultiplierBps;

        ebool cashoutAllowed =
            FHE.gte(_encryptedCrashPointBps[sessionId], FHE.asEuint32(currentMultiplierBps));
        _lastCashoutAllowedCode[sessionId] =
            FHE.select(cashoutAllowed, ENCRYPTED_ONE_U32, ENCRYPTED_ZERO_U32);

        FHE.allowThis(_lastCashoutAllowedCode[sessionId]);
        _grantViewerAccess(msg.sender, _lastCashoutAllowedCode[sessionId]);
        _scheduleDecryptForContract(_lastCashoutAllowedCode[sessionId]);

        emit CrashCashoutRequested(sessionId, session.player, currentMultiplierBps);
    }

    function finalizeCashout(bytes32 sessionId)
        external
        whenNotPaused
        nonReentrant
        returns (bool cashoutSucceeded, uint256 grossPayout, uint256 netPayout, uint256 houseFee)
    {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        CrashMetadata storage metadata = crashMetadata[sessionId];

        if (!metadata.pendingCashout) {
            revert NoPendingCashout(sessionId);
        }

        uint32 cashoutAllowedCode;
        bool decrypted;
        (cashoutAllowedCode, decrypted) = FHE.getDecryptResultSafe(_lastCashoutAllowedCode[sessionId]);
        if (!decrypted) {
            revert DecryptResultNotReady(sessionId);
        }

        return _finalizeCashoutWithCode(sessionId, session, metadata, cashoutAllowedCode);
    }

    function publishCashoutResult(bytes32 sessionId, uint32 cashoutAllowedCode, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
        returns (bool cashoutSucceeded, uint256 grossPayout, uint256 netPayout, uint256 houseFee)
    {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        CrashMetadata storage metadata = crashMetadata[sessionId];

        if (!metadata.pendingCashout) {
            revert NoPendingCashout(sessionId);
        }
        if (
            !FHE.verifyDecryptResultSafe(
                _lastCashoutAllowedCode[sessionId], cashoutAllowedCode, signature
            )
        ) {
            revert InvalidCashoutResultSignature(sessionId);
        }

        FHE.publishDecryptResult(_lastCashoutAllowedCode[sessionId], cashoutAllowedCode, signature);
        return _finalizeCashoutWithCode(sessionId, session, metadata, cashoutAllowedCode);
    }

    function _finalizeCashoutWithCode(
        bytes32 sessionId,
        GameSession storage session,
        CrashMetadata storage metadata,
        uint32 cashoutAllowedCode
    )
        internal
        returns (bool cashoutSucceeded, uint256 grossPayout, uint256 netPayout, uint256 houseFee)
    {
        cashoutSucceeded = cashoutAllowedCode != 0;
        metadata.pendingCashout = false;

        if (cashoutSucceeded) {
            grossPayout =
                (uint256(session.wager) * metadata.requestedMultiplierBps)
                / BPS_DENOMINATOR;
            (netPayout, houseFee) =
                _finalizeSession(sessionId, SessionStatus.CASHED_OUT, grossPayout);
        } else {
            _finalizeSession(sessionId, SessionStatus.LOST, 0);
        }

        emit CrashCashoutFinalized(
            sessionId,
            session.player,
            metadata.requestedMultiplierBps,
            cashoutSucceeded,
            grossPayout,
            netPayout,
            houseFee
        );
    }

    function requestCrashPointReveal(bytes32 sessionId) external whenNotPaused nonReentrant {
        _requireSettledSession(sessionId);

        CrashMetadata storage metadata = crashMetadata[sessionId];
        if (metadata.pendingCrashPointReveal) {
            revert PendingCrashPointReveal(sessionId);
        }
        if (metadata.crashPointRevealed) {
            revert CrashPointAlreadyRevealed(sessionId);
        }

        metadata.pendingCrashPointReveal = true;
        _grantViewerAccess(msg.sender, _encryptedCrashPointBps[sessionId]);
        _scheduleDecryptForContract(_encryptedCrashPointBps[sessionId]);

        emit CrashPointRevealRequested(sessionId, msg.sender);
    }

    function finalizeCrashPointReveal(bytes32 sessionId)
        external
        whenNotPaused
        nonReentrant
        returns (uint32 crashPointBps)
    {
        _requireSettledSession(sessionId);

        CrashMetadata storage metadata = crashMetadata[sessionId];
        if (!metadata.pendingCrashPointReveal) {
            revert NoPendingCrashPointReveal(sessionId);
        }

        bool decrypted;
        (crashPointBps, decrypted) = FHE.getDecryptResultSafe(_encryptedCrashPointBps[sessionId]);
        if (!decrypted) {
            revert DecryptResultNotReady(sessionId);
        }

        _finalizeCrashPointRevealWithValue(sessionId, metadata, crashPointBps);
    }

    function publishCrashPointReveal(bytes32 sessionId, uint32 crashPointBps, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
        returns (uint32 publishedCrashPointBps)
    {
        _requireSettledSession(sessionId);

        CrashMetadata storage metadata = crashMetadata[sessionId];
        if (!metadata.pendingCrashPointReveal) {
            revert NoPendingCrashPointReveal(sessionId);
        }
        if (
            !FHE.verifyDecryptResultSafe(
                _encryptedCrashPointBps[sessionId], crashPointBps, signature
            )
        ) {
            revert InvalidCrashPointSignature(sessionId);
        }

        FHE.publishDecryptResult(_encryptedCrashPointBps[sessionId], crashPointBps, signature);
        _finalizeCrashPointRevealWithValue(sessionId, metadata, crashPointBps);
        return crashPointBps;
    }

    function _finalizeCrashPointRevealWithValue(
        bytes32 sessionId,
        CrashMetadata storage metadata,
        uint32 crashPointBps
    ) internal {
        metadata.pendingCrashPointReveal = false;
        metadata.crashPointRevealed = true;
        revealedCrashPointBps[sessionId] = crashPointBps;

        emit CrashPointRevealed(sessionId, crashPointBps);
    }

    function getEncryptedCrashPoint(bytes32 sessionId) external view returns (euint32) {
        _requireExistingSession(sessionId);
        return _encryptedCrashPointBps[sessionId];
    }

    function getLastCashoutAllowed(bytes32 sessionId) external view returns (euint32) {
        _requireExistingSession(sessionId);
        return _lastCashoutAllowedCode[sessionId];
    }

    function readLastCashoutAllowed(bytes32 sessionId)
        external
        view
        returns (uint32 allowedCode, bool ready)
    {
        _validateSessionPlayer(sessionId, msg.sender);
        (allowedCode, ready) = FHE.getDecryptResultSafe(_lastCashoutAllowedCode[sessionId]);
    }

    function readCrashPoint(bytes32 sessionId)
        external
        view
        returns (uint32 crashPointBps, bool ready)
    {
        _validateSessionPlayer(sessionId, msg.sender);
        (crashPointBps, ready) = FHE.getDecryptResultSafe(_encryptedCrashPointBps[sessionId]);
    }

    function currentLiveMultiplierBps(bytes32 sessionId) external view returns (uint32) {
        _requireExistingSession(sessionId);
        return _currentLiveMultiplierBps(crashMetadata[sessionId].activatedAt);
    }

    function maxGrossPayoutForWager(uint256 wager) external pure returns (uint256) {
        return (wager * MAX_CRASH_MULTIPLIER_BPS) / BPS_DENOMINATOR;
    }

    function _openRound(address player, uint256 wager, euint32 playerEntropy)
        internal
        returns (bytes32 sessionId)
    {
        uint256 maxGrossPayout = (wager * MAX_CRASH_MULTIPLIER_BPS) / BPS_DENOMINATOR;
        (sessionId,) = _beginSession(player, wager, maxGrossPayout);

        crashMetadata[sessionId] = CrashMetadata({
            requestedMultiplierBps: 0,
            activatedAt: 0,
            ready: false,
            pendingCashout: false,
            pendingCrashPointReveal: false,
            crashPointRevealed: false
        });

        _playerEntropy[sessionId] = playerEntropy;
        _lastCashoutAllowedCode[sessionId] = ENCRYPTED_ZERO_U32;

        FHE.allowThis(_playerEntropy[sessionId]);
        FHE.allowThis(_lastCashoutAllowedCode[sessionId]);
    }

    function _normalizeRandomCrashPoint(euint64 randomValue) internal returns (euint32 crashPointBps) {
        uint64 spread = uint64(MAX_CRASH_MULTIPLIER_BPS - MIN_CRASH_MULTIPLIER_BPS + 1);
        euint64 normalized = FHE.rem(randomValue, FHE.asEuint64(spread));
        euint64 shifted = FHE.add(normalized, FHE.asEuint64(uint64(MIN_CRASH_MULTIPLIER_BPS)));
        crashPointBps = FHE.asEuint32(shifted);
    }

    function _uniqueEncryptedCrashPoint(bytes32 sessionId, uint32 crashPointBps)
        internal
        returns (euint32)
    {
        euint32 baseValue = FHE.asEuint32(crashPointBps);
        euint32 sessionSalt = FHE.asEuint32(uint256(sessionId));
        euint32 uniqueZero = FHE.sub(sessionSalt, sessionSalt);
        return FHE.add(baseValue, uniqueZero);
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

    function _requireSettledSession(bytes32 sessionId) internal view returns (GameSession storage session) {
        _requireExistingSession(sessionId);
        session = sessions[sessionId];
        if (session.status == SessionStatus.ACTIVE) {
            revert SessionStillActive(sessionId);
        }
    }

    function _validateCrashPoint(uint32 crashPointBps) internal pure {
        if (
            crashPointBps < MIN_CRASH_MULTIPLIER_BPS || crashPointBps > MAX_CRASH_MULTIPLIER_BPS
        ) {
            revert InvalidCrashPoint(
                crashPointBps,
                MIN_CRASH_MULTIPLIER_BPS,
                MAX_CRASH_MULTIPLIER_BPS
            );
        }
    }

    function _validateRequestedMultiplier(uint32 currentMultiplierBps) internal pure {
        if (
            currentMultiplierBps < MIN_CRASH_MULTIPLIER_BPS
                || currentMultiplierBps > MAX_CRASH_MULTIPLIER_BPS
        ) {
            revert InvalidRequestedMultiplier(
                currentMultiplierBps,
                MIN_CRASH_MULTIPLIER_BPS,
                MAX_CRASH_MULTIPLIER_BPS
            );
        }
    }

    function _currentLiveMultiplierBps(uint40 activatedAt) internal view returns (uint32) {
        if (activatedAt == 0) {
            return MIN_CRASH_MULTIPLIER_BPS;
        }

        uint256 elapsed = block.timestamp > activatedAt ? block.timestamp - activatedAt : 0;
        if (elapsed >= LIVE_ROUND_DURATION_SECONDS) {
            return MAX_CRASH_MULTIPLIER_BPS;
        }

        uint256 spread = MAX_CRASH_MULTIPLIER_BPS - MIN_CRASH_MULTIPLIER_BPS;
        return uint32(
            uint256(MIN_CRASH_MULTIPLIER_BPS)
                + ((spread * elapsed) / LIVE_ROUND_DURATION_SECONDS)
        );
    }

    function _isLocalDevChain() internal view returns (bool) {
        return block.chainid == 31337 || block.chainid == 1337 || block.chainid == 420105;
    }
}
