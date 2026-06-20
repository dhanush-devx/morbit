// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {IPolicy} from "@zerodev/kernel/interfaces/IERC7579Modules.sol";
import {PackedUserOperation} from "@zerodev/kernel/interfaces/PackedUserOperation.sol";
import {
    MODULE_TYPE_POLICY,
    SIG_VALIDATION_FAILED_UINT,
    SIG_VALIDATION_SUCCESS_UINT
} from "@zerodev/kernel/types/Constants.sol";
import {MorbitStorage} from "./MorbitStorage.sol";

/// @title MorbitPolicy
/// @notice Kernel v3 policy module that rejects any execution outside Morbit's strict action grammar.
/// @dev A permission binds one authorized session agent to one Kernel account at installation.
contract MorbitPolicy is IPolicy {
    bytes4 public constant KERNEL_EXECUTE_SELECTOR = 0xe9ae5c53; // execute(bytes32,bytes)
    bytes4 public constant ERC20_TRANSFER_SELECTOR = 0xa9059cbb; // transfer(address,uint256)

    MorbitStorage public immutable storageContract;

    mapping(address account => mapping(bytes32 permissionId => address agent)) public permissionAgent;
    mapping(address account => uint256 permissionCount) private _permissionCount;

    error InvalidInstallData();
    error PermissionAlreadyInstalled(address account, bytes32 permissionId);
    error PermissionNotInstalled(address account, bytes32 permissionId);

    /// @param storage_ Shared storage that holds limits and allowlists.
    constructor(MorbitStorage storage_) {
        storageContract = storage_;
    }

    /// @notice Binds a Kernel permission ID to an authorized AI session key.
    /// @dev Kernel passes `bytes32(permissionId) ++ address(agent)` as packed install data.
    function onInstall(bytes calldata data) external payable override {
        if (data.length != 52) revert InvalidInstallData();

        bytes32 permissionId = bytes32(data[0:32]);
        address agent = address(bytes20(data[32:52]));
        if (permissionAgent[msg.sender][permissionId] != address(0)) {
            revert PermissionAlreadyInstalled(msg.sender, permissionId);
        }

        permissionAgent[msg.sender][permissionId] = agent;
        unchecked {
            ++_permissionCount[msg.sender];
        }
    }

    /// @notice Removes a permission-to-agent binding during Kernel permission teardown.
    function onUninstall(bytes calldata data) external payable override {
        if (data.length < 32) revert InvalidInstallData();

        bytes32 permissionId = bytes32(data[0:32]);
        if (permissionAgent[msg.sender][permissionId] == address(0)) {
            revert PermissionNotInstalled(msg.sender, permissionId);
        }

        delete permissionAgent[msg.sender][permissionId];
        unchecked {
            --_permissionCount[msg.sender];
        }
    }

    /// @notice Validates a session-key UserOperation before Kernel executes it.
    /// @dev Only canonical `execute(bytes32,bytes)` with the default single-call
    ///      mode is permitted. Batch, delegatecall, try-execute, and unknown ABI
    ///      selectors fail closed.
    function checkUserOpPolicy(bytes32 permissionId, PackedUserOperation calldata userOp)
        external
        payable
        override
        returns (uint256)
    {
        address agent = permissionAgent[msg.sender][permissionId];
        if (agent == address(0) || !storageContract.authorizedAgents(agent)) {
            return SIG_VALIDATION_FAILED_UINT;
        }

        return
            _validateFullExecute(msg.sender, userOp.callData) ? SIG_VALIDATION_SUCCESS_UINT : SIG_VALIDATION_FAILED_UINT;
    }

    /// @notice Validates an ERC-1271 permission request against its installed agent binding.
    function checkSignaturePolicy(bytes32 permissionId, address sender, bytes32, bytes calldata)
        external
        view
        override
        returns (uint256)
    {
        address agent = permissionAgent[sender][permissionId];
        return agent != address(0) && storageContract.authorizedAgents(agent)
            ? SIG_VALIDATION_SUCCESS_UINT
            : SIG_VALIDATION_FAILED_UINT;
    }

    /// @notice Helper for consumers that already split a canonical execute call into target/data.
    /// @dev Native MON value cannot be represented by this helper; use
    ///      `inspectExecution` for the full canonical payload.
    function validatePolicy(address sender, address target, bytes calldata data) external view returns (uint256) {
        return _validateAction(sender, target, 0, data) ? SIG_VALIDATION_SUCCESS_UINT : SIG_VALIDATION_FAILED_UINT;
    }

    /// @notice Parses and validates full canonical `execute(bytes32,bytes)` calldata.
    function inspectExecution(address account, bytes calldata executeCallData)
        external
        view
        returns (bool approved, address token, address target, uint256 amount)
    {
        return _inspectFullExecute(account, executeCallData);
    }

    /// @notice Parses Kernel's execute arguments passed to a hook after the selector is stripped.
    function inspectExecutionPayload(address account, bytes calldata executePayload)
        external
        view
        returns (bool approved, address token, address target, uint256 amount)
    {
        return _inspectExecutePayload(account, executePayload);
    }

    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == MODULE_TYPE_POLICY;
    }

    function isInitialized(address smartAccount) external view override returns (bool) {
        return _permissionCount[smartAccount] != 0;
    }

    function _validateFullExecute(address account, bytes calldata executeCallData) private view returns (bool) {
        (bool approved,,,) = _inspectFullExecute(account, executeCallData);
        return approved;
    }

    function _inspectFullExecute(address account, bytes calldata executeCallData)
        private
        view
        returns (bool approved, address token, address target, uint256 amount)
    {
        if (executeCallData.length < 4 || bytes4(executeCallData[0:4]) != KERNEL_EXECUTE_SELECTOR) {
            return (false, address(0), address(0), 0);
        }
        return _inspectExecutePayload(account, executeCallData[4:]);
    }

    function _inspectExecutePayload(address account, bytes calldata executePayload)
        private
        view
        returns (bool approved, address token, address target, uint256 amount)
    {
        // ABI-encoded arguments: bytes32 mode, bytes executionCalldata.
        if (executePayload.length < 96) return (false, address(0), address(0), 0);
        (bytes32 mode, bytes memory executionCalldata) = abi.decode(executePayload, (bytes32, bytes));

        // Kernel's default single-call/revert-on-failure mode is all zeroes.
        if (mode != bytes32(0) || executionCalldata.length < 52) {
            return (false, address(0), address(0), 0);
        }

        target = _readAddress(executionCalldata, 0);
        uint256 value = _readUint256(executionCalldata, 20);
        bytes memory callData = _slice(executionCalldata, 52);

        if (callData.length == 0) {
            token = address(0); // Native MON sentinel.
            amount = value;
            return (_validateAction(account, target, amount, callData), token, target, amount);
        }

        // A token transfer cannot also send native MON in this narrow grammar.
        if (value != 0 || callData.length != 68 || _readSelector(callData) != ERC20_TRANSFER_SELECTOR) {
            return (false, address(0), target, 0);
        }

        token = target;
        amount = _readUint256(callData, 36);
        if (!storageContract.allowedTokens(token)) return (false, token, target, amount);

        return (_validateAction(account, target, amount, callData), token, target, amount);
    }

    function _validateAction(address account, address target, uint256 amount, bytes memory callData)
        private
        view
        returns (bool)
    {
        if (target == address(0) || !storageContract.allowedContracts(target)) return false;
        if (callData.length == 0 && !storageContract.allowedTokens(address(0))) return false;
        if (amount > storageContract.txLimit()) return false;
        return storageContract.checkDailyLimit(account, amount);
    }

    function _slice(bytes memory data, uint256 start) private pure returns (bytes memory result) {
        if (start > data.length) return bytes("");
        uint256 length = data.length - start;
        result = new bytes(length);
        for (uint256 i; i < length;) {
            result[i] = data[start + i];
            unchecked {
                ++i;
            }
        }
    }

    function _readAddress(bytes memory data, uint256 offset) private pure returns (address value) {
        assembly ("memory-safe") {
            value := shr(96, mload(add(add(data, 0x20), offset)))
        }
    }

    function _readUint256(bytes memory data, uint256 offset) private pure returns (uint256 value) {
        assembly ("memory-safe") {
            value := mload(add(add(data, 0x20), offset))
        }
    }

    function _readSelector(bytes memory data) private pure returns (bytes4 selector) {
        assembly ("memory-safe") {
            selector := mload(add(data, 0x20))
        }
    }
}
