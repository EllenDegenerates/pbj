import { ethers } from "ethers";

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

// JSON.stringify from ethers.BigNumber is pretty horrendous
// So we have a custom stringify function
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

export const toRpcHexString = (bn: ethers.BigNumber): string => {
  let val = bn.toHexString();
  val = "0x" + val.replace("0x", "").replace(/^0+/, "");

  if (val == "0x") {
    val = "0x0";
  }

  return val;
};

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
