// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {IHook} from "@zerodev/kernel/interfaces/IERC7579Modules.sol";
import {MODULE_TYPE_HOOK} from "@zerodev/kernel/types/Constants.sol";
import {MorbitStorage} from "./MorbitStorage.sol";
import {MorbitPolicy} from "./MorbitPolicy.sol";

/// @title MorbitHook
/// @notice Kernel v3 hook that records spend only after a successful canonical execution.
/// @dev Kernel invokes `postCheck` only after execution succeeds; a reverted call
///      never reaches it, so failed executions cannot consume the daily limit.
contract MorbitHook is IHook {
    MorbitStorage public immutable storageContract;
    MorbitPolicy public immutable policy;

    mapping(address account => bool initialized) private _initialized;

    error InvalidHookCaller(address caller);
    error InvalidExecution();

    event ExecutionRecorded(
        address indexed account, address indexed token, address indexed target, uint256 amount, uint256 timestamp
    );

    constructor(MorbitStorage storage_, MorbitPolicy policy_) {
        storageContract = storage_;
        policy = policy_;
    }

    /// @notice Marks the calling Kernel account as eligible to use this hook.
    function onInstall(bytes calldata) external payable override {
        _initialized[msg.sender] = true;
    }

    function onUninstall(bytes calldata) external payable override {
        if (!_initialized[msg.sender]) revert InvalidHookCaller(msg.sender);
        delete _initialized[msg.sender];
    }

    /// @notice Re-validates the exact execution data and passes its context to `postCheck`.
    function preCheck(address, uint256, bytes calldata msgData)
        external
        payable
        override
        returns (bytes memory hookData)
    {
        if (!_initialized[msg.sender]) revert InvalidHookCaller(msg.sender);

        (bool approved, address token, address target, uint256 amount) =
            policy.inspectExecutionPayload(msg.sender, msgData);
        if (!approved) revert InvalidExecution();

        return abi.encode(msg.sender, token, target, amount);
    }

    /// @notice Records spend after Kernel has successfully executed the operation.
    /// @dev Kernel v3 does not pass a `success` flag: this callback is skipped when
    ///      execution reverts, which is stronger than trusting a boolean argument.
    function postCheck(bytes calldata hookData) external payable override {
        (address account, address token, address target, uint256 amount) =
            abi.decode(hookData, (address, address, address, uint256));
        if (msg.sender != account || !_initialized[account]) revert InvalidHookCaller(msg.sender);

        storageContract.recordSpend(account, amount);
        emit ExecutionRecorded(account, token, target, amount, block.timestamp);
    }

    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == MODULE_TYPE_HOOK;
    }

    function isInitialized(address smartAccount) external view override returns (bool) {
        return _initialized[smartAccount];
    }
}
