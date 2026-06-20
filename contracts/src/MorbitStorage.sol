// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MorbitStorage
/// @notice Shared, owner-governed state for Morbit Kernel policy and hook modules.
/// @dev Limits are denominated in the asset amount supplied by a permitted
///      single-call execution. The hook is the sole writer of spending state.
contract MorbitStorage is Ownable {
    mapping(address account => uint256 amount) public dailySpent;
    mapping(address account => uint256 day) public lastResetDay;
    uint256 public dailyLimit;
    uint256 public txLimit;
    mapping(address token => bool allowed) public allowedTokens;
    mapping(address target => bool allowed) public allowedContracts;
    mapping(address agent => bool authorized) public authorizedAgents;

    address public policy;
    address public hook;

    error ZeroAddress();
    error InvalidLimit();
    error ModulesAlreadyConfigured();
    error UnauthorizedWriter(address caller);
    error DailyLimitExceeded(uint256 requested, uint256 remaining);

    event DailyLimitUpdated(uint256 dailyLimit);
    event TxLimitUpdated(uint256 txLimit);
    event TokenAllowlistUpdated(address indexed token, bool allowed);
    event ContractAllowlistUpdated(address indexed target, bool allowed);
    event AgentAuthorized(address indexed agent);
    event AgentRevoked(address indexed agent);
    event SpendRecorded(address indexed account, uint256 amount, uint256 totalForDay, uint256 day);
    event ModulesConfigured(address indexed policy, address indexed hook);

    /// @param initialOwner Policy administrator, normally the user-owned Kernel.
    /// @param initialDailyLimit Maximum spend for an account in a UTC day.
    /// @param initialTxLimit Maximum spend for one canonical execution.
    constructor(address initialOwner, uint256 initialDailyLimit, uint256 initialTxLimit) Ownable(initialOwner) {
        _setLimits(initialDailyLimit, initialTxLimit);
    }

    /// @notice Configures the policy/hook pair once after their deployment.
    /// @dev Constructor-only wiring is impossible because Hook and Storage have a
    ///      circular dependency. This one-time owner operation closes setup.
    function configureModules(address policy_, address hook_) external onlyOwner {
        if (policy != address(0) || hook != address(0)) revert ModulesAlreadyConfigured();
        if (policy_ == address(0) || hook_ == address(0)) revert ZeroAddress();
        policy = policy_;
        hook = hook_;
        emit ModulesConfigured(policy_, hook_);
    }

    function setDailyLimit(uint256 newDailyLimit) external onlyOwner {
        _setLimits(newDailyLimit, txLimit);
    }

    function setTxLimit(uint256 newTxLimit) external onlyOwner {
        _setLimits(dailyLimit, newTxLimit);
    }

    function allowToken(address token) external onlyOwner {
        allowedTokens[token] = true;
        emit TokenAllowlistUpdated(token, true);
    }

    function disallowToken(address token) external onlyOwner {
        allowedTokens[token] = false;
        emit TokenAllowlistUpdated(token, false);
    }

    function allowContract(address target) external onlyOwner {
        if (target == address(0)) revert ZeroAddress();
        allowedContracts[target] = true;
        emit ContractAllowlistUpdated(target, true);
    }

    function disallowContract(address target) external onlyOwner {
        allowedContracts[target] = false;
        emit ContractAllowlistUpdated(target, false);
    }

    function authorizeAgent(address agent) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        authorizedAgents[agent] = true;
        emit AgentAuthorized(agent);
    }

    function revokeAgent(address agent) external onlyOwner {
        authorizedAgents[agent] = false;
        emit AgentRevoked(agent);
    }

    /// @notice Records spend after the Kernel reports a successful execution.
    function recordSpend(address account, uint256 amount) external {
        if (msg.sender != hook) revert UnauthorizedWriter(msg.sender);

        uint256 spent = _currentDailySpent(account);
        uint256 remaining = spent >= dailyLimit ? 0 : dailyLimit - spent;
        if (amount > remaining) revert DailyLimitExceeded(amount, remaining);

        uint256 day = _currentDay();
        dailySpent[account] = spent + amount;
        lastResetDay[account] = day;
        emit SpendRecorded(account, amount, spent + amount, day);
    }

    /// @notice Returns whether an amount is inside the account's current UTC-day allowance.
    function checkDailyLimit(address account, uint256 amount) public view returns (bool) {
        uint256 spent = _currentDailySpent(account);
        return spent <= dailyLimit && amount <= dailyLimit - spent;
    }

    /// @notice Clears an account's tracked spend before the next automatic day rollover.
    function resetDailySpent(address account) external onlyOwner {
        dailySpent[account] = 0;
        lastResetDay[account] = _currentDay();
    }

    /// @notice Returns the spend that currently counts toward the daily limit.
    function currentDailySpent(address account) external view returns (uint256) {
        return _currentDailySpent(account);
    }

    function _setLimits(uint256 newDailyLimit, uint256 newTxLimit) private {
        if (newDailyLimit == 0 || newTxLimit == 0 || newTxLimit > newDailyLimit) revert InvalidLimit();
        dailyLimit = newDailyLimit;
        txLimit = newTxLimit;
        emit DailyLimitUpdated(newDailyLimit);
        emit TxLimitUpdated(newTxLimit);
    }

    function _currentDailySpent(address account) private view returns (uint256) {
        return lastResetDay[account] == _currentDay() ? dailySpent[account] : 0;
    }

    function _currentDay() private view returns (uint256) {
        return block.timestamp / 1 days;
    }
}
