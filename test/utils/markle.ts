import { ethers } from "hardhat";
import { MerkleTree } from "merkletreejs";
import Keccak256 from "keccak256";

export class Merkle {
  tree: MerkleTree;
  addressList: string[];
  constructor(address: string, adddressList?: string[]) {
    this.addressList = adddressList
      ? adddressList
      : [
          ...Array.from({ length: 10 }, (_, index) =>
            ethers.Wallet.createRandom(
              ethers.provider
            ).address.toLocaleLowerCase()
          ),
          address.toLocaleLowerCase(),
        ];
    const leaves = this.addressList.map((x) => Keccak256(x));
    this.tree = new MerkleTree(leaves, Keccak256, {
      sortPairs: true,
    });
  }

  getRoot() {
    return "0x" + this.tree.getRoot().toString("hex");
  }

  getProof(address: string) {
    return this.tree.getHexProof(Keccak256(address.toLocaleLowerCase()));
  }
}
