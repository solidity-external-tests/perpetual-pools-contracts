// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "../abstract/AbstractLeveragedPool.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/*
@title The pool controller contract
*/
contract LeveragedPool is AbstractLeveragedPool, AccessControl {
  constructor(address _quoteToken) {
    quoteToken = _quoteToken;
  }

  // #### Roles
  bytes32 public constant UPDATER = keccak256("UPDATER");
  bytes32 public constant FEE_HOLDER = keccak256("FEE_HOLDER");

  // #### Modifiers
  /**
    @notice Requires caller to have been granted the UPDATER role. Use this for functions that should be restricted to the PoolKeeper
     */
  modifier onlyUpdater {
    require(hasRole(UPDATER, msg.sender));
    _;
  }

  /** 
  @notice Requires caller to have been granted the FEE_HOLDER role.
  */
  modifier onlyFeeHolder {
    require(hasRole(FEE_HOLDER, msg.sender));
    _;
  }
}