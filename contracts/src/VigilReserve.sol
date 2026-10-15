// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20Min, IPriceFeed, ITroveManager, IBorrowerOperationsSignatures} from "./interfaces/IMezo.sol";

/// @title VigilReserve
/// @notice Holds a borrower's MUSD reserve and spends it on a rescue the borrower pre-signed.
///
/// A rescue goes through Mezo's own BorrowerOperationsSignatures.repayMUSDWithSignature, which
/// checks the borrower's EIP-712 signature over (amount, borrower, nonce, deadline) and burns the
/// MUSD from this contract. Vigil therefore cannot change the amount, the borrower or the deadline.
///
/// This contract adds two guards on top:
///   1. the trove's ICR, at a fresh oracle price, must be below the trigger the borrower set;
///   2. the borrower's own reserve must cover the amount.
///
/// It has no owner and no keeper allow-list: anyone may submit a rescue, because a rescue can only
/// ever spend the borrower's own reserve to repay the borrower's own debt, and only below the
/// borrower's trigger.
contract VigilReserve {
    IERC20Min public immutable musd;
    IPriceFeed public immutable priceFeed;
    ITroveManager public immutable troveManager;
    IBorrowerOperationsSignatures public immutable borrowerOpsSig;

    /// Lowest trigger a borrower may set: the 110% liquidation line.
    uint256 public constant MIN_TRIGGER_ICR = 1.1e18;
    uint8 internal constant TROVE_ACTIVE = 1;

    /// MUSD held for each borrower.
    mapping(address => uint256) public reserveOf;
    /// ICR (1e18 = 100%) below which a rescue is allowed. Zero means rescues are off.
    mapping(address => uint256) public triggerOf;

    event Deposited(address indexed borrower, address indexed from, uint256 amount);
    event Withdrawn(address indexed borrower, address indexed to, uint256 amount);
    event TriggerSet(address indexed borrower, uint256 triggerICR);
    event Rescued(
        address indexed borrower,
        address indexed keeper,
        uint256 amount,
        uint256 price,
        uint256 icrBefore,
        uint256 icrAfter
    );

    error ZeroAmount();
    error TriggerTooLow(uint256 trigger);
    error RescueOff();
    error TroveNotActive();
    error ReserveTooSmall(uint256 reserve, uint256 amount);
    error AboveTrigger(uint256 icr, uint256 trigger);
    error BurnMismatch(uint256 expected, uint256 actual);
    error TransferFailed();

    constructor(address musd_, address priceFeed_, address troveManager_, address borrowerOpsSig_) {
        musd = IERC20Min(musd_);
        priceFeed = IPriceFeed(priceFeed_);
        troveManager = ITroveManager(troveManager_);
        borrowerOpsSig = IBorrowerOperationsSignatures(borrowerOpsSig_);
    }

    // ------------------------------------------------------------------ borrower actions

    /// Add MUSD to `borrower`'s reserve. Anyone may top up anyone's reserve.
    function deposit(address borrower, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        reserveOf[borrower] += amount;
        if (!musd.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Deposited(borrower, msg.sender, amount);
    }

    /// Withdraw from your own reserve at any time.
    function withdraw(uint256 amount, address to) external {
        if (amount == 0) revert ZeroAmount();
        uint256 reserve = reserveOf[msg.sender];
        if (reserve < amount) revert ReserveTooSmall(reserve, amount);
        reserveOf[msg.sender] = reserve - amount;
        if (!musd.transfer(to, amount)) revert TransferFailed();
        emit Withdrawn(msg.sender, to, amount);
    }

    /// Set the ICR below which a rescue may run. Pass 0 to switch rescues off.
    function setTrigger(uint256 triggerICR) external {
        if (triggerICR != 0 && triggerICR <= MIN_TRIGGER_ICR) revert TriggerTooLow(triggerICR);
        triggerOf[msg.sender] = triggerICR;
        emit TriggerSet(msg.sender, triggerICR);
    }

    // ------------------------------------------------------------------ rescue

    /// Spend `amount` of `borrower`'s reserve on the repay they signed.
    /// Reverts if the oracle is stale, the trove is healthy, the reserve is short,
    /// or Mezo rejects the signature (wrong amount, expired, or nonce already used).
    function rescue(
        address borrower,
        uint256 amount,
        uint256 deadline,
        bytes calldata signature,
        address upperHint,
        address lowerHint
    ) external {
        (uint256 price, uint256 icrBefore) = _checkAndDebit(borrower, amount);

        uint256 balanceBefore = musd.balanceOf(address(this));
        borrowerOpsSig.repayMUSDWithSignature(amount, upperHint, lowerHint, borrower, signature, deadline);
        uint256 burned = balanceBefore - musd.balanceOf(address(this));
        if (burned != amount) revert BurnMismatch(amount, burned);

        emit Rescued(borrower, msg.sender, amount, price, icrBefore, troveManager.getCurrentICR(borrower, price));
    }

    /// Vigil's guards, then the reserve debit (effects before the external repay).
    function _checkAndDebit(address borrower, uint256 amount) internal returns (uint256 price, uint256 icr) {
        uint256 trigger = triggerOf[borrower];
        if (trigger == 0) revert RescueOff();
        if (troveManager.getTroveStatus(borrower) != TROVE_ACTIVE) revert TroveNotActive();

        uint256 reserve = reserveOf[borrower];
        if (reserve < amount) revert ReserveTooSmall(reserve, amount);

        price = priceFeed.fetchPrice(); // reverts on a stale oracle
        icr = troveManager.getCurrentICR(borrower, price);
        if (icr >= trigger) revert AboveTrigger(icr, trigger);

        reserveOf[borrower] = reserve - amount;
    }

    // ------------------------------------------------------------------ views

    /// Whether a rescue for `borrower` of `amount` would pass Vigil's own guards right now.
    /// Mezo's signature checks are not simulated here; keepers should eth_call `rescue` first.
    function canRescue(address borrower, uint256 amount) external view returns (bool ok, uint256 icr, uint256 price) {
        uint256 trigger = triggerOf[borrower];
        if (trigger == 0 || reserveOf[borrower] < amount) return (false, 0, 0);
        if (troveManager.getTroveStatus(borrower) != TROVE_ACTIVE) return (false, 0, 0);
        price = priceFeed.fetchPrice();
        icr = troveManager.getCurrentICR(borrower, price);
        ok = icr < trigger;
    }
}
