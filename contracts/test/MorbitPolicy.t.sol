// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {PackedUserOperation} from "@zerodev/kernel/interfaces/PackedUserOperation.sol";
import {SIG_VALIDATION_FAILED_UINT, SIG_VALIDATION_SUCCESS_UINT} from "@zerodev/kernel/types/Constants.sol";
import {MorbitStorage} from "../src/MorbitStorage.sol";
import {MorbitPolicy} from "../src/MorbitPolicy.sol";
import {MorbitHook} from "../src/MorbitHook.sol";

contract MorbitPolicyTest is Test {
    bytes4 internal constant KERNEL_EXECUTE_SELECTOR = 0xe9ae5c53;
    bytes4 internal constant ERC20_TRANSFER_SELECTOR = 0xa9059cbb;
    bytes32 internal constant PERMISSION_ID = keccak256("morbit-agent");

    address internal constant ACCOUNT = address(0xA11CE);
    address internal constant AGENT = address(0xB0B);
    address internal constant TARGET = address(0xCAFE);
    address internal constant TOKEN = address(0xBEEF);

    MorbitStorage internal storageContract;
    MorbitPolicy internal policy;
    MorbitHook internal hook;

    function setUp() public {
        storageContract = new MorbitStorage(address(this), 1 ether, 0.4 ether);
        policy = new MorbitPolicy(storageContract);
        hook = new MorbitHook(storageContract, policy);
        storageContract.configureModules(address(policy), address(hook));

        storageContract.authorizeAgent(AGENT);
        storageContract.allowToken(address(0));
        storageContract.allowContract(TARGET);

        vm.prank(ACCOUNT);
        policy.onInstall(abi.encodePacked(PERMISSION_ID, AGENT));
    }

    function testBatchCallRejected() public {
        bytes32 batchMode = bytes32(uint256(1) << 248);
        assertEq(_check(_execute(batchMode, TARGET, 0.1 ether, "")), SIG_VALIDATION_FAILED_UINT);
    }

    function testDelegatecallRejected() public {
        bytes32 delegatecallMode = bytes32(uint256(0xff) << 248);
        assertEq(_check(_execute(delegatecallMode, TARGET, 0, "")), SIG_VALIDATION_FAILED_UINT);
    }

    function testUnknownSelectorRejected() public {
        assertEq(_check(hex"deadbeef"), SIG_VALIDATION_FAILED_UINT);
    }

    function testNonAllowlistedTokenRejected() public {
        storageContract.allowContract(TOKEN);
        bytes memory transferCall = abi.encodeWithSelector(ERC20_TRANSFER_SELECTOR, address(0xD00D), 0.2 ether);
        assertEq(_check(_execute(bytes32(0), TOKEN, 0, transferCall)), SIG_VALIDATION_FAILED_UINT);
    }

    function testExceedsDailyLimitRejected() public {
        vm.prank(address(hook));
        storageContract.recordSpend(ACCOUNT, 0.8 ether);
        assertEq(_check(_execute(bytes32(0), TARGET, 0.3 ether, "")), SIG_VALIDATION_FAILED_UINT);
    }

    function testValidTransactionPasses() public {
        assertEq(_check(_execute(bytes32(0), TARGET, 0.2 ether, "")), SIG_VALIDATION_SUCCESS_UINT);
    }

    function testHookRecordsValidatedExecutionForInstalledAccount() public {
        vm.prank(ACCOUNT);
        hook.onInstall("");

        bytes memory payload = abi.encode(bytes32(0), abi.encodePacked(TARGET, uint256(0.2 ether), bytes("")));
        vm.prank(ACCOUNT);
        bytes memory context = hook.preCheck(address(0), 0, payload);

        vm.prank(ACCOUNT);
        hook.postCheck(context);

        assertEq(storageContract.currentDailySpent(ACCOUNT), 0.2 ether);
    }

    function _check(bytes memory callData) private returns (uint256) {
        PackedUserOperation memory userOp = PackedUserOperation({
            sender: ACCOUNT,
            nonce: 0,
            initCode: "",
            callData: callData,
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: "",
            signature: ""
        });
        vm.prank(ACCOUNT);
        return policy.checkUserOpPolicy(PERMISSION_ID, userOp);
    }

    function _execute(bytes32 mode, address target, uint256 value, bytes memory callData)
        private
        pure
        returns (bytes memory)
    {
        return abi.encodeWithSelector(KERNEL_EXECUTE_SELECTOR, mode, abi.encodePacked(target, value, callData));
    }
}
