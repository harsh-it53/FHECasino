// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

abstract contract FHEHybridEntropy {
    struct HybridEntropyState {
        uint64 readyBlock;
        bool resolved;
        uint32 publicEntropy;
    }

    error EntropyAlreadyRequested(bytes32 sessionId);
    error EntropyAlreadyResolved(bytes32 sessionId);
    error EntropyDelayBlocksZero();
    error EntropyNotReady(bytes32 sessionId, uint64 readyBlock, uint256 currentBlock);
    error EntropyNotRequested(bytes32 sessionId);
    error EntropyWindowMissed(bytes32 sessionId, uint64 readyBlock, uint256 currentBlock);

    uint8 public immutable entropyDelayBlocks;

    mapping(bytes32 => HybridEntropyState) internal hybridEntropyBySession;

    event HybridEntropyRequested(
        bytes32 indexed sessionId,
        address indexed player,
        uint64 readyBlock
    );
    event HybridEntropyResolved(
        bytes32 indexed sessionId,
        uint32 publicEntropy,
        bytes32 blockHash
    );

    constructor(uint8 initialEntropyDelayBlocks) {
        if (initialEntropyDelayBlocks == 0) {
            revert EntropyDelayBlocksZero();
        }

        entropyDelayBlocks = initialEntropyDelayBlocks;
    }

    function hybridEntropyState(bytes32 sessionId)
        external
        view
        returns (uint64 readyBlock, bool ready, bool resolved, uint32 publicEntropy)
    {
        HybridEntropyState memory state = hybridEntropyBySession[sessionId];
        readyBlock = state.readyBlock;
        ready = _isEntropyReady(state);
        resolved = state.resolved;
        publicEntropy = state.publicEntropy;
    }

    function _requestHybridEntropy(bytes32 sessionId, address player)
        internal
        returns (uint64 readyBlock)
    {
        HybridEntropyState storage state = hybridEntropyBySession[sessionId];
        if (state.readyBlock != 0) {
            revert EntropyAlreadyRequested(sessionId);
        }

        readyBlock = uint64(block.number + uint256(entropyDelayBlocks));
        state.readyBlock = readyBlock;

        emit HybridEntropyRequested(sessionId, player, readyBlock);
    }

    function _resolveHybridEntropy(bytes32 sessionId, address player)
        internal
        returns (uint32 publicEntropy)
    {
        HybridEntropyState storage state = hybridEntropyBySession[sessionId];
        if (state.readyBlock == 0) {
            revert EntropyNotRequested(sessionId);
        }
        if (state.resolved) {
            revert EntropyAlreadyResolved(sessionId);
        }
        if (block.number <= state.readyBlock) {
            revert EntropyNotReady(sessionId, state.readyBlock, block.number);
        }

        bytes32 entropyBlockHash = blockhash(uint256(state.readyBlock));
        if (entropyBlockHash == bytes32(0)) {
            revert EntropyWindowMissed(sessionId, state.readyBlock, block.number);
        }

        publicEntropy = uint32(
            uint256(
                keccak256(
                    abi.encode(
                        entropyBlockHash,
                        sessionId,
                        player,
                        address(this),
                        block.chainid
                    )
                )
            )
        );

        state.resolved = true;
        state.publicEntropy = publicEntropy;

        emit HybridEntropyResolved(sessionId, publicEntropy, entropyBlockHash);
    }

    function _entropyReadyBlock(bytes32 sessionId) internal view returns (uint64) {
        return hybridEntropyBySession[sessionId].readyBlock;
    }

    function _isEntropyResolved(bytes32 sessionId) internal view returns (bool) {
        return hybridEntropyBySession[sessionId].resolved;
    }

    function _isEntropyReady(HybridEntropyState memory state) private view returns (bool) {
        if (state.readyBlock == 0 || state.resolved) {
            return false;
        }

        return block.number > state.readyBlock;
    }
}
