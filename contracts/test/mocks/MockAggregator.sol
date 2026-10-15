// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// Stand-in for Mezo's oracle at 0x7b7c…0015, which does not work on a local fork.
/// Etched over that address in tests so PriceFeed.fetchPrice() reads from it.
contract MockAggregator {
    int256 public price;
    uint256 public staleBy; // seconds to subtract from block.timestamp in updatedAt

    function set(int256 price_) external {
        price = price_;
    }

    function setStaleBy(uint256 staleBy_) external {
        staleBy = staleBy_;
    }

    function decimals() external pure returns (uint8) {
        return 18;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        uint256 updatedAt = block.timestamp - staleBy;
        return (1, price, updatedAt, updatedAt, 1);
    }
}
