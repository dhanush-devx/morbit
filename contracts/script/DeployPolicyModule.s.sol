// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console2} from "forge-std/Script.sol";
import {MorbitStorage} from "../src/MorbitStorage.sol";
import {MorbitPolicy} from "../src/MorbitPolicy.sol";
import {MorbitHook} from "../src/MorbitHook.sol";

/// @notice Deploys and permanently wires the Morbit Kernel policy suite.
contract DeployPolicyModule is Script {
    uint256 internal constant DEFAULT_DAILY_LIMIT = 1 ether;
    uint256 internal constant DEFAULT_TX_LIMIT = 0.1 ether;

    function run() external returns (MorbitStorage storageContract, MorbitPolicy policy, MorbitHook hook) {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address owner = vm.envOr("OWNER_ADDRESS", deployer);

        vm.startBroadcast(deployerPrivateKey);
        storageContract = new MorbitStorage(owner, DEFAULT_DAILY_LIMIT, DEFAULT_TX_LIMIT);
        policy = new MorbitPolicy(storageContract);
        hook = new MorbitHook(storageContract, policy);
        storageContract.configureModules(address(policy), address(hook));
        vm.stopBroadcast();

        console2.log("MorbitStorage:", address(storageContract));
        console2.log("MorbitPolicy:", address(policy));
        console2.log("MorbitHook:", address(hook));
        console2.log("Policy owner:", owner);
    }
}
