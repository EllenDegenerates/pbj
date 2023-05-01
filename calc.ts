import { BigNumber, ethers } from "ethers";
import { parseUnits } from "@ethersproject/units";

const BN_18 = parseUnits("1");

type UniV2Data = {
    amountOut?: BigNumber;
    amountIn?: BigNumber;
    newReserveA: BigNumber;
    newReserveB: BigNumber;
};



/**
 * 
 * Calculates the amount of token A to be supplied given the desired amount of token B to be received
 * x * y = k
 *
 * @param {BigNumber} bOut - The desired amount of token B to be received
 * @param {BigNumber} reserveA - The current reserve of token A in the liquidity pool
 * @param {BigNumber} reserveB - The current reserve of token B in the liquidity pool
 * @returns {UniV2Data} - The amount of token A to be supplied and the new reserves of token A and B
 */
export const getUniv2DataGivenOut = (
  bOut: BigNumber,
  reserveA: BigNumber,
  reserveB: BigNumber
): UniV2Data => {
  // Underflow: Ensure newReserveB is at least 1, to prevent negative reserve values
  let newReserveB = reserveB.sub(bOut);
  if (newReserveB.lt(0) || reserveB.gt(reserveB)) {
    newReserveB = ethers.BigNumber.from(1);
  }

  // Calculate the amount of token A needed to supply, considering the 0.3% fee (1000 / 997)
  const numerator = reserveA.mul(bOut).mul(1000);
  const denominator = newReserveB.mul(997);
  const aAmountIn = numerator.div(denominator).add(ethers.constants.One);

  // Overflow: Ensure newReserveA doesn't overflow the max integer value
  let newReserveA = reserveA.add(aAmountIn);
  if (newReserveA.lt(reserveA)) {
    newReserveA = ethers.constants.MaxInt256;
  }

  // Return the amount of token A to be supplied, and the new reserves for both tokens
  return {
    amountIn: aAmountIn,
    newReserveA,
    newReserveB,
  };
};


/**
 * Calculate the amount of output tokens (bOut) received when providing input tokens (aIn) to a Uniswap v2
 * liquidity pool, as well as the updated reserves after the swap.
 * x * y = k
 * @function
 * @param {BigNumber} aIn - The amount of input tokens (A)
 * @param {BigNumber} reserveA - The current reserve of token A in the liquidity pool
 * @param {BigNumber} reserveB - The current reserve of token B in the liquidity pool
 * @returns {UniV2Data} - The output amount (bOut) and the updated reserves (newReserveA, newReserveB)
 */

export const getUniv2DataGivenIn = (
    aIn: BigNumber,
    reserveA: BigNumber,
    reserveB: BigNumber
  ): UniV2Data => {
    // Calculate the input amount with a 0.3% fee (997 parts of 1000)
    const aInWithFee = aIn.mul(997);
    // Calculate the numerator for the output amount formula: aInWithFee * reserveB
    const numerator = aInWithFee.mul(reserveB);
    // Calculate the denominator for the output amount formula: aInWithFee + (reserveA * 1000)
    const denominator = aInWithFee.add(reserveA.mul(1000));
    // Calculate the output amount (bOut) by dividing the numerator by the denominator
    const bOut = numerator.div(denominator);
  
    // Update reserveB by subtracting the output amount (bOut)
    let newReserveB = reserveB.sub(bOut);
    // If the updated reserveB is negative or greater than the initial reserveB,
    // set it to 1 to avoid underflow or overflow issues.
    if (newReserveB.lt(0) || newReserveB.gt(reserveB)) {
      newReserveB = ethers.BigNumber.from(1);
    }
  
    // Update reserveA by adding the input amount (aIn)
    let newReserveA = reserveA.add(aIn);
    // If the updated reserveA is less than the initial reserveA,
    // set it to the maximum possible value to avoid overflow issues.
    if (newReserveA.lt(reserveA)) {
      newReserveA = ethers.constants.MaxInt256;
    }
  
    // Return the output amount (bOut) and the updated reserves
    return {
      amountOut: bOut,
      newReserveA,
      newReserveB,
    };
  };
  

/**
 * Perform a binary search to find the value in the search range that satisfies the pass condition.
 * @function
 * @param {BigNumber} left - The left bound of the search range
 * @param {BigNumber} right - The right bound of the search range
 * @param {(mid: BigNumber) => BigNumber} calculateF - The calculate function
 * @param {(out: BigNumber) => boolean} passConditionF - The pass condition function
 * @param {BigNumber} [tolerance=parseUnits("0.01")] - The tolerance for the binary search
 * @returns {BigNumber} - The value that satisfies the pass condition within the tolerance range
 */
export const binarySearch = (
    left: BigNumber,
    right: BigNumber,
    calculateF: (mid: BigNumber) => BigNumber,
    passConditionF: (out: BigNumber) => boolean,
    tolerance: BigNumber = parseUnits("0.01")
): BigNumber => {
    // If the difference between the left and right bounds is greater than the tolerance,
    // continue searching.
    if (right.sub(left).gt(tolerance.mul(right.add(left).div(2)).div(BN_18))) {
        const mid = right.add(left).div(2);
        const out = calculateF(mid);

        // If the pass condition is satisfied, search the right half of the range.
        if (passConditionF(out)) {
            return binarySearch(mid, right, calculateF, passConditionF, tolerance);
        }

        // If the pass condition is not satisfied, search the left half of the range.
        return binarySearch(left, mid, calculateF, passConditionF, tolerance);
    }

    // If the difference between the left and right bounds is within the tolerance, return
    // the midpoint of the bounds.
    const ret = right.add(left).div(2);
    if (ret.lt(0)) {
        return ethers.constants.Zero;
    }

    return ret;
};

/**
 * Calculate the optimal amount of WETH to use in a sandwich attack.
 * @function
 * @param {BigNumber} userAmountIn - The user's WETH input amount
 * @param {BigNumber} userMinRecvToken - The user's minimum acceptable output amount
 * @param {BigNumber} reserveWeth - The current reserve of WETH in the liquidity pool
 * @param {BigNumber} reserveToken - The current reserve of the target token in the liquidity pool
 * @returns {BigNumber} - The optimal WETH input amount for the attacker's frontrun transaction
 */
export const calcSandwichOptimalIn = (
    userAmountIn: BigNumber,
    userMinRecvToken: BigNumber,
    reserveWeth: BigNumber,
    reserveToken: BigNumber
): BigNumber => {
    // Function to calculate the victim's output amount given an attacker's input amount.
    const calcF = (amountIn: BigNumber): BigNumber => {
        const frontrunState: UniV2Data = getUniv2DataGivenIn(
            amountIn,
            reserveWeth,
            reserveToken
        );
        const victimState: UniV2Data = getUniv2DataGivenIn(
            userAmountIn,
            frontrunState.newReserveA,
            frontrunState.newReserveB
        );
        return victimState.amountOut!;
    };

    // Function to check if the victim's output amount meets their minimum acceptable amount.
    const passF = (amountOut: BigNumber): boolean => amountOut.gte(userMinRecvToken);

    // Define the search range for the binary search.
    const lowerBound = parseUnits("0");
    const upperBound = parseUnits("100");

    // Perform the binary search to find the optimal WETH input amount for the attacker's
    // frontrun transaction.
    const optimalWethIn = binarySearch(lowerBound, upperBound, calcF, passF);

    return optimalWethIn;
};

/**
 * Calculate the state of a sandwich attack, including revenue, optimal input amounts, reserves,
 * and the state of each transaction (frontrun, victim, backrun).
 * @function
 * @param {BigNumber} optimalSandwichWethIn - The optimal WETH input amount for the attacker's frontrun transaction
 * @param {BigNumber} userWethIn - The user's WETH input amount
 * @param {BigNumber} userMinRecv - The user's minimum acceptable output amount
 * @param {BigNumber} reserveWeth - The current reserve of WETH in the liquidity pool
 * @param {BigNumber} reserveToken - The current reserve of the target token in the liquidity pool
 * @returns {Object|null} - The sandwich attack state or null if the victim's output amount is less than their minimum acceptable amount
 */
export const calcSandwichState = (
    optimalSandwichWethIn: BigNumber,
    userWethIn: BigNumber,
    userMinRecv: BigNumber,
    reserveWeth: BigNumber,
    reserveToken: BigNumber
) => {
    // Calculate the state of the frontrun transaction by providing the optimal WETH input amount and the current reserves.
    const frontrunState: UniV2Data = getUniv2DataGivenIn(
        optimalSandwichWethIn,
        reserveWeth,
        reserveToken
    );

    // Calculate the state of the victim's transaction, given the user's WETH input and the
    // new reserves after the frontrun transaction.
    const victimState: UniV2Data = getUniv2DataGivenIn(
        userWethIn,
        frontrunState.newReserveA,
        frontrunState.newReserveB
    );

    // Calculate the state of the backrun transaction by providing the output amount from
    // the frontrun transaction and the new reserves after the victim's transaction.
    const backrunState: UniV2Data = getUniv2DataGivenIn(
        frontrunState.amountOut!,
        victimState.newReserveB,
        victimState.newReserveA
    );

    // Check if the victim's output amount is less than their minimum acceptable amount.
    if (victimState.amountOut!.lt(userMinRecv)) {
        return null;
    }

    // Return the sandwich attack state, including revenue, optimal input amounts, reserves,
    // and the state of each transaction (frontrun, victim, backrun).
    return {
        revenue: backrunState.amountOut!.sub(optimalSandwichWethIn),
        optimalSandwichWethIn,
        userAmountIn: userWethIn,
        userMinRecv,
        reserveState: {
            reserveWeth,
            reserveToken,
        },
        frontrun: frontrunState,
        victim: victimState,
        backrun: backrunState,
    };
};



/**
 * Calculate the base fee for the next block based on the current block's gas usage.
 *
 * @function
 * @param {ethers.providers.Block} curBlock - The current block object
 * @returns {ethers.BigNumber} - The calculated base fee for the next block
 */
export const calcNextBlockBaseFee = (curBlock: ethers.providers.Block): ethers.BigNumber => {
    // Extract the current block's base fee, gas used, and gas limit
    const baseFee = curBlock.baseFeePerGas!;
    const gasUsed = curBlock.gasUsed;
    const targetGasUsed = curBlock.gasLimit.div(2);

    // Calculate the difference between the actual gas used and the target gas used
    const delta = gasUsed.sub(targetGasUsed);
  
    // Calculate the new base fee for the next block using the EIP-1559 formula
    const newBaseFee = baseFee.add(
      baseFee.mul(delta).div(targetGasUsed).div(ethers.BigNumber.from(8))
    );
  
    // This creates a slightly different hash for each calculation, which can be useful in certain scenarios
    const rand = Math.floor(Math.random() * 10);
    return newBaseFee.add(rand);
};

  