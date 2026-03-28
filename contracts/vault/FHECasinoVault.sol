// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract FHECasinoVault is Ownable2Step, ReentrancyGuard {
    using Address for address payable;

    error AmountMustBeNonZero();
    error InsufficientAvailableLiquidity(uint256 available, uint256 required);
    error InvalidAddress(address value);
    error ReservationAlreadyExists(bytes32 sessionId);
    error UnauthorizedGame(address caller);

    mapping(address => bool) public authorizedGames;
    mapping(bytes32 => uint256) public reservedLiquidityBySession;

    uint256 public totalReservedLiquidity;
    uint256 public totalBankrollDeposited;
    uint256 public totalWagered;
    uint256 public totalPaidOut;
    uint256 public accruedHouseFees;

    event BankrollDeposited(address indexed sender, uint256 amount, bool indexed ownerManaged);
    event BankrollWithdrawn(address indexed recipient, uint256 amount);
    event GameAuthorizationUpdated(address indexed game, bool authorized);
    event HouseFeeRecorded(address indexed game, uint256 amount);
    event LiquidityReleased(address indexed game, bytes32 indexed sessionId, uint256 amount);
    event LiquidityReserved(address indexed game, bytes32 indexed sessionId, uint256 amount);
    event PayoutSent(address indexed game, bytes32 indexed sessionId, address indexed player, uint256 amount);
    event WagerRecorded(address indexed game, address indexed player, uint256 amount);

    modifier onlyAuthorizedGame() {
        if (!authorizedGames[msg.sender]) {
            revert UnauthorizedGame(msg.sender);
        }
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {}

    receive() external payable {
        emit BankrollDeposited(msg.sender, msg.value, false);
    }

    function setGameAuthorization(address game, bool authorized) external onlyOwner {
        if (game == address(0)) {
            revert InvalidAddress(game);
        }

        authorizedGames[game] = authorized;
        emit GameAuthorizationUpdated(game, authorized);
    }

    function depositBankroll() external payable onlyOwner {
        if (msg.value == 0) {
            revert AmountMustBeNonZero();
        }

        totalBankrollDeposited += msg.value;
        emit BankrollDeposited(msg.sender, msg.value, true);
    }

    function withdrawBankroll(uint256 amount, address payable recipient) external onlyOwner nonReentrant {
        if (amount == 0) {
            revert AmountMustBeNonZero();
        }
        if (recipient == address(0)) {
            revert InvalidAddress(recipient);
        }

        uint256 available = availableLiquidity();
        if (amount > available) {
            revert InsufficientAvailableLiquidity(available, amount);
        }

        recipient.sendValue(amount);
        emit BankrollWithdrawn(recipient, amount);
    }

    function recordWager(address player) external payable onlyAuthorizedGame {
        if (msg.value == 0) {
            revert AmountMustBeNonZero();
        }
        if (player == address(0)) {
            revert InvalidAddress(player);
        }

        totalWagered += msg.value;
        emit WagerRecorded(msg.sender, player, msg.value);
    }

    function reserveLiquidity(bytes32 sessionId, uint256 amount) external onlyAuthorizedGame {
        if (amount == 0) {
            revert AmountMustBeNonZero();
        }
        if (reservedLiquidityBySession[sessionId] != 0) {
            revert ReservationAlreadyExists(sessionId);
        }

        uint256 available = availableLiquidity();
        if (amount > available) {
            revert InsufficientAvailableLiquidity(available, amount);
        }

        reservedLiquidityBySession[sessionId] = amount;
        totalReservedLiquidity += amount;

        emit LiquidityReserved(msg.sender, sessionId, amount);
    }

    function releaseLiquidity(bytes32 sessionId) public onlyAuthorizedGame {
        uint256 amount = reservedLiquidityBySession[sessionId];
        if (amount == 0) {
            return;
        }

        delete reservedLiquidityBySession[sessionId];
        totalReservedLiquidity -= amount;

        emit LiquidityReleased(msg.sender, sessionId, amount);
    }

    function payout(bytes32 sessionId, address payable player, uint256 amount)
        external
        onlyAuthorizedGame
        nonReentrant
    {
        if (player == address(0)) {
            revert InvalidAddress(player);
        }

        releaseLiquidity(sessionId);

        if (amount == 0) {
            return;
        }

        uint256 balance = address(this).balance;
        if (amount > balance) {
            revert InsufficientAvailableLiquidity(balance, amount);
        }

        totalPaidOut += amount;
        player.sendValue(amount);

        emit PayoutSent(msg.sender, sessionId, player, amount);
    }

    function recordHouseFee(uint256 amount) external onlyAuthorizedGame {
        if (amount == 0) {
            return;
        }

        accruedHouseFees += amount;
        emit HouseFeeRecorded(msg.sender, amount);
    }

    function availableLiquidity() public view returns (uint256) {
        uint256 balance = address(this).balance;
        if (balance <= totalReservedLiquidity) {
            return 0;
        }

        return balance - totalReservedLiquidity;
    }
}

