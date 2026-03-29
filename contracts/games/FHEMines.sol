// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {InEuint32} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

import {FHEGameBase} from "../base/FHEGameBase.sol";
import {FHEHybridEntropy} from "../base/FHEHybridEntropy.sol";
import {GameSession, SessionStatus} from "../base/FHEGameTypes.sol";

contract FHEMines is FHEGameBase, FHEHybridEntropy {
    uint8 public constant GRID_WIDTH = 5;
    uint8 public constant GRID_SIZE = GRID_WIDTH * GRID_WIDTH;
    uint8 public constant MIN_MINES = 3;
    uint8 public constant MAX_MINES = 8;
    uint32 public constant BASE_MULTIPLIER_BPS = 10_000;
    uint32 public constant MAX_MULTIPLIER_BPS = 240_000;

    error DecryptResultNotReady(bytes32 sessionId);
    error GameAlreadyActivated(bytes32 sessionId);
    error GameNotReady(bytes32 sessionId, uint64 readyBlock);
    error InvalidRevealSignature(bytes32 sessionId);
    error InvalidMineIndex(uint8 provided, uint8 mineCount);
    error InvalidMineCount(uint8 provided, uint8 minMines, uint8 maxMines);
    error InvalidTileCoordinates(uint8 x, uint8 y);
    error NoPendingCashout(bytes32 sessionId);
    error NoPendingReveal(bytes32 sessionId);
    error PlaintextSeedNotSupported(uint256 chainId);
    error PendingCashout(bytes32 sessionId);
    error PendingReveal(bytes32 sessionId);
    error TileAlreadyOpened(bytes32 sessionId, uint8 tileIndex);
    error RoundAlreadyActivated(bytes32 sessionId);

    struct MinesMetadata {
        uint8 mineCount;
        uint8 lastTileIndex;
        bool ready;
        bool pendingReveal;
        bool pendingCashout;
    }

    mapping(bytes32 => MinesMetadata) public minesMetadata;
    mapping(bytes32 => mapping(uint8 => bool)) public tileOpened;
    mapping(bytes32 => uint8) public revealedSafeRevealCount;
    mapping(bytes32 => uint32) public revealedCurrentMultiplierBps;

    mapping(bytes32 => euint32) private _playerEntropy;
    mapping(bytes32 => uint32) private _plaintextPlayerEntropy;
    mapping(bytes32 => euint64) private _encryptedSeed;
    mapping(bytes32 => euint32) private _safeRevealCount;
    mapping(bytes32 => euint32) private _currentMultiplierBps;
    mapping(bytes32 => ebool) private _busted;
    mapping(bytes32 => ebool) private _lastRevealWasMine;
    mapping(bytes32 => euint32) private _lastRevealCode;
    mapping(bytes32 => mapping(uint8 => euint32)) private _minePositions;

    event MinesGameRequested(
        bytes32 indexed sessionId,
        address indexed player,
        uint256 wager,
        uint8 mineCount,
        uint64 readyBlock
    );
    event MinesGameStarted(
        bytes32 indexed sessionId,
        address indexed player,
        uint256 wager,
        uint8 mineCount
    );
    event TileRevealRequested(
        bytes32 indexed sessionId,
        address indexed player,
        uint8 tileIndex,
        uint8 x,
        uint8 y
    );
    event TileRevealFinalized(
        bytes32 indexed sessionId,
        address indexed player,
        uint8 tileIndex,
        bool hitMine
    );
    event CashoutRequested(bytes32 indexed sessionId, address indexed player);
    event CashoutFinalized(
        bytes32 indexed sessionId,
        address indexed player,
        uint256 grossPayout,
        uint256 netPayout,
        uint256 houseFee
    );
    event GameCancelled(bytes32 indexed sessionId, address indexed player, uint256 refundedWager);

    constructor(address initialOwner, address vaultAddress)
        FHEGameBase(initialOwner, vaultAddress, 100, 0.001 ether, 1 ether)
        FHEHybridEntropy(2)
    {}

    function startGame(uint8 mineCount, InEuint32 calldata playerEntropy)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (bytes32 sessionId)
    {
        _validateMineCount(mineCount);

        euint32 encryptedPlayerEntropy = FHE.asEuint32(playerEntropy);
        FHE.allowThis(encryptedPlayerEntropy);

        sessionId = _openSession(msg.sender, mineCount, msg.value, encryptedPlayerEntropy);
        uint64 readyBlock = _requestHybridEntropy(sessionId, msg.sender);

        emit MinesGameRequested(sessionId, msg.sender, msg.value, mineCount, readyBlock);
    }

    function activateGame(bytes32 sessionId)
        external
        whenNotPaused
        nonReentrant
        returns (uint32 publicEntropy)
    {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        MinesMetadata storage metadata = minesMetadata[sessionId];

        if (metadata.ready) {
            revert GameAlreadyActivated(sessionId);
        }

        publicEntropy = _resolveHybridEntropy(sessionId, session.player);

        euint64 encryptedSeed =
            FHE.xor(FHE.asEuint64(_playerEntropy[sessionId]), FHE.asEuint64(uint64(publicEntropy)));
        _encryptedSeed[sessionId] = encryptedSeed;
        FHE.allowThis(_encryptedSeed[sessionId]);

        _initializeMineGrid(sessionId, metadata.mineCount, encryptedSeed);

        metadata.ready = true;

        emit MinesGameStarted(sessionId, session.player, session.wager, metadata.mineCount);
    }

    function activateGameWithPlaintextEntropy(bytes32 sessionId)
        external
        whenNotPaused
        nonReentrant
        returns (uint32 publicEntropy)
    {
        if (!_isLocalDevChain()) {
            revert PlaintextSeedNotSupported(block.chainid);
        }

        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        MinesMetadata storage metadata = minesMetadata[sessionId];

        if (metadata.ready) {
            revert GameAlreadyActivated(sessionId);
        }

        publicEntropy = _resolveHybridEntropy(sessionId, session.player);

        uint32 combinedSeed = publicEntropy ^ _plaintextPlayerEntropy[sessionId];
        _encryptedSeed[sessionId] = FHE.asEuint64(combinedSeed);
        FHE.allowThis(_encryptedSeed[sessionId]);

        _initializeMineGridFromPlaintextSeed(sessionId, metadata.mineCount, combinedSeed);

        metadata.ready = true;
        delete _plaintextPlayerEntropy[sessionId];

        emit MinesGameStarted(sessionId, session.player, session.wager, metadata.mineCount);
    }

    function startGameWithPlaintextSeed(uint8 mineCount, uint32 seed)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (bytes32 sessionId)
    {
        if (!_isLocalDevChain()) {
            revert PlaintextSeedNotSupported(block.chainid);
        }

        _validateMineCount(mineCount);

        euint64 encryptedSeed = FHE.asEuint64(uint64(seed));
        FHE.allowThis(encryptedSeed);

        sessionId = _openSession(msg.sender, mineCount, msg.value, FHE.asEuint32(0));
        _encryptedSeed[sessionId] = encryptedSeed;
        FHE.allowThis(_encryptedSeed[sessionId]);
        _initializeMineGridFromPlaintextSeed(sessionId, mineCount, seed);
        minesMetadata[sessionId].ready = true;

        emit MinesGameStarted(sessionId, msg.sender, msg.value, mineCount);
    }

    function startGameWithPlaintextEntropy(uint8 mineCount, uint32 playerEntropy)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (bytes32 sessionId)
    {
        if (!_isLocalDevChain()) {
            revert PlaintextSeedNotSupported(block.chainid);
        }

        _validateMineCount(mineCount);

        euint32 encryptedPlayerEntropy = FHE.asEuint32(playerEntropy);
        FHE.allowThis(encryptedPlayerEntropy);

        sessionId = _openSession(msg.sender, mineCount, msg.value, encryptedPlayerEntropy);
        _plaintextPlayerEntropy[sessionId] = playerEntropy;
        uint64 readyBlock = _requestHybridEntropy(sessionId, msg.sender);

        emit MinesGameRequested(sessionId, msg.sender, msg.value, mineCount, readyBlock);
    }

    function cancelUnactivatedGame(bytes32 sessionId)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 refundedWager)
    {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        MinesMetadata storage metadata = minesMetadata[sessionId];

        if (metadata.ready) {
            revert RoundAlreadyActivated(sessionId);
        }

        refundedWager = uint256(session.wager);
        _finalizeSession(sessionId, SessionStatus.PUSH, refundedWager);

        delete _plaintextPlayerEntropy[sessionId];

        emit GameCancelled(sessionId, session.player, refundedWager);
    }

    function revealTile(bytes32 sessionId, uint8 x, uint8 y) external whenNotPaused nonReentrant {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        MinesMetadata storage metadata = minesMetadata[sessionId];

        if (!metadata.ready) {
            revert GameNotReady(sessionId, _entropyReadyBlock(sessionId));
        }
        if (metadata.pendingReveal) {
            if (_resolvePendingReveal(sessionId, session, metadata)) {
                return;
            }
        }
        if (metadata.pendingCashout) {
            revert PendingCashout(sessionId);
        }
        if (x >= GRID_WIDTH || y >= GRID_WIDTH) {
            revert InvalidTileCoordinates(x, y);
        }

        uint8 tileIndex = _tileIndex(x, y);
        if (tileOpened[sessionId][tileIndex]) {
            revert TileAlreadyOpened(sessionId, tileIndex);
        }

        tileOpened[sessionId][tileIndex] = true;

        ebool isMine = _isMineTile(sessionId, metadata.mineCount, tileIndex);

        _lastRevealWasMine[sessionId] = isMine;
        _lastRevealCode[sessionId] = FHE.select(isMine, ENCRYPTED_ONE_U32, ENCRYPTED_ZERO_U32);
        _busted[sessionId] = FHE.select(isMine, ENCRYPTED_TRUE, _busted[sessionId]);

        FHE.allowThis(_lastRevealWasMine[sessionId]);
        FHE.allowThis(_lastRevealCode[sessionId]);
        FHE.allowThis(_busted[sessionId]);

        _grantViewerAccess(msg.sender, _lastRevealWasMine[sessionId]);
        _grantViewerAccess(msg.sender, _lastRevealCode[sessionId]);
        _grantViewerAccess(msg.sender, _busted[sessionId]);

        _scheduleDecryptForContract(_lastRevealCode[sessionId]);

        metadata.pendingReveal = true;
        metadata.lastTileIndex = tileIndex;

        emit TileRevealRequested(sessionId, session.player, tileIndex, x, y);
    }

    function finalizeReveal(bytes32 sessionId)
        external
        whenNotPaused
        nonReentrant
        returns (bool hitMine)
    {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        MinesMetadata storage metadata = minesMetadata[sessionId];

        if (!metadata.pendingReveal) {
            revert NoPendingReveal(sessionId);
        }

        hitMine = _resolvePendingReveal(sessionId, session, metadata);
    }

    function publishRevealResult(bytes32 sessionId, uint32 revealCode, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
        returns (bool hitMine)
    {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        MinesMetadata storage metadata = minesMetadata[sessionId];

        if (!metadata.pendingReveal) {
            revert NoPendingReveal(sessionId);
        }
        if (!FHE.verifyDecryptResultSafe(_lastRevealCode[sessionId], revealCode, signature)) {
            revert InvalidRevealSignature(sessionId);
        }

        FHE.publishDecryptResult(_lastRevealCode[sessionId], revealCode, signature);
        hitMine = _resolvePendingReveal(sessionId, session, metadata);
    }

    function requestCashout(bytes32 sessionId) external whenNotPaused nonReentrant {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        MinesMetadata storage metadata = minesMetadata[sessionId];

        if (!metadata.ready) {
            revert GameNotReady(sessionId, _entropyReadyBlock(sessionId));
        }
        if (metadata.pendingReveal) {
            if (_resolvePendingReveal(sessionId, session, metadata)) {
                return;
            }
        }
        if (metadata.pendingCashout) {
            revert PendingCashout(sessionId);
        }

        metadata.pendingCashout = true;

        emit CashoutRequested(sessionId, session.player);
    }

    function finalizeCashout(bytes32 sessionId)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 grossPayout, uint256 netPayout, uint256 houseFee)
    {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        MinesMetadata storage metadata = minesMetadata[sessionId];

        if (!metadata.pendingCashout) {
            revert NoPendingCashout(sessionId);
        }

        metadata.pendingCashout = false;

        uint32 multiplierBps = revealedCurrentMultiplierBps[sessionId];
        grossPayout = (uint256(session.wager) * multiplierBps) / BPS_DENOMINATOR;
        (netPayout, houseFee) = _finalizeSession(sessionId, SessionStatus.CASHED_OUT, grossPayout);

        emit CashoutFinalized(sessionId, session.player, grossPayout, netPayout, houseFee);
    }

    function getEncryptedSeed(bytes32 sessionId) external view returns (euint64) {
        _requireExistingSession(sessionId);
        return _encryptedSeed[sessionId];
    }

    function getMinePosition(bytes32 sessionId, uint8 mineIndex) external view returns (euint32) {
        _requireExistingSession(sessionId);
        uint8 mineCount = minesMetadata[sessionId].mineCount;
        if (mineIndex >= mineCount) {
            revert InvalidMineIndex(mineIndex, mineCount);
        }
        return _minePositions[sessionId][mineIndex];
    }

    function getSafeRevealCount(bytes32 sessionId) external view returns (euint32) {
        _requireExistingSession(sessionId);
        return _safeRevealCount[sessionId];
    }

    function readSafeRevealCount(bytes32 sessionId)
        external
        view
        returns (uint32 safeRevealCount, bool ready)
    {
        _validateSessionPlayer(sessionId, msg.sender);
        safeRevealCount = uint32(revealedSafeRevealCount[sessionId]);
        ready = !minesMetadata[sessionId].pendingReveal;
    }

    function getCurrentMultiplierBps(bytes32 sessionId) external view returns (euint32) {
        _requireExistingSession(sessionId);
        return _currentMultiplierBps[sessionId];
    }

    function readCurrentMultiplier(bytes32 sessionId)
        external
        view
        returns (uint32 multiplierBps, bool ready)
    {
        _validateSessionPlayer(sessionId, msg.sender);
        multiplierBps = revealedCurrentMultiplierBps[sessionId];
        ready = !minesMetadata[sessionId].pendingReveal;
    }

    function getLastRevealWasMine(bytes32 sessionId) external view returns (ebool) {
        _requireExistingSession(sessionId);
        return _lastRevealWasMine[sessionId];
    }

    function getLastRevealCode(bytes32 sessionId) external view returns (euint32) {
        _requireExistingSession(sessionId);
        return _lastRevealCode[sessionId];
    }

    function readLastReveal(bytes32 sessionId) external view returns (bool hitMine, bool ready) {
        _validateSessionPlayer(sessionId, msg.sender);
        uint32 revealCode;
        (revealCode, ready) = FHE.getDecryptResultSafe(_lastRevealCode[sessionId]);
        hitMine = ready && revealCode != 0;
    }

    function getBustedState(bytes32 sessionId) external view returns (ebool) {
        _requireExistingSession(sessionId);
        return _busted[sessionId];
    }

    function maxGrossPayoutForWager(uint8 mineCount, uint256 wager) external pure returns (uint256) {
        _validateMineCount(mineCount);
        return (wager * _multiplierTableBps(mineCount, GRID_SIZE - mineCount)) / BPS_DENOMINATOR;
    }

    function multiplierForSafeReveals(uint8 mineCount, uint8 safeReveals) external pure returns (uint32) {
        _validateMineCount(mineCount);
        uint8 maxSafeReveals = GRID_SIZE - mineCount;
        if (safeReveals > maxSafeReveals) {
            safeReveals = maxSafeReveals;
        }
        return _multiplierTableBps(mineCount, safeReveals);
    }

    function _openSession(address player, uint8 mineCount, uint256 wager, euint32 playerEntropy)
        internal
        returns (bytes32 sessionId)
    {
        uint256 maxGrossPayout =
            (wager * _multiplierTableBps(mineCount, GRID_SIZE - mineCount)) / BPS_DENOMINATOR;

        (sessionId,) = _beginSession(player, wager, maxGrossPayout);

        minesMetadata[sessionId] = MinesMetadata({
            mineCount: mineCount,
            lastTileIndex: 0,
            ready: false,
            pendingReveal: false,
            pendingCashout: false
        });

        _playerEntropy[sessionId] = playerEntropy;
        _safeRevealCount[sessionId] = ENCRYPTED_ZERO_U32;
        _currentMultiplierBps[sessionId] = FHE.asEuint32(BASE_MULTIPLIER_BPS);
        _busted[sessionId] = ENCRYPTED_FALSE;
        _lastRevealWasMine[sessionId] = ENCRYPTED_FALSE;
        _lastRevealCode[sessionId] = ENCRYPTED_ZERO_U32;
        revealedSafeRevealCount[sessionId] = 0;
        revealedCurrentMultiplierBps[sessionId] = BASE_MULTIPLIER_BPS;

        FHE.allowThis(_playerEntropy[sessionId]);
        FHE.allowThis(_safeRevealCount[sessionId]);
        FHE.allowThis(_currentMultiplierBps[sessionId]);
        FHE.allowThis(_busted[sessionId]);
        FHE.allowThis(_lastRevealWasMine[sessionId]);
        FHE.allowThis(_lastRevealCode[sessionId]);
    }

    function _initializeMineGrid(bytes32 sessionId, uint8 mineCount, euint64 encryptedSeed) internal {
        // Gas-light mine placement: derive a private base tile and a private stride from the
        // mixed seed, then walk a coprime progression modulo 25 to get unique mine positions.
        euint32 seed32 = FHE.asEuint32(encryptedSeed);
        euint32 encryptedGridSize = FHE.asEuint32(uint32(GRID_SIZE));
        euint32 encryptedBase = FHE.rem(seed32, encryptedGridSize);
        euint32 encryptedStrideSelector =
            FHE.rem(FHE.shr(seed32, FHE.asEuint32(8)), FHE.asEuint32(20));
        euint32 encryptedStride = _encryptedCoprimeStride(encryptedStrideSelector);
        euint32 currentPosition = encryptedBase;

        for (uint8 mineIndex = 0; mineIndex < mineCount; mineIndex++) {
            _minePositions[sessionId][mineIndex] = currentPosition;
            FHE.allowThis(_minePositions[sessionId][mineIndex]);

            currentPosition = FHE.rem(FHE.add(currentPosition, encryptedStride), encryptedGridSize);
        }
    }

    function _initializeMineGridFromPlaintextSeed(bytes32 sessionId, uint8 mineCount, uint32 seed) internal {
        uint8 currentPosition = uint8(seed % GRID_SIZE);
        uint8 stride = _coprimeStrideAt(uint8((seed >> 8) % 20));

        for (uint8 mineIndex = 0; mineIndex < mineCount; mineIndex++) {
            _minePositions[sessionId][mineIndex] = FHE.asEuint32(currentPosition);
            FHE.allowThis(_minePositions[sessionId][mineIndex]);

            currentPosition = uint8((uint16(currentPosition) + uint16(stride)) % GRID_SIZE);
        }
    }

    function _multiplierForRevealCount(uint8 mineCount, euint32 safeRevealCount)
        internal
        returns (euint32 multiplierBps)
    {
        uint8 maxSafeReveals = GRID_SIZE - mineCount;
        multiplierBps = FHE.asEuint32(BASE_MULTIPLIER_BPS);

        for (uint8 revealCount = 1; revealCount <= maxSafeReveals; revealCount++) {
            ebool isMatch = FHE.eq(safeRevealCount, FHE.asEuint32(revealCount));
            multiplierBps = FHE.select(isMatch, FHE.asEuint32(_multiplierTableBps(mineCount, revealCount)), multiplierBps);
        }
    }

    function _multiplierTableBps(uint8 mineCount, uint8 safeReveals) internal pure returns (uint32) {
        if (safeReveals == 0) {
            return BASE_MULTIPLIER_BPS;
        }

        uint256 multiplierBps = BASE_MULTIPLIER_BPS;
        for (uint8 revealCount = 0; revealCount < safeReveals; revealCount++) {
            multiplierBps =
                (multiplierBps * (GRID_SIZE - revealCount))
                / (GRID_SIZE - mineCount - revealCount);
        }

        if (multiplierBps > MAX_MULTIPLIER_BPS) {
            return MAX_MULTIPLIER_BPS;
        }

        return uint32(multiplierBps);
    }

    function _coprimeStrideAt(uint8 selector) internal pure returns (uint8) {
        uint8[20] memory coprimeStrides = [
            uint8(1),
            2,
            3,
            4,
            6,
            7,
            8,
            9,
            11,
            12,
            13,
            14,
            16,
            17,
            18,
            19,
            21,
            22,
            23,
            24
        ];

        return coprimeStrides[selector];
    }

    function _encryptedCoprimeStride(euint32 encryptedSelector) internal returns (euint32 encryptedStride) {
        encryptedStride = FHE.asEuint32(_coprimeStrideAt(0));

        for (uint8 selector = 0; selector < 20; selector++) {
            ebool isMatch = FHE.eq(encryptedSelector, FHE.asEuint32(selector));
            encryptedStride =
                FHE.select(isMatch, FHE.asEuint32(_coprimeStrideAt(selector)), encryptedStride);
        }
    }

    function _isMineTile(bytes32 sessionId, uint8 mineCount, uint8 tileIndex) internal returns (ebool isMine) {
        euint32 encryptedTileIndex = FHE.asEuint32(tileIndex);
        isMine = ENCRYPTED_FALSE;

        for (uint8 mineIndex = 0; mineIndex < mineCount; mineIndex++) {
            ebool isMatch = FHE.eq(_minePositions[sessionId][mineIndex], encryptedTileIndex);
            isMine = FHE.select(isMatch, ENCRYPTED_TRUE, isMine);
        }
    }

    function _resolvePendingReveal(
        bytes32 sessionId,
        GameSession storage session,
        MinesMetadata storage metadata
    ) internal returns (bool hitMine) {
        uint32 revealCode;
        bool decrypted;
        (revealCode, decrypted) = FHE.getDecryptResultSafe(_lastRevealCode[sessionId]);
        if (!decrypted) {
            revert DecryptResultNotReady(sessionId);
        }
        hitMine = revealCode != 0;

        metadata.pendingReveal = false;

        emit TileRevealFinalized(sessionId, session.player, metadata.lastTileIndex, hitMine);

        if (hitMine) {
            _finalizeSession(sessionId, SessionStatus.LOST, 0);
        } else {
            uint8 nextSafeRevealCount = revealedSafeRevealCount[sessionId] + 1;
            uint32 nextMultiplierBps = _multiplierTableBps(metadata.mineCount, nextSafeRevealCount);

            revealedSafeRevealCount[sessionId] = nextSafeRevealCount;
            revealedCurrentMultiplierBps[sessionId] = nextMultiplierBps;
            _safeRevealCount[sessionId] = FHE.asEuint32(nextSafeRevealCount);
            _currentMultiplierBps[sessionId] = FHE.asEuint32(nextMultiplierBps);

            FHE.allowThis(_safeRevealCount[sessionId]);
            FHE.allowThis(_currentMultiplierBps[sessionId]);
        }
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

    function _validateMineCount(uint8 mineCount) internal pure {
        if (mineCount < MIN_MINES || mineCount > MAX_MINES) {
            revert InvalidMineCount(mineCount, MIN_MINES, MAX_MINES);
        }
    }

    function _tileIndex(uint8 x, uint8 y) internal pure returns (uint8) {
        return (y * GRID_WIDTH) + x;
    }

    function _isLocalDevChain() internal view returns (bool) {
        return block.chainid == 31337 || block.chainid == 1337 || block.chainid == 420105;
    }
}
