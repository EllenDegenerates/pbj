import { ethers } from "ethers";

/**
 * Checks if a string matches another string or any element in an array of strings.
 * @param {string} a - The input string to match against.
 * @param {string[] | string} b - The string or array of strings to compare with.
 * @param {boolean} caseInsensitive - If true, the comparison will be case-insensitive.
 * @returns {boolean} True if there's a match, false otherwise.
 */
export const match = (a: string, b: string[] | string, caseInsensitive: boolean): boolean => {
  if (!a) return false;

  if (Array.isArray(b)) {
    if (caseInsensitive) {
      return b.map((x) => x.toLowerCase()).includes(a.toLowerCase());
    }

    return b.includes(a);
  }

  if (caseInsensitive) {
    return a.toLowerCase() === b.toLowerCase();
  }

  return a === b;
};

/**
 * Recursively replaces BigNumber instances with their string or hexadecimal representation.
 * @param {any} o - The input object.
 * @param {boolean} toHex - If true, the BigNumber values will be converted to hexadecimal.
 * @returns {any} The transformed object.
 */
export const stringifyBN = (o: any, toHex: boolean): any => {
  if (o === null || o === undefined) {
    return o;
  } else if (typeof o == "bigint" || o.eq !== undefined) {
    if (toHex) {
      return o.toHexString();
    }
    return o.toString();
  } else if (Array.isArray(o)) {
    return o.map((x) => stringifyBN(x, toHex));
  } else if (typeof o == "object") {
    const res: { [key: string]: any } = {};
    const keys = Object.keys(o);
    keys.forEach((k) => {
      res[k] = stringifyBN(o[k], toHex);
    });
    return res;
  } else {
    return o;
  }
};

/**
 * Converts a BigNumber to an RPC-compatible hex string.
 * @param {ethers.BigNumber} bn - The input BigNumber.
 * @returns {string} The RPC-compatible hex string.
 */
export const toRpcHexString = (bn: ethers.BigNumber): string => {
  let val = bn.toHexString();
  val = "0x" + val.replace("0x", "").replace(/^0+/, "");

  if (val == "0x") {
    val = "0x0";
  }

  return val;
};

/**
 * Calculates the base fee for the next block based on the current block.
 * @param {ethers.providers.Block} curBlock - The current block information.
 * @returns {ethers.BigNumber} The base fee for the next block.
 */
export const calcNextBlockBaseFee = (curBlock: ethers.providers.Block): ethers.BigNumber => {
  const baseFee = curBlock.baseFeePerGas!;
  const gasUsed = curBlock.gasUsed;
  const targetGasUsed = curBlock.gasLimit.div(2);
  const delta = gasUsed.sub(targetGasUsed);

  const newBaseFee = baseFee.add(
    baseFee.mul(delta).div(targetGasUsed).div(ethers.BigNumber.from(8))
  );

  // Add 0-9 wei so it becomes a different hash each time
  const rand = Math.floor(Math.random() * 10);
  return newBaseFee.add(rand);
};
