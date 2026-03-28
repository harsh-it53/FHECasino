// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {InEuint32} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

import {FHEGameBase} from "../base/FHEGameBase.sol";
import {FHEHybridEntropy} from "../base/FHEHybridEntropy.sol";
import {GameSession, SessionStatus} from "../base/FHEGameTypes.sol";

contract FHEHiLo is FHEGameBase, FHEHybridEntropy {
    uint8 public constant FULL_DECK_SIZE = 52;
    uint8 public constant MAX_ROUNDS = 10;
    uint8 public constant DECK_WINDOW_SIZE = MAX_ROUNDS + 1;
    uint8 public constant MIN_CARD_VALUE = 1;
    uint8 public constant MAX_CARD_VALUE = 13;
    uint32 public constant BASE_MULTIPLIER_BPS = 10_000;
    uint32 public constant ROUND_MULTIPLIER_BPS = 19_000;
    uint32 public constant MAX_MULTIPLIER_BPS = 6_131_059;
    uint32 public constant OUTCOME_LOSS = 0;
    uint32 public constant OUTCOME_PUSH = 1;
    uint32 public constant OUTCOME_CORRECT = 2;

    enum GuessDirection {
        HIGHER,
        LOWER
    }

    error DecryptResultNotReady(bytes32 sessionId);
    error GameAlreadyActivated(bytes32 sessionId);
    error GameNotReady(bytes32 sessionId, uint64 readyBlock);
    error InvalidCardValue(uint8 cardIndex, uint8 cardValue);
    error InvalidDeckWindowLength(uint256 provided, uint256 expected);
    error NoPendingCashout(bytes32 sessionId);
    error NoPendingGuess(bytes32 sessionId);
    error NoRemainingDraws(bytes32 sessionId);
    error PendingCashout(bytes32 sessionId);
    error PendingGuess(bytes32 sessionId);
    error PlaintextDeckNotSupported(uint256 chainId);

    struct HiLoMetadata {
        uint8 currentCardIndex;
        uint8 lastGuessDirection;
        bool ready;
        bool pendingGuess;
        bool pendingCashout;
    }

    mapping(bytes32 => HiLoMetadata) public hiLoMetadata;
    mapping(bytes32 => mapping(uint8 => euint32)) private _encryptedDeck;
    mapping(bytes32 => euint32) private _playerEntropy;
    mapping(bytes32 => euint32) private _currentCard;
    mapping(bytes32 => euint32) private _currentMultiplierBps;
    mapping(bytes32 => euint32) private _correctGuessCount;
    mapping(bytes32 => euint32) private _lastOutcomeCode;

    event HiLoGameRequested(
        bytes32 indexed sessionId,
        address indexed player,
        uint256 wager,
        uint64 readyBlock
    );
    event HiLoGameStarted(
        bytes32 indexed sessionId,
        address indexed player,
        uint256 wager
    );
    event GuessRequested(
        bytes32 indexed sessionId,
        address indexed player,
        GuessDirection direction,
        uint8 nextCardIndex
    );
    event GuessFinalized(
        bytes32 indexed sessionId,
        address indexed player,
        uint32 outcomeCode,
        uint256 grossPayout,
        uint256 netPayout,
        uint256 houseFee
    );
    event CashoutRequested(bytes32 indexed sessionId, address indexed player);
    event CashoutFinalized(
        bytes32 indexed sessionId,
        address indexed player,
        uint256 grossPayout,
        uint256 netPayout,
        uint256 houseFee
    );

    constructor(address initialOwner, address vaultAddress)
        FHEGameBase(initialOwner, vaultAddress, 100, 0.001 ether, 0.02 ether)
        FHEHybridEntropy(2)
    {}

    function startGame(InEuint32 calldata playerEntropy)
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

        emit HiLoGameRequested(sessionId, msg.sender, msg.value, readyBlock);
    }

    function activateGame(bytes32 sessionId)
        external
        whenNotPaused
        nonReentrant
        returns (uint32 publicEntropy)
    {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        HiLoMetadata storage metadata = hiLoMetadata[sessionId];

        if (metadata.ready) {
            revert GameAlreadyActivated(sessionId);
        }

        publicEntropy = _resolveHybridEntropy(sessionId, session.player);

        euint64 encryptedSeed =
            FHE.xor(FHE.asEuint64(_playerEntropy[sessionId]), FHE.asEuint64(uint64(publicEntropy)));
        _initializeDeckWindowFromEncryptedSeed(sessionId, encryptedSeed);

        metadata.ready = true;

        emit HiLoGameStarted(sessionId, session.player, session.wager);
    }

    function startGameWithPlaintextCards(uint8[] calldata cards)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (bytes32 sessionId)
    {
        if (!_isLocalDevChain()) {
            revert PlaintextDeckNotSupported(block.chainid);
        }
        if (cards.length != DECK_WINDOW_SIZE) {
            revert InvalidDeckWindowLength(cards.length, DECK_WINDOW_SIZE);
        }

        sessionId = _openSession(msg.sender, msg.value, FHE.asEuint32(0));
        _initializeDeckWindowFromPlaintextCards(sessionId, cards);
        hiLoMetadata[sessionId].ready = true;

        emit HiLoGameStarted(sessionId, msg.sender, msg.value);
    }

    function startGameWithPlaintextEntropy(uint32 playerEntropy)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (bytes32 sessionId)
    {
        if (!_isLocalDevChain()) {
            revert PlaintextDeckNotSupported(block.chainid);
        }

        euint32 encryptedPlayerEntropy = FHE.asEuint32(playerEntropy);
        FHE.allowThis(encryptedPlayerEntropy);

        sessionId = _openSession(msg.sender, msg.value, encryptedPlayerEntropy);
        uint64 readyBlock = _requestHybridEntropy(sessionId, msg.sender);

        emit HiLoGameRequested(sessionId, msg.sender, msg.value, readyBlock);
    }

    function submitGuess(bytes32 sessionId, GuessDirection direction)
        external
        whenNotPaused
        nonReentrant
    {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        HiLoMetadata storage metadata = hiLoMetadata[sessionId];

        if (!metadata.ready) {
            revert GameNotReady(sessionId, _entropyReadyBlock(sessionId));
        }
        if (metadata.pendingGuess) {
            revert PendingGuess(sessionId);
        }
        if (metadata.pendingCashout) {
            revert PendingCashout(sessionId);
        }
        if (metadata.currentCardIndex + 1 >= DECK_WINDOW_SIZE) {
            revert NoRemainingDraws(sessionId);
        }

        uint8 nextCardIndex = metadata.currentCardIndex + 1;
        _applyGuessTransition(sessionId, direction, nextCardIndex);

        _grantViewerAccess(msg.sender, _currentCard[sessionId]);
        _grantViewerAccess(msg.sender, _currentMultiplierBps[sessionId]);
        _grantViewerAccess(msg.sender, _correctGuessCount[sessionId]);
        _grantViewerAccess(msg.sender, _lastOutcomeCode[sessionId]);

        FHE.decrypt(_currentCard[sessionId]);
        FHE.decrypt(_currentMultiplierBps[sessionId]);
        FHE.decrypt(_lastOutcomeCode[sessionId]);

        metadata.pendingGuess = true;
        metadata.lastGuessDirection = uint8(direction);
        metadata.currentCardIndex = nextCardIndex;

        emit GuessRequested(sessionId, session.player, direction, nextCardIndex);
    }

    function finalizeGuess(bytes32 sessionId)
        external
        whenNotPaused
        nonReentrant
        returns (uint32 outcomeCode, uint256 grossPayout, uint256 netPayout, uint256 houseFee)
    {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        HiLoMetadata storage metadata = hiLoMetadata[sessionId];

        if (!metadata.pendingGuess) {
            revert NoPendingGuess(sessionId);
        }

        bool outcomeReady;
        (outcomeCode, outcomeReady) = FHE.getDecryptResultSafe(_lastOutcomeCode[sessionId]);
        uint32 multiplierBps;
        bool multiplierReady;
        (multiplierBps, multiplierReady) = FHE.getDecryptResultSafe(_currentMultiplierBps[sessionId]);
        if (!outcomeReady || !multiplierReady) {
            revert DecryptResultNotReady(sessionId);
        }

        metadata.pendingGuess = false;

        if (outcomeCode == OUTCOME_LOSS) {
            _finalizeSession(sessionId, SessionStatus.LOST, 0);
        } else if (metadata.currentCardIndex == MAX_ROUNDS) {
            grossPayout = (uint256(session.wager) * multiplierBps) / BPS_DENOMINATOR;
            (netPayout, houseFee) = _finalizeSession(sessionId, SessionStatus.WON, grossPayout);
        }

        emit GuessFinalized(
            sessionId,
            session.player,
            outcomeCode,
            grossPayout,
            netPayout,
            houseFee
        );
    }

    function requestCashout(bytes32 sessionId) external whenNotPaused nonReentrant {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        HiLoMetadata storage metadata = hiLoMetadata[sessionId];

        if (!metadata.ready) {
            revert GameNotReady(sessionId, _entropyReadyBlock(sessionId));
        }
        if (metadata.pendingGuess) {
            revert PendingGuess(sessionId);
        }
        if (metadata.pendingCashout) {
            revert PendingCashout(sessionId);
        }

        metadata.pendingCashout = true;

        _grantViewerAccess(msg.sender, _currentMultiplierBps[sessionId]);
        _grantViewerAccess(msg.sender, _correctGuessCount[sessionId]);
        FHE.decrypt(_currentMultiplierBps[sessionId]);

        emit CashoutRequested(sessionId, session.player);
    }

    function finalizeCashout(bytes32 sessionId)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 grossPayout, uint256 netPayout, uint256 houseFee)
    {
        GameSession storage session = _requirePlayerActiveSession(sessionId, msg.sender);
        HiLoMetadata storage metadata = hiLoMetadata[sessionId];

        if (!metadata.pendingCashout) {
            revert NoPendingCashout(sessionId);
        }

        uint32 multiplierBps;
        bool decrypted;
        (multiplierBps, decrypted) = FHE.getDecryptResultSafe(_currentMultiplierBps[sessionId]);
        if (!decrypted) {
            revert DecryptResultNotReady(sessionId);
        }

        metadata.pendingCashout = false;

        grossPayout = (uint256(session.wager) * multiplierBps) / BPS_DENOMINATOR;
        (netPayout, houseFee) = _finalizeSession(sessionId, SessionStatus.CASHED_OUT, grossPayout);

        emit CashoutFinalized(sessionId, session.player, grossPayout, netPayout, houseFee);
    }

    function getDeckCard(bytes32 sessionId, uint8 cardIndex) external view returns (euint32) {
        _requireExistingSession(sessionId);
        if (cardIndex >= DECK_WINDOW_SIZE) {
            revert NoRemainingDraws(sessionId);
        }
        return _encryptedDeck[sessionId][cardIndex];
    }

    function getCurrentCard(bytes32 sessionId) external view returns (euint32) {
        _requireExistingSession(sessionId);
        return _currentCard[sessionId];
    }

    function readCurrentCard(bytes32 sessionId) external view returns (uint32 cardValue, bool ready) {
        _validateSessionPlayer(sessionId, msg.sender);
        (cardValue, ready) = FHE.getDecryptResultSafe(_currentCard[sessionId]);
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
        (multiplierBps, ready) = FHE.getDecryptResultSafe(_currentMultiplierBps[sessionId]);
    }

    function getCorrectGuessCount(bytes32 sessionId) external view returns (euint32) {
        _requireExistingSession(sessionId);
        return _correctGuessCount[sessionId];
    }

    function getLastOutcomeCode(bytes32 sessionId) external view returns (euint32) {
        _requireExistingSession(sessionId);
        return _lastOutcomeCode[sessionId];
    }

    function readLastOutcome(bytes32 sessionId) external view returns (uint32 outcomeCode, bool ready) {
        _validateSessionPlayer(sessionId, msg.sender);
        (outcomeCode, ready) = FHE.getDecryptResultSafe(_lastOutcomeCode[sessionId]);
    }

    function maxGrossPayoutForWager(uint256 wager) external pure returns (uint256) {
        return (wager * _multiplierTableBps(MAX_ROUNDS)) / BPS_DENOMINATOR;
    }

    function multiplierForCorrectGuesses(uint8 correctGuesses) external pure returns (uint32) {
        return _multiplierTableBps(correctGuesses);
    }

    function _openSession(address player, uint256 wager, euint32 playerEntropy)
        internal
        returns (bytes32 sessionId)
    {
        uint256 maxGrossPayout = (wager * _multiplierTableBps(MAX_ROUNDS)) / BPS_DENOMINATOR;
        (sessionId,) = _beginSession(player, wager, maxGrossPayout);

        hiLoMetadata[sessionId] = HiLoMetadata({
            currentCardIndex: 0,
            lastGuessDirection: uint8(GuessDirection.HIGHER),
            ready: false,
            pendingGuess: false,
            pendingCashout: false
        });

        _playerEntropy[sessionId] = playerEntropy;
        _currentMultiplierBps[sessionId] = FHE.asEuint32(BASE_MULTIPLIER_BPS);
        _correctGuessCount[sessionId] = ENCRYPTED_ZERO_U32;
        _lastOutcomeCode[sessionId] = ENCRYPTED_ZERO_U32;

        FHE.allowThis(_playerEntropy[sessionId]);
        FHE.allowThis(_currentMultiplierBps[sessionId]);
        FHE.allowThis(_correctGuessCount[sessionId]);
        FHE.allowThis(_lastOutcomeCode[sessionId]);
    }

    function _initializeDeckWindowFromEncryptedSeed(bytes32 sessionId, euint64 encryptedSeed) internal {
        // LCG constants: currentSeed = (currentSeed * LCG_A + LCG_C)
        // Using Knuth LCG constants for 64-bit: A = 6364136223846793005, C = 1442695040888963407
        euint64 lcgA = FHE.asEuint64(6364136223846793005);
        euint64 lcgC = FHE.asEuint64(1442695040888963407);
        euint64 encryptedThirteen = FHE.asEuint64(uint64(MAX_CARD_VALUE));

        euint64 currentSeed = encryptedSeed;

        for (uint8 cardIndex = 0; cardIndex < DECK_WINDOW_SIZE; cardIndex++) {
            // Advance the LCG state
            currentSeed = FHE.add(FHE.mul(currentSeed, lcgA), lcgC);

            // Extract card value: (currentSeed % 13) + 1
            euint64 cardValue64 = FHE.add(FHE.rem(currentSeed, encryptedThirteen), FHE.asEuint64(1));
            euint32 cardValue = FHE.asEuint32(cardValue64);

            _encryptedDeck[sessionId][cardIndex] = cardValue;
            FHE.allowThis(_encryptedDeck[sessionId][cardIndex]);
        }

        _currentCard[sessionId] = _encryptedDeck[sessionId][0];
        FHE.allowThis(_currentCard[sessionId]);
        FHE.decrypt(_currentCard[sessionId]);
    }

    function _initializeDeckWindowFromPlaintextCards(bytes32 sessionId, uint8[] calldata cards) internal {
        for (uint8 cardIndex = 0; cardIndex < DECK_WINDOW_SIZE; cardIndex++) {
            uint8 cardValue = cards[cardIndex];
            _validateCardValue(cardIndex, cardValue);

            _encryptedDeck[sessionId][cardIndex] = _uniqueEncryptedCard(cardValue, cardIndex);
            FHE.allowThis(_encryptedDeck[sessionId][cardIndex]);
        }

        _currentCard[sessionId] = _encryptedDeck[sessionId][0];
        FHE.allowThis(_currentCard[sessionId]);
        FHE.decrypt(_currentCard[sessionId]);
    }

    function _applyGuessTransition(bytes32 sessionId, GuessDirection direction, uint8 nextCardIndex)
        internal
    {
        euint32 nextCard = _encryptedDeck[sessionId][nextCardIndex];
        (ebool isCorrect, ebool isEqual) =
            _resolveGuessFlags(direction, _currentCard[sessionId], nextCard);
        euint32 nextCorrectCount = _resolveNextCorrectCount(sessionId, isCorrect);
        euint32 nextMultiplier =
            _resolveNextMultiplier(sessionId, isCorrect, isEqual, nextCorrectCount);
        euint32 outcomeCode = _resolveOutcomeCode(isCorrect, isEqual);

        _currentCard[sessionId] = nextCard;
        _currentMultiplierBps[sessionId] = nextMultiplier;
        _correctGuessCount[sessionId] = nextCorrectCount;
        _lastOutcomeCode[sessionId] = outcomeCode;

        FHE.allowThis(_currentCard[sessionId]);
        FHE.allowThis(_currentMultiplierBps[sessionId]);
        FHE.allowThis(_correctGuessCount[sessionId]);
        FHE.allowThis(_lastOutcomeCode[sessionId]);
        FHE.decrypt(_currentCard[sessionId]);
    }

    function _resolveGuessFlags(GuessDirection direction, euint32 currentCard, euint32 nextCard)
        internal
        returns (ebool isCorrect, ebool isEqual)
    {
        ebool isHigher = FHE.gt(nextCard, currentCard);
        ebool isLower = FHE.lt(nextCard, currentCard);
        isEqual = FHE.eq(nextCard, currentCard);
        isCorrect = direction == GuessDirection.HIGHER ? isHigher : isLower;
    }

    function _resolveNextCorrectCount(bytes32 sessionId, ebool isCorrect)
        internal
        returns (euint32 nextCorrectCount)
    {
        euint32 incrementedCorrectCount = FHE.add(_correctGuessCount[sessionId], ENCRYPTED_ONE_U32);
        nextCorrectCount =
            FHE.select(isCorrect, incrementedCorrectCount, _correctGuessCount[sessionId]);
    }

    function _resolveNextMultiplier(
        bytes32 sessionId,
        ebool isCorrect,
        ebool isEqual,
        euint32 nextCorrectCount
    ) internal returns (euint32 nextMultiplier) {
        euint32 multiplierIfResolved =
            FHE.select(isCorrect, _multiplierForCorrectGuesses(nextCorrectCount), ENCRYPTED_ZERO_U32);
        nextMultiplier = FHE.select(isEqual, _currentMultiplierBps[sessionId], multiplierIfResolved);
    }

    function _resolveOutcomeCode(ebool isCorrect, ebool isEqual)
        internal
        returns (euint32 outcomeCode)
    {
        euint32 encryptedPushCode = FHE.asEuint32(OUTCOME_PUSH);
        euint32 encryptedCorrectCode = FHE.asEuint32(OUTCOME_CORRECT);
        euint32 encryptedLossCode = FHE.asEuint32(OUTCOME_LOSS);
        euint32 resolvedOutcome = FHE.select(isCorrect, encryptedCorrectCode, encryptedLossCode);
        outcomeCode = FHE.select(isEqual, encryptedPushCode, resolvedOutcome);
    }

    function _uniqueEncryptedCard(uint8 cardValue, uint8 cardIndex) internal returns (euint32) {
        euint32 baseValue = FHE.asEuint32(cardValue);
        euint32 salt = FHE.asEuint32(cardIndex + 1);
        euint32 uniqueZero = FHE.sub(salt, salt);
        return FHE.add(baseValue, uniqueZero);
    }

    function _multiplierForCorrectGuesses(euint32 correctGuessCount)
        internal
        returns (euint32 multiplierBps)
    {
        multiplierBps = FHE.asEuint32(BASE_MULTIPLIER_BPS);
        for (uint8 correctGuesses = 1; correctGuesses <= MAX_ROUNDS; correctGuesses++) {
            ebool isMatch = FHE.eq(correctGuessCount, FHE.asEuint32(correctGuesses));
            multiplierBps = FHE.select(
                isMatch,
                FHE.asEuint32(_multiplierTableBps(correctGuesses)),
                multiplierBps
            );
        }
    }

    function _multiplierTableBps(uint8 correctGuesses) internal pure returns (uint32) {
        if (correctGuesses == 0) {
            return BASE_MULTIPLIER_BPS;
        }
        if (correctGuesses > MAX_ROUNDS) {
            correctGuesses = MAX_ROUNDS;
        }

        uint256 multiplierBps = BASE_MULTIPLIER_BPS;
        for (uint8 guessCount = 0; guessCount < correctGuesses; guessCount++) {
            multiplierBps = (multiplierBps * ROUND_MULTIPLIER_BPS) / BPS_DENOMINATOR;
        }

        if (multiplierBps > MAX_MULTIPLIER_BPS) {
            return MAX_MULTIPLIER_BPS;
        }

        return uint32(multiplierBps);
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

    function _validateCardValue(uint8 cardIndex, uint8 cardValue) internal pure {
        if (cardValue < MIN_CARD_VALUE || cardValue > MAX_CARD_VALUE) {
            revert InvalidCardValue(cardIndex, cardValue);
        }
    }

    function _isLocalDevChain() internal view returns (bool) {
        return block.chainid == 31337 || block.chainid == 1337 || block.chainid == 420105;
    }
}
